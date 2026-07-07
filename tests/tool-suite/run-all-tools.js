import { spawn } from "child_process";
import { setTimeout as delay } from "timers/promises";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { pathToFileURL } from "url";
import { looksLikeFailureText } from "../../src/utils/stringUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.resolve(__dirname, "logs");
const OUTPUT_DIR = path.resolve(__dirname, "output");
const REGISTRY_ARTIFACT_PATH = path.resolve(__dirname, "../../src/core/indesign-tool-registry.json");
const SAMPLE_DATA_SOURCE = path.resolve(__dirname, "../test-data.csv");
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const SAMPLE_PDF = path.resolve(OUTPUT_DIR, `export-pdf-${TIMESTAMP}.pdf`);
const SAMPLE_DOCUMENT_PDF = path.resolve(OUTPUT_DIR, `export-document-pdf-${TIMESTAMP}.pdf`);
const SAMPLE_EPUB = path.resolve(OUTPUT_DIR, `export-${TIMESTAMP}.epub`);
const SAMPLE_SAVE_PATH = path.resolve(OUTPUT_DIR, "tool-suite-sample.indd");
const LOG_PATH = path.join(LOG_DIR, `tool-suite-run-${TIMESTAMP}.json`);

await fs.mkdir(LOG_DIR, { recursive: true });
await fs.mkdir(OUTPUT_DIR, { recursive: true });

async function gatherToolDefinitions() {
    const artifact = JSON.parse(await fs.readFile(REGISTRY_ARTIFACT_PATH, "utf8"));
    if (!artifact?.sources?.classic || !artifact.registry_hash) {
        throw new Error(`Invalid registry artifact: ${REGISTRY_ARTIFACT_PATH}`);
    }
    const map = new Map();
    for (const def of artifact.sources.classic) {
        if (!def?.name) continue;
        if (!map.has(def.name)) {
            map.set(def.name, def);
        }
    }
    return map;
}

const CUSTOM_ARG_BUILDERS = new Map([
    ["close_document", () => ({ allowDiscard: true, forceActiveDocument: true })],
    ["create_character_style", () => ({ name: "ToolSuiteCharacterStyleCreated", fontFamily: "Arial\tRegular", fontSize: 12, textColor: "Black" })],
    ["create_document_hyperlink", () => ({ sourceText: "ToolSuiteLinkText", destination: "https://example.com", linkType: "URL" })],
    ["create_document_section", () => ({ startPage: 0, sectionPrefix: "TS-", startNumber: 1, numberingStyle: "ARABIC" })],
    ["create_document", () => ({ width: 210, height: 297, pages: 2, facingPages: true })],
    ["create_page_guides", () => ({ pageIndex: 0, numberOfRows: 2, numberOfColumns: 2, rowGutter: 5, columnGutter: 5, guideColor: "BLUE", fitMargins: true, removeExisting: true })],
    ["delete_master_spread", () => ({ masterIndex: 1, name: "ToolSuiteMaster" })],
    ["delete_page", () => ({ pageIndex: 1 })],
    ["edit_text_frame", () => ({ frameIndex: 0, content: "Tool suite edited text", fontSize: 12, alignment: "LEFT" })],
    ["save_document", () => ({ filePath: SAMPLE_SAVE_PATH })],
    ["open_document", () => ({ filePath: SAMPLE_SAVE_PATH })],
    ["export_document_pdf", () => ({ filePath: SAMPLE_DOCUMENT_PDF, pages: "all", quality: "PRESS" })],
    ["export_epub", () => ({ filePath: SAMPLE_EPUB, includeImages: true, includeStyles: true })],
    ["export_pdf", () => ({ filePath: SAMPLE_PDF, pages: "all", quality: "PRESS" })],
    ["export_images", () => ({ outputPath: path.resolve(OUTPUT_DIR, "images"), format: "JPEG", resolution: 150 })],
    ["package_document", () => ({ outputPath: path.resolve(OUTPUT_DIR, "package"), includeFonts: false, includeLinks: false, includeProfiles: false })],
    ["duplicate_master_spread", () => ({ masterIndex: 0, name: "ToolSuiteMaster", newName: "ToolSuiteMasterCopy", position: "AT_END" })],
    ["get_master_spread_info", () => ({ masterIndex: 0, name: "ToolSuiteMaster" })],
    ["move_page", () => ({ pageIndex: 0, newPosition: "AT_END" })],
    ["place_file_on_spread", () => ({ spreadIndex: 0, filePath: SAMPLE_PDF, x: 40, y: 40, pageIndexWithinSpread: 1 })],
    ["place_xml_on_spread", () => ({ spreadIndex: 0, xmlElementName: "ToolSuiteElement", x: 60, y: 60, pageIndexWithinSpread: 1 })],
    ["place_file_on_page", () => ({ pageIndex: 0, filePath: SAMPLE_PDF, x: 30, y: 30 })],
    ["place_image", () => ({ filePath: SAMPLE_PDF, x: 50, y: 50, width: 80, height: 60 })],
    ["place_xml_on_page", () => ({ pageIndex: 0, xmlElementName: "ToolSuiteElement", x: 60, y: 60 })],
    ["apply_color", () => ({ objectIndex: 0, colorName: "ToolSuiteColor", colorType: "FILL" })],
    ["apply_paragraph_style", () => ({ styleName: "ToolSuiteParagraphStyle", frameIndex: 0 })],
    ["apply_character_style", () => ({ styleName: "ToolSuiteCharacterStyle", frameIndex: 0 })],
    ["apply_object_style", () => ({ styleName: "ToolSuiteObjectStyle", itemType: "rectangle", itemIndex: 0 })],
    ["populate_table", () => ({ tableIndex: 0, data: [["Header 1", "Header 2"], ["Row 1", "Value"]] })],
    ["create_color_swatch", () => ({ name: "ToolSuiteColor", colorType: "PROCESS", red: 120, green: 90, blue: 200 })],
    ["create_paragraph_style", () => ({ name: "ToolSuiteParagraphStyleCreated", fontFamily: "Arial\tRegular", fontSize: 12, textColor: "Black" })],
    ["create_object_style", () => ({ name: "ToolSuiteObjectStyleCreated", fillColor: "ToolSuiteColor", strokeColor: "Black", strokeWeight: 1 })],
    ["create_layer", () => ({ name: "ToolSuiteLayer" })],
    ["resize_page", () => ({ pageIndex: 0, width: 210, height: 297, resizeMethod: "REPLACING_CURRENT_DIMENSIONS_WITH", anchorPoint: "CENTER_ANCHOR", coordinateSpace: "PAGE_COORDINATES" })],
    ["reframe_page", () => ({ pageIndex: 0, x1: 0, y1: 0, x2: 210, y2: 297, coordinateSpace: "PAGE_COORDINATES" })],
    ["set_page_background", () => ({ pageIndex: 0, backgroundColor: "ToolSuiteColor", opacity: 100 })],
    ["set_page_properties", () => ({ pageIndex: 0, label: "ToolSuitePage", pageColor: "BLUE" })],
    ["execute_indesign_code", () => ({ code: "'Tool suite ping';" })],
    ["data_merge", () => ({ dataSource: SAMPLE_DATA_SOURCE, createNewPages: false })],
]);

const TOOL_OUTCOME_CONTRACTS = new Map([
    ["create_book", { status: "skipped", reason: "Book lifecycle coverage is handled by tests/real-e2e/scenarios/book_hidden.mjs because it changes global Book panel state." }],
    ["open_book", { status: "skipped", reason: "Book lifecycle coverage is handled by tests/real-e2e/scenarios/book_hidden.mjs because it requires a paired .indb fixture from create_book." }],
]);

function toolResultLooksFailed(result) {
    if (result.status === "failed") return true;
    if (result.status !== "passed") return false;
    return looksLikeFailureText(result.message) || looksLikeFailureText(result.result);
}

export function summarizeResults(results, runnerError, cleanup = null) {
    return {
        totalTools: results.length,
        passed: results.filter((result) => result.status === "passed" && !toolResultLooksFailed(result)).length,
        skipped: results.filter((result) => result.status === "skipped").length,
        expectedFailed: results.filter((result) => result.status === "expectedFailure").length,
        failed: results.filter((result) => toolResultLooksFailed(result)).length,
        cleanup,
        runnerError,
    };
}

export function buildExitCode(summary) {
    return summary.runnerError || summary.failed > 0 || summary.cleanup?.status === "failed" || summary.cleanup?.remainingDocuments > 0 ? 1 : 0;
}

export class ToolSuiteRunner {
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

    async callToolRaw(name, args = {}) {
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

        return payload;
    }

    async callTool(name, args = {}) {
        const payload = await this.callToolRaw(name, args);

        if (!payload.success) {
            throw new Error(payload.message ?? payload.result ?? `Tool ${name} reported failure`);
        }

        const failureText = [payload.message, payload.result]
            .find((value) => looksLikeFailureText(value));
        if (failureText) {
            throw new Error(failureText);
        }

        return payload;
    }

    async ensureDocument() {
        try {
            const payload = await this.callTool("get_document_info");
            if (String(payload.result || "").includes("No document open")) {
                await this.callTool("create_document", { width: 210, height: 297, pages: 2, facingPages: true });
            }
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
        const required = new Set(Array.isArray(schema.required) ? schema.required : []);
        for (const [key, prop] of Object.entries(schema.properties)) {
            if (prop.default !== undefined) {
                args[key] = prop.default;
                continue;
            }

            if (!required.has(key)) continue;

            const value = Array.isArray(prop.enum) && prop.enum.length > 0
                ? prop.enum[0]
                : this.fallbackForProperty(key, prop);
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
            if (lowerKey.includes("file") || desc.includes("file")) return SAMPLE_PDF;
            if (lowerKey.includes("path") || desc.includes("path")) return path.resolve(OUTPUT_DIR, `${key}.tmp`);
            if (lowerKey.includes("url")) return "https://example.com";
            if (lowerKey.includes("xml") || desc.includes("xml")) return "ToolSuiteElement";
            if (lowerKey.includes("layer")) return "ToolSuiteLayer";
            return "ToolSuiteValue";
        }

        if (type === "number" || type === "integer") {
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
        const xmlBootstrap = [
            "var doc = app.activeDocument;",
            "function ensureColor(name, rgb) {",
            "  var color = doc.colors.itemByName(name);",
            "  if (!color || !color.isValid) {",
            "    color = doc.colors.add({ name: name, model: ColorModel.PROCESS, space: ColorSpace.RGB, colorValue: rgb });",
            "  }",
            "  return color;",
            "}",
            "function ensureParagraphStyle(name) {",
            "  var style = doc.paragraphStyles.itemByName(name);",
            "  if (!style || !style.isValid) style = doc.paragraphStyles.add({ name: name });",
            "  return style;",
            "}",
            "function ensureCharacterStyle(name) {",
            "  var style = doc.characterStyles.itemByName(name);",
            "  if (!style || !style.isValid) style = doc.characterStyles.add({ name: name });",
            "  return style;",
            "}",
            "function ensureObjectStyle(name) {",
            "  var style = doc.objectStyles.itemByName(name);",
            "  if (!style || !style.isValid) style = doc.objectStyles.add({ name: name });",
            "  return style;",
            "}",
            "var toolColor = ensureColor('ToolSuiteColor', [90, 120, 210]);",
            "ensureParagraphStyle('ToolSuiteParagraphStyle');",
            "ensureCharacterStyle('ToolSuiteCharacterStyle');",
            "ensureObjectStyle('ToolSuiteObjectStyle');",
            "while (doc.pages.length < 2) doc.pages.add();",
            "var page = doc.pages[0];",
            "if (page.textFrames.length === 0) {",
            "  var tf = page.textFrames.add();",
            "  tf.geometricBounds = [20, 20, 50, 120];",
            "  tf.contents = 'ToolSuiteLinkText baseline';",
            "}",
            "var hasTable = false;",
            "for (var i = 0; i < page.textFrames.length; i++) {",
            "  if (page.textFrames[i].tables.length > 0) { hasTable = true; break; }",
            "}",
            "if (!hasTable) {",
            "  var tableFrame = page.textFrames.add();",
            "  tableFrame.geometricBounds = [55, 20, 110, 140];",
            "  tableFrame.insertionPoints[0].tables.add({ bodyRowCount: 3, bodyColumnCount: 3 });",
            "}",
            "if (page.rectangles.length === 0) {",
            "  var rect = page.rectangles.add();",
            "  rect.geometricBounds = [120, 20, 170, 80];",
            "  rect.fillColor = toolColor;",
            "}",
            "var root = doc.xmlElements[0];",
            "var tag = doc.xmlTags.itemByName('ToolSuiteElement');",
            "if (!tag || !tag.isValid) tag = doc.xmlTags.add('ToolSuiteElement');",
            "var element = root.xmlElements.itemByName('ToolSuiteElement');",
            "if (!element || !element.isValid) {",
            "  element = root.xmlElements.add(tag);",
            "}",
            "element.contents = 'Tool Suite Sample';",
            '"Tool suite XML ready";'
        ].join("\n");

        try {
            await this.callTool("execute_indesign_code", { code: xmlBootstrap });
        } catch (error) {}
    }

    async cleanupDocuments() {
        const cleanupScript = [
            "var initialDocuments = app.documents.length;",
            "var closedDocuments = 0;",
            "var cleanupError = null;",
            "while (app.documents.length > 0) {",
            "  try {",
            "    app.documents[0].close(SaveOptions.NO);",
            "    closedDocuments++;",
            "  } catch (error) {",
            "    cleanupError = error.message;",
            "    break;",
            "  }",
            "}",
            "var remainingDocuments = app.documents.length;",
            "JSON.stringify({",
            "  success: remainingDocuments === 0 && cleanupError === null,",
            "  operation: 'Tool Suite Cleanup',",
            "  code: remainingDocuments === 0 && cleanupError === null ? undefined : 'TOOL_SUITE_CLEANUP_FAILED',",
            "  message: remainingDocuments === 0 && cleanupError === null ? 'Tool suite document cleanup complete' : 'Tool suite document cleanup failed',",
            "  data: {",
            "    initialDocuments: initialDocuments,",
            "    closedDocuments: closedDocuments,",
            "    remainingDocuments: remainingDocuments,",
            "    errorCount: cleanupError === null ? 0 : 1",
            "  }",
            "});"
        ].join("\n");

        const payload = await this.callToolRaw("execute_indesign_code", { code: cleanupScript });
        const data = payload.data || {};
        return {
            status: payload.success ? "passed" : "failed",
            initialDocuments: Number(data.initialDocuments ?? 0),
            closedDocuments: Number(data.closedDocuments ?? 0),
            remainingDocuments: Number(data.remainingDocuments ?? 0),
            errorCount: Number(data.errorCount ?? (payload.success ? 0 : 1)),
        };
    }

    async run() {
        for (const [name, definition] of this.toolMap) {
            const outcomeContract = TOOL_OUTCOME_CONTRACTS.get(name);
            if (outcomeContract?.status === "skipped") {
                this.results.push({ tool: name, status: "skipped", success: null, reason: outcomeContract.reason, message: "Skipped by explicit tool-suite contract" });
                continue;
            }

            await this.ensureDocument();
            await this.prepareBaselineFixtures();

            let args = {};
            try {
                args = this.buildArguments(definition);
            } catch (error) {
                this.results.push({ tool: name, status: "failed", success: false, message: `Argument build failure: ${error.message}` });
                continue;
            }

            try {
                const payload = await this.callTool(name, args);
                const message = typeof payload.result === "string" ? payload.result : JSON.stringify(payload.result);
                this.results.push({ tool: name, status: "passed", success: true, message });
            } catch (error) {
                if (outcomeContract?.status === "expectedFailure") {
                    this.results.push({ tool: name, status: "expectedFailure", success: null, reason: outcomeContract.reason, message: error.message });
                } else {
                    this.results.push({ tool: name, status: "failed", success: false, message: error.message });
                }
            }
        }
    }
}

async function main() {
    let runner = null;
    let runnerError = null;
    let cleanup = null;
    try {
        const TOOL_DEFINITIONS = await gatherToolDefinitions();
        runner = new ToolSuiteRunner(TOOL_DEFINITIONS);
        await runner.startServer();
        await runner.ensureDocument();
        await runner.prepareBaselineFixtures();
        await runner.run();
    } catch (error) {
        runnerError = error?.stack || error?.message || String(error);
        console.error(error);
    } finally {
        if (runner) {
            if (runner.server && runner.server.exitCode === null) {
                try {
                    cleanup = await runner.cleanupDocuments();
                    if (cleanup.status !== "passed" || cleanup.remainingDocuments !== 0) {
                        runnerError = [runnerError, "Tool suite document cleanup failed"].filter(Boolean).join("\n");
                    }
                } catch (error) {
                    cleanup = {
                        status: "failed",
                        initialDocuments: null,
                        closedDocuments: null,
                        remainingDocuments: null,
                        errorCount: 1,
                    };
                    runnerError = [runnerError, error?.stack || error?.message || String(error)].filter(Boolean).join("\n");
                }
            }
            await runner.stopServer();
        }
    }

    const summary = {
        timestamp: new Date().toISOString(),
        ...summarizeResults(runner?.results || [], runnerError, cleanup),
        logPath: LOG_PATH,
    };

    await fs.writeFile(LOG_PATH, JSON.stringify({ summary, results: runner?.results || [] }, null, 2), "utf8");

    console.log("\nTool suite summary:");
    console.log(`  Total tools: ${summary.totalTools}`);
    console.log(`  Passed:      ${summary.passed}`);
    console.log(`  Skipped:     ${summary.skipped}`);
    console.log(`  Expected failures: ${summary.expectedFailed}`);
    console.log(`  Failed:      ${summary.failed}`);
    if (summary.cleanup) {
        console.log(`  Cleanup:     ${summary.cleanup.status}`);
        console.log(`  Remaining documents: ${summary.cleanup.remainingDocuments}`);
    }
    if (summary.runnerError) {
        console.log("  Runner error: yes");
    }
    console.log(`  Log written to: ${LOG_PATH}`);

    process.exitCode = buildExitCode(summary);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
