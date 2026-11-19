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

export const EXTENDSCRIPT_RUNTIME_SNIPPET = `
if (typeof JSON === "undefined") { JSON = {}; }
function __mcpJsonSeenContains(arr, value) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === value) return true;
  }
  return false;
}
var __mcpJsonEscapeMap = {
  '"': '\\\\"',
  '\\\\': '\\\\\\\\',
  '\\b': '\\\\b',
  '\\t': '\\\\t',
  '\\n': '\\\\n',
  '\\f': '\\\\f',
  '\\r': '\\\\r',
  '\\u2028': '\\\\u2028',
  '\\u2029': '\\\\u2029'
};
function __mcpJsonEscapeString(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/["\\\\\\x00-\\x1f\\u2028\\u2029]/g, function(ch) {
    var mapped = __mcpJsonEscapeMap[ch];
    if (typeof mapped === "string") return mapped;
    var hex = ch.charCodeAt(0).toString(16);
    return "\\\\u" + ("0000" + hex).slice(-4);
  });
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

export const DEFAULT_COM_PROG_IDS = [
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

function escapeExtendScriptLiteral(str) {
    return JSON.stringify(String(str ?? ''))
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

export class ScriptExecutor {
    // Cache a COM Application instance for Windows to avoid repeated activation
    static _winApp = null;

    static isWindows() {
        return process.platform === 'win32';
    }

    /**
     * Build wrapped ExtendScript code enforcing non-interactive execution,
     * ES3 JSON helpers, and optional redraw suppression / fast undo.
     * @param {string} script
     * @param {{ disableRedraw?: boolean, fastUndo?: boolean, undoName?: string }} [options]
     * @returns {string}
     */
    static buildWrappedScript(script, options = {}) {
        const {
            disableRedraw = false,
            fastUndo = false,
            undoName = 'MCP Operation'
        } = options || {};
        const body = String(script ?? '');

        if (!disableRedraw && !fastUndo) {
            return [
                'try {',
                '  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
                EXTENDSCRIPT_RUNTIME_SNIPPET,
                body,
                '} catch (e) {',
                '  "Error: " + e.message;',
                '}'
            ].join('\n');
        }

        const safeUndoName = (typeof undoName === 'string' && undoName.trim())
            ? undoName.trim()
            : 'MCP Operation';
        const scriptLiteral = escapeExtendScriptLiteral(body);
        // Use UndoModes.ENTIRE_SCRIPT instead of FAST_ENTIRE_SCRIPT to avoid native
        // Adobe InDesign 2025 crashes during complex document/master/table mutations.
        const invokeLine = fastUndo
            ? `  __mcpScriptResult = app.doScript(${scriptLiteral}, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, ${escapeExtendScriptLiteral(safeUndoName)});`
            : `  __mcpScriptResult = eval(${scriptLiteral});`;

        const lines = [
            'var __mcpScriptResult;',
        ];
        if (disableRedraw) {
            lines.push(
                'var __mcpPrevRedraw;',
                'var __mcpHasPrevRedraw = false;'
            );
        }
        lines.push(
            'try {',
            '  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
            EXTENDSCRIPT_RUNTIME_SNIPPET
        );
        if (disableRedraw) {
            lines.push(
                '  try {',
                '    __mcpPrevRedraw = app.scriptPreferences.enableRedraw;',
                '    __mcpHasPrevRedraw = true;',
                '    app.scriptPreferences.enableRedraw = false;',
                '  } catch (__mcpRedrawErr) {}'
            );
        }
        lines.push(
            invokeLine,
            '} catch (e) {',
            '  __mcpScriptResult = "Error: " + (e && e.message ? e.message : e);',
            '}'
        );
        if (disableRedraw) {
            lines.push(
                'finally {',
                '  if (__mcpHasPrevRedraw) {',
                '    try { app.scriptPreferences.enableRedraw = __mcpPrevRedraw; } catch (__mcpRestoreErr) {}',
                '  }',
                '}'
            );
        }
        lines.push('__mcpScriptResult;');
        return lines.join('\n');
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

    static _getComProgIdCachePath(env = process.env) {
        const localAppData = typeof env?.LOCALAPPDATA === 'string' ? env.LOCALAPPDATA.trim() : '';
        if (localAppData) {
            return path.join(localAppData, 'indesign-cli', 'state', 'com-progid.json');
        }
        try {
            const home = os.homedir();
            if (home) {
                return path.join(home, 'AppData', 'Local', 'indesign-cli', 'state', 'com-progid.json');
            }
        } catch {}
        return null;
    }

    static _readCachedComProgId(options = {}) {
        const cachePath = options.cachePath || this._getComProgIdCachePath(options.env);
        if (!cachePath) return null;
        try {
            if (!fs.existsSync(cachePath)) return null;
            const raw = fs.readFileSync(cachePath, 'utf8').trim();
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const candidate = typeof parsed === 'string'
                ? parsed
                : (parsed && typeof parsed === 'object' ? (parsed.progId || parsed.progID) : null);
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate.trim();
            }
        } catch {}
        return null;
    }

    static _writeCachedComProgId(progId, options = {}) {
        if (typeof progId !== 'string' || !progId.trim()) return;
        const cachePath = options.cachePath || this._getComProgIdCachePath(options.env);
        if (!cachePath) return;
        try {
            fs.mkdirSync(path.dirname(cachePath), { recursive: true });
            fs.writeFileSync(
                cachePath,
                JSON.stringify({ progId: progId.trim(), updatedAt: new Date().toISOString() }),
                'utf8'
            );
        } catch {
            // Ignore cache write errors so COM activation never fails
        }
    }

    /**
     * Build ordered Windows COM ProgID candidates:
     * 1) process.env.INDESIGN_CLI_COM_PROGID (if set)
     * 2) Cached ProgID from %LOCALAPPDATA%\indesign-cli\state\com-progid.json
     * 3) Full 14-item fallback list
     */
    static getWindowsComProgIds(options = {}) {
        const env = options.env || process.env;
        const cachedProgId = Object.prototype.hasOwnProperty.call(options, 'cachedProgId')
            ? options.cachedProgId
            : this._readCachedComProgId(options);
        const seen = new Set();
        const ordered = [];
        const pushUnique = (id) => {
            if (typeof id !== 'string') return;
            const trimmed = id.trim();
            if (!trimmed || seen.has(trimmed)) return;
            seen.add(trimmed);
            ordered.push(trimmed);
        };

        pushUnique(env?.INDESIGN_CLI_COM_PROGID);
        pushUnique(cachedProgId);
        for (const id of DEFAULT_COM_PROG_IDS) {
            pushUnique(id);
        }
        return ordered;
    }

    static _resolveWindowsInDesignApp(WinaxObject, options = {}) {
        const cachedProgId = this._readCachedComProgId(options);
        const progIDs = this.getWindowsComProgIds({ ...options, cachedProgId });

        let lastError;
        for (const id of progIDs) {
            try {
                const app = new WinaxObject(id);
                if (id !== cachedProgId) {
                    this._writeCachedComProgId(id, options);
                }
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

        const app = this._resolveWindowsInDesignApp(WinaxObject);
        this._winApp = app;
        return app;
    }

    /**
     * Execute InDesign ExtendScript/JavaScript code
     * - On Windows: Use COM DoScript via winax
     * - On macOS: Use AppleScript to run the temp JSX file
     * @param {string} script - The ExtendScript to execute
     * @param {{ disableRedraw?: boolean, fastUndo?: boolean, undoName?: string }} [options]
     * @returns {string} The result of the script execution
     */
    static async executeInDesignScript(script, options = {}) {
        if (this.isWindows()) {
            return await this._executeInDesignScriptWindows(script, options);
        }
        // macOS path (AppleScript + temp JSX file)
        let tempDir;
        let tempScriptPath;
        try {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indesign-mcp-'));
            tempScriptPath = path.join(tempDir, 'script.jsx');

            // Force non-interactive (headless) execution where possible
            const wrapped = this.buildWrappedScript(script, options);
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
     * @param {{ disableRedraw?: boolean, fastUndo?: boolean, undoName?: string }} [options]
     * @returns {string} The result of the script execution.
     */
    static async executeInDesignScriptFile(filePath, options = {}) {
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
        return await this.executeInDesignScript(wrapper, options);
    }

    /**
     * Windows: Execute via COM DoScript
     */
    static async _executeInDesignScriptWindows(script, options = {}) {
        try {
            const app = this._getWindowsInDesignApp();
            // Wrap to enforce non-interactive mode, optional redraw/undo controls, and basic error capture
            const wrapped = this.buildWrappedScript(script, options);
            // ScriptLanguage.JAVASCRIPT (numeric enum for COM environments)
            const ScriptLanguage_JAVASCRIPT = 1246973031;
            const result = app.DoScript(wrapped, ScriptLanguage_JAVASCRIPT);
            return (result === undefined || result === null) ? '' : String(result);
        } catch (error) {
            throw new Error(`Windows COM execution failed: ${error.message}`);
        }
    }
}
