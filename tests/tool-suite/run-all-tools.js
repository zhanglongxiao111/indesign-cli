import { spawn } from "child_process";
import { setTimeout as delay } from "timers/promises";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

import { contentToolDefinitions } from "../../src/types/toolDefinitionsContent.js";
import { documentToolDefinitions } from "../../src/types/toolDefinitionsDocument.js";
import { exportToolDefinitions } from "../../src/types/toolDefinitionsExport.js";
import { layerToolDefinitions } from "../../src/types/toolDefinitionsLayer.js";
import { masterSpreadToolDefinitions } from "../../src/types/toolDefinitionsMasterSpread.js";
import { pageToolDefinitions } from "../../src/types/toolDefinitionsPage.js";
import { pageItemGroupToolDefinitions } from "../../src/types/toolDefinitionsPageItemGroup.js";
import { spreadToolDefinitions } from "../../src/types/toolDefinitionsSpread.js";
import { utilityToolDefinitions } from "../../src/types/toolDefinitionsUtility.js";
import { bookToolDefinitions } from "../../src/types/toolDefinitionsBook.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.resolve(__dirname, "logs");
const OUTPUT_DIR = path.resolve(__dirname, "output");
const SAMPLE_IMAGE = path.resolve(__dirname, "../../docs/image/MCP_INSTRUCTIONS/1756796820062.png");
const SAMPLE_DATA_SOURCE = path.resolve(__dirname, "../test-data.csv");
const SAMPLE_SAVE_PATH = path.resolve(OUTPUT_DIR, "tool-suite-sample.indd");
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_PATH = path.join(LOG_DIR, `tool-suite-run-${TIMESTAMP}.json`);

await fs.mkdir(LOG_DIR, { recursive: true });
await fs.mkdir(OUTPUT_DIR, { recursive: true });

const TOOL_DEFINITION_ARRAYS = [
    contentToolDefinitions,
    documentToolDefinitions,
    exportToolDefinitions,
    layerToolDefinitions,
    masterSpreadToolDefinitions,
    pageToolDefinitions,
    pageItemGroupToolDefinitions,
    spreadToolDefinitions,
    utilityToolDefinitions,
    bookToolDefinitions,
].filter(Boolean);

function gatherToolDefinitions() {
    const map = new Map();
    for (const defArray of TOOL_DEFINITION_ARRAYS) {
        for (const def of defArray) {
            if (!def?.name) continue;
            if (!map.has(def.name)) {
                map.set(def.name, def);
            }
        }
    }
    return map;
}

const TOOL_DEFINITIONS = gatherToolDefinitions();

const CUSTOM_ARG_BUILDERS = new Map([
    ["create_document", () => ({ width: 210, height: 297, pages: 2, facingPages: true })],
    ["save_document", () => ({ filePath: SAMPLE_SAVE_PATH })],
    ["open_document", () => ({ filePath: SAMPLE_SAVE_PATH })],
    ["export_document_pdf", () => ({ filePath: path.resolve(OUTPUT_DIR, "export.pdf"), pages: "all", quality: "PRESS" })],
    ["export_pdf", () => ({ filePath: path.resolve(OUTPUT_DIR, "export.pdf"), pages: "all", quality: "PRESS" })],
    ["export_images", () => ({ outputPath: path.resolve(OUTPUT_DIR, "images"), format: "JPEG", resolution: 150 })],
    ["package_document", () => ({ outputPath: path.resolve(OUTPUT_DIR, "package"), includeFonts: false, includeLinks: false, includeProfiles: false })],
    ["place_file_on_spread", () => ({ spreadIndex: 0, filePath: SAMPLE_IMAGE, x: 40, y: 40, pageIndexWithinSpread: 1 })],
    ["place_xml_on_spread", () => ({ spreadIndex: 0, xmlElementName: "ToolSuiteElement", x: 60, y: 60, pageIndexWithinSpread: 1 })],
    ["place_file_on_page", () => ({ pageIndex: 0, filePath: SAMPLE_IMAGE, x: 30, y: 30 })],
    ["place_image", () => ({ filePath: SAMPLE_IMAGE, x: 50, y: 50, width: 80, height: 60 })],
    ["apply_color", () => ({ objectIndex: 0, colorName: "ToolSuiteColor", colorType: "FILL" })],
    ["apply_paragraph_style", () => ({ styleName: "ToolSuiteParagraphStyle", frameIndex: 0 })],
    ["apply_character_style", () => ({ styleName: "ToolSuiteCharacterStyle", frameIndex: 0 })],
    ["apply_object_style", () => ({ styleName: "ToolSuiteObjectStyle", itemType: "rectangle", itemIndex: 0 })],
    ["populate_table", () => ({ tableIndex: 0, data: [["Header 1", "Header 2"], ["Row 1", "Value"]] })],
    ["create_color_swatch", () => ({ name: "ToolSuiteColor", colorType: "PROCESS", red: 120, green: 90, blue: 200 })],
    ["create_paragraph_style", () => ({ name: "ToolSuiteParagraphStyle", fontFamily: "Arial\tRegular", fontSize: 12, textColor: "Black" })],
    ["create_character_style", () => ({ name: "ToolSuiteCharacterStyle", fontFamily: "Arial\tRegular", fontSize: 12, textColor: "Black" })],
    ["create_object_style", () => ({ name: "ToolSuiteObjectStyle", fillColor: "ToolSuiteColor", strokeColor: "Black", strokeWeight: 1 })],
    ["create_layer", () => ({ name: "ToolSuiteLayer" })],
    ["execute_indesign_code", () => ({ code: "'Tool suite ping';" })],
    ["data_merge", () => ({ dataSource: SAMPLE_DATA_SOURCE, createNewPages: false })],
]);

const TOOL_SKIP_LIST = new Set([
    "open_book",
    "create_book",
]);

class ToolSuiteRunner {
    constructor(toolMap) {
        this.toolMap = toolMap;
        this.server = null;
        this.results = [];
    }

    async startServer() {
        this.server = spawn("node", ["src/index.js"], {
            stdio: ["pipe", "pipe", "pipe"],
        });

        this.server.stderr.on("data", (chunk) => {
            console.error(`[server stderr] ${chunk.toString().trim()}`);
        });

        await delay(2500);

        if (this.server.exitCode !== null) {
            throw new Error("Failed to start InDesign MCP server");
        }
    }

    async stopServer() {
        if (this.server && this.server.exitCode === null) {
            this.server.kill();
            await delay(500);
        }
    }

    async sendRequest(payload) {
        if (!this.server) {
            throw new Error("Server not started");
        }

        return new Promise((resolve, reject) => {
            let buffer = "";

            const handleData = (chunk) => {
                buffer += chunk.toString();
                const segments = buffer.split(/\r?\n/);
                buffer = segments.pop() ?? "";
                for (const segment of segments) {
                    const trimmed = segment.trim();
                    if (!trimmed) continue;
                    try {
                        const json = JSON.parse(trimmed);
                        cleanup();
                        resolve(json);
                        return;
                    } catch (error) {
                        // continue waiting
                    }
                }
            };

            const handleError = (error) => {
                cleanup();
                reject(error instanceof Error ? error : new Error(String(error)));
            };

            const cleanup = () => {
                this.server.stdout.off("data", handleData);
                this.server.stdout.off("error", handleError);
            };

            this.server.stdout.on("data", handleData);
            this.server.stdout.on("error", handleError);

            this.server.stdin.write(`${JSON.stringify(payload)}\n`);
        });
    }

    async callMethod(method, params = {}) {
        const request = {
            jsonrpc: "2.0",
            id: Date.now(),
            method,
            params,
        };
        return this.sendRequest(request);
    }

    async callTool(name, args = {}) {
        const response = await this.callMethod("tools/call", {
            name,
            arguments: args,
        });

        const contentEntry = response?.result?.content?.[0];
        if (!contentEntry || typeof contentEntry.text !== "string") {
            throw new Error(`Unexpected response envelope for ${name}`);
        }

        let payload;
        try {
            payload = JSON.parse(contentEntry.text);
        } catch (error) {
            throw new Error(`Invalid JSON payload for ${name}: ${contentEntry.text}`);
        }

        if (!payload.success) {
            throw new Error(payload.result ?? `Tool ${name} reported failure`);
        }

        return payload;
    }

    async ensureDocument() {
        try {
            await this.callTool("get_document_info");
        } catch (error) {
            await this.callTool("create_document", { width: 210, height: 297, pages: 2, facingPages: true });
        }
    }

    buildArguments(definition) {
        const customBuilder = CUSTOM_ARG_BUILDERS.get(definition.name);
        if (customBuilder) {
            return customBuilder();
        }

        const schema = definition.inputSchema;
        if (!schema?.properties) {
            return {};
        }

        const args = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
            if (prop.default !== undefined) {
                args[key] = prop.default;
                continue;
            }

            if (Array.isArray(prop.enum) && prop.enum.length > 0) {
                args[key] = prop.enum[0];
                continue;
            }

            const value = this.fallbackForProperty(key, prop);
            if (value !== undefined) {
                args[key] = value;
            }
        }

        return args;
    }

    fallbackForProperty(key, prop) {
        const type = prop.type;
        const lowerKey = key.toLowerCase();
        const desc = (prop.description || "").toLowerCase();

        if (type === "string") {
            if (lowerKey.includes("color")) return "ToolSuiteColor";
            if (lowerKey.includes("name")) return "ToolSuiteName";
            if (lowerKey.includes("file") || desc.includes("file")) return SAMPLE_IMAGE;
            if (lowerKey.includes("path") || desc.includes("path")) return path.resolve(OUTPUT_DIR, `${key}.tmp`);
            if (lowerKey.includes("url")) return "https://example.com";
            if (lowerKey.includes("xml") || desc.includes("xml")) return "ToolSuiteElement";
            if (lowerKey.includes("layer")) return "ToolSuiteLayer";
            return "ToolSuiteValue";
        }

        if (type === "number") {
            if (lowerKey.includes("index")) return 0;
            if (lowerKey.includes("width")) return 100;
            if (lowerKey.includes("height")) return 100;
            if (lowerKey.includes("x")) return 10;
            if (lowerKey.includes("y")) return 10;
            if (lowerKey.includes("opacity")) return 50;
            if (lowerKey.includes("scale")) return 100;
            return 1;
        }

        if (type === "boolean") {
            return false;
        }

        if (type === "array") {
            return [];
        }

        if (type === "object") {
            return {};
        }

        return undefined;
    }

    async prepareBaselineFixtures() {
        await this.ensureDocument();

        try {
            await this.callTool("create_color_swatch", { name: "ToolSuiteColor", red: 90, green: 120, blue: 210 });
        } catch (error) {
            // if already exists we ignore
        }

        try {
            await this.callTool("create_paragraph_style", { name: "ToolSuiteParagraphStyle", fontFamily: "Arial\tRegular", fontSize: 12, textColor: "Black" });
        } catch (error) {}

        try {
            await this.callTool("create_character_style", { name: "ToolSuiteCharacterStyle", fontFamily: "Arial\tRegular", fontSize: 12, textColor: "Black" });
        } catch (error) {}

        try {
            await this.callTool("create_object_style", { name: "ToolSuiteObjectStyle", fillColor: "ToolSuiteColor", strokeColor: "Black", strokeWeight: 1 });
        } catch (error) {}

        try {
            await this.callTool("create_rectangle", { x: 20, y: 20, width: 60, height: 40, fillColor: "ToolSuiteColor" });
        } catch (error) {}

        const xmlBootstrap = [
            "var doc = app.activeDocument;",
            "var root = doc.xmlElements[0];",
            "var element = null;",
            "try { element = root.xmlElements.itemByName('ToolSuiteElement'); } catch (e) {}",
            "if (!element || !element.isValid) {",
            "  element = root.xmlElements.add('ToolSuiteElement');",
            "}",
            "element.contents = 'Tool Suite Sample';",
            '"Tool suite XML ready";'
        ].join("\n");

        try {
            await this.callTool("execute_indesign_code", { code: xmlBootstrap });
        } catch (error) {}
    }

    async run() {
        for (const [name, definition] of this.toolMap) {
            if (TOOL_SKIP_LIST.has(name)) {
                this.results.push({ tool: name, success: false, message: "Skipped (unsupported in automation)" });
                continue;
            }

            await this.ensureDocument();

            let args = {};
            try {
                args = this.buildArguments(definition);
            } catch (error) {
                this.results.push({ tool: name, success: false, message: `Argument build failure: ${error.message}` });
                continue;
            }

            try {
                const payload = await this.callTool(name, args);
                const message = typeof payload.result === "string" ? payload.result : JSON.stringify(payload.result);
                this.results.push({ tool: name, success: true, message });
            } catch (error) {
                this.results.push({ tool: name, success: false, message: error.message });
            }
        }
    }
}

async function main() {
    const runner = new ToolSuiteRunner(TOOL_DEFINITIONS);
    try {
        await runner.startServer();
        await runner.prepareBaselineFixtures();
        await runner.run();
    } catch (error) {
        console.error(error);
    } finally {
        await runner.stopServer();
    }

    const summary = {
        timestamp: new Date().toISOString(),
        totalTools: runner.results.length,
        passed: runner.results.filter((r) => r.success).length,
        failed: runner.results.filter((r) => !r.success).length,
        logPath: LOG_PATH,
    };

    await fs.writeFile(LOG_PATH, JSON.stringify({ summary, results: runner.results }, null, 2), "utf8");

    console.log("\nTool suite summary:");
    console.log(`  Total tools: ${summary.totalTools}`);
    console.log(`  Passed:      ${summary.passed}`);
    console.log(`  Failed:      ${summary.failed}`);
    console.log(`  Log written to: ${LOG_PATH}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
