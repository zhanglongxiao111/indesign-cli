/**
 * Core script execution functionality (macOS AppleScript + Windows COM)
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENDSCRIPT_RUNTIME_SNIPPET = `
if (typeof JSON === "undefined") { JSON = {}; }
function __mcpJsonSeenContains(arr, value) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === value) return true;
  }
  return false;
}
function __mcpJsonEscapeString(str) {
  if (str === null || str === undefined) return "";
  var result = "";
  var backslash = String.fromCharCode(92);
  for (var i = 0; i < str.length; i++) {
    var ch = str.charAt(i);
    var code = str.charCodeAt(i);
    if (code === 34) {
      result += backslash + '"';
    } else if (code === 92) {
      result += backslash + backslash;
    } else if (code === 8) {
      result += backslash + "b";
    } else if (code === 9) {
      result += backslash + "t";
    } else if (code === 10) {
      result += backslash + "n";
    } else if (code === 12) {
      result += backslash + "f";
    } else if (code === 13) {
      result += backslash + "r";
    } else if (code === 0x2028 || code === 0x2029) {
      result += backslash + "u" + code.toString(16);
    } else if (code < 32) {
      var hex = code.toString(16);
      result += backslash + "u" + ("0000" + hex).slice(-4);
    } else {
      result += ch;
    }
  }
  return result;
}
function __mcpJsonSerialize(value) {
  var seen = [];
  function serialize(v) {
    if (v === null) return "null";
    var t = typeof v;
    if (t === "number" || t === "boolean") return String(v);
    if (t === "string") return '"' + __mcpJsonEscapeString(v) + '"';
    if (v instanceof Array) {
      var arr = [];
      for (var i = 0; i < v.length; i++) arr.push(serialize(v[i]));
      return "[" + arr.join(",") + "]";
    }
    if (t === "object") {
      if (__mcpJsonSeenContains(seen, v)) return '"[Circular]"';
      seen.push(v);
      var props = [];
      for (var key in v) {
        if (!v.hasOwnProperty(key)) continue;
        props.push('"' + __mcpJsonEscapeString(key) + '":' + serialize(v[key]));
      }
      seen.pop();
      return "{" + props.join(",") + "}";
    }
    return "null";
  }
  return serialize(value);
}
if (typeof JSON.stringify !== "function") {
  JSON.stringify = function(value) { return __mcpJsonSerialize(value); };
}
if (typeof JSON.parse !== "function") {
  JSON.parse = function(text) { return eval("(" + text + ")"); };
}
`;

export class ScriptExecutor {
    // Cache a COM Application instance for Windows to avoid repeated activation
    static _winApp = null;

    static isWindows() {
        return process.platform === 'win32';
    }

    /**
     * Execute AppleScript command (macOS only)
     * @param {string} script - The AppleScript to execute
     * @returns {string} The result of the AppleScript execution
     */
    static async executeAppleScript(script) {
        try {
            const result = execFileSync('osascript', ['-e', script], { encoding: 'utf8' });
            return result.trim();
        } catch (error) {
            throw new Error(`AppleScript execution failed: ${error.message}`);
        }
    }

    /**
     * Resolve a Windows COM InDesign.Application object via winax
     * Tries multiple ProgIDs to maximize compatibility across versions.
     */
    static _getWindowsInDesignApp() {
        if (!this.isWindows()) {
            throw new Error('Windows COM is only available on Windows');
        }
        if (this._winApp) return this._winApp;

        // Lazy-require winax to avoid issues on non-Windows platforms
        const requireCjs = createRequire(import.meta.url);
        let WinaxObject;
        try {
            const winax = requireCjs('winax');
            // winax provides constructor as winax.Object and also sets global.ActiveXObject in CJS
            WinaxObject = winax.Object || global.ActiveXObject;
        } catch (e) {
            throw new Error("Missing dependency 'winax'. Please run: npm install winax");
        }

        // Prefer explicit recent desktop ProgIDs, then generic, then older versions
        const progIDs = [
            // Newer/future first
            'InDesign.Application.2026',
            'InDesign.Application.CC.2026',
            // Current
            'InDesign.Application.2025',
            'InDesign.Application.CC.2025',
            // Generic
            'InDesign.Application',
            // Recent past
            'InDesign.Application.2024',
            'InDesign.Application.CC.2024',
            'InDesign.Application.2023',
            'InDesign.Application.CC.2023',
            'InDesign.Application.2022',
            'InDesign.Application.CC.2022',
            // InDesign Server fallbacks (least preferred)
            'InDesignServer.Application.2025',
            'InDesignServer.Application.2024',
            'InDesignServer.Application',
        ];

        let lastError;
        for (const id of progIDs) {
            try {
                const app = new WinaxObject(id);
                this._winApp = app;
                return app;
            } catch (err) {
                lastError = err;
            }
        }
        throw new Error(
            `Could not create InDesign COM object. Tried: ${progIDs.join(', ')}. ` +
            `Last error: ${lastError?.message || lastError}. ` +
            `Tips: Ensure Adobe InDesign desktop is installed and has been launched at least once, ` +
            `and that COM registration is available. If installation is fresh, try restarting or running once as administrator.`
        );
    }

    /**
     * Execute InDesign ExtendScript/JavaScript code
     * - On Windows: Use COM DoScript via winax
     * - On macOS: Use AppleScript to run the temp JSX file
     * @param {string} script - The ExtendScript to execute
     * @returns {string} The result of the script execution
     */
    static async executeInDesignScript(script) {
        if (this.isWindows()) {
            return await this._executeInDesignScriptWindows(script);
        }
        // macOS path (AppleScript + temp JSX file)
        let tempDir;
        let tempScriptPath;
        try {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indesign-mcp-'));
            tempScriptPath = path.join(tempDir, 'script.jsx');

            // Force non-interactive (headless) execution where possible
            const wrapped = [
                'try {',
                '  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
                EXTENDSCRIPT_RUNTIME_SNIPPET,
                script,
                '} catch (e) {',
                '  "Error: " + e.message;',
                '}'
            ].join('\n');
            fs.writeFileSync(tempScriptPath, wrapped, { encoding: 'utf8' });

            const escapedScriptPath = tempScriptPath.replace(/"/g, '\\"');
            const appleScript = `
        tell application "Adobe InDesign 2025"
          do script POSIX file "${escapedScriptPath}" language javascript
        end tell
      `;

            const result = await this.executeAppleScript(appleScript);

            return result;
        } catch (error) {
            throw new Error(`Error executing tool (macOS): ${error.message}`);
        } finally {
            if (tempDir) {
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
            }
        }
    }

    /**
     * Execute a JSX file directly so $.fileName, relative #include, etc. behave correctly.
     * @param {string} filePath - Absolute or relative path to the JSX file.
     * @returns {string} The result of the script execution.
     */
    static async executeInDesignScriptFile(filePath) {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('filePath must be a string');
        }
        const resolved = path.resolve(filePath);
        const escaped = resolved.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const wrapper = [
            'var __mcpResult = "";',
            'try {',
            `  var __mcpFile = File("${escaped}");`,
            '  if (!__mcpFile.exists) { throw new Error("JSX 文件不存在: " + __mcpFile.fsName); }',
            '  __mcpResult = app.doScript(__mcpFile, ScriptLanguage.JAVASCRIPT);',
            '} catch (e) {',
            '  __mcpResult = "Error: " + (e && e.message ? e.message : e);',
            '}',
            '__mcpResult;'
        ].join('\n');
        return await this.executeInDesignScript(wrapper);
    }

    /**
     * Windows: Execute via COM DoScript
     */
    static async _executeInDesignScriptWindows(script) {
        try {
            const app = this._getWindowsInDesignApp();
            // Wrap to enforce non-interactive mode and basic error capture
            const wrapped = [
                'try {',
                '  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
                EXTENDSCRIPT_RUNTIME_SNIPPET,
                script,
                '} catch (e) {',
                '  "Error: " + e.message;',
                '}'
            ].join('\n');
            // ScriptLanguage.JAVASCRIPT (numeric enum for COM environments)
            const ScriptLanguage_JAVASCRIPT = 1246973031;
            const result = app.DoScript(wrapped, ScriptLanguage_JAVASCRIPT);
            return (result === undefined || result === null) ? '' : String(result);
        } catch (error) {
            throw new Error(`Windows COM execution failed: ${error.message}`);
        }
    }
}
