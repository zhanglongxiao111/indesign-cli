#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');
const goldenDir = path.join(
  repoRoot,
  'docs',
  'AI协作',
  '本地Agent',
  '进行中',
  '2026-07-06_终态重构',
  'golden',
);

const SWITCH_ONLY_TOOLS = {
  preflight_document: {
    domain: 'document',
    handler: 'DocumentHandlers.preflightDocument',
    evidence: 'src/handlers/documentHandlers.js: preflightDocument destructures profile/includeWarnings; old commented schema in legacy document type file.',
    schema: objectSchema({
      profile: { type: 'string', description: 'Preflight profile name', default: 'Basic' },
      includeWarnings: { type: 'boolean', description: 'Include warnings in report', default: true },
    }),
  },
  data_merge: {
    domain: 'document',
    handler: 'DocumentHandlers.dataMerge',
    evidence: 'src/handlers/documentHandlers.js: dataMerge destructures dataSource/targetPage/createNewPages/removeUnusedPages; old commented schema in legacy document type file.',
    schema: objectSchema({
      dataSource: { type: 'string', description: 'Path to data source file' },
      targetPage: { type: 'number', description: 'Target page index', default: 0 },
      createNewPages: { type: 'boolean', description: 'Create new pages for each record', default: false },
      removeUnusedPages: { type: 'boolean', description: 'Remove unused pages after merge', default: false },
    }, ['dataSource']),
  },
  get_document_xml_structure: {
    domain: 'document',
    handler: 'DocumentHandlers.getDocumentXmlStructure',
    evidence: 'src/handlers/documentHandlers.js: getDocumentXmlStructure destructures includeTags/includeElements; old commented schema in legacy document type file.',
    schema: objectSchema({
      includeTags: { type: 'boolean', description: 'Include XML tags', default: true },
      includeElements: { type: 'boolean', description: 'Include XML elements', default: true },
    }),
  },
  export_document_xml: {
    domain: 'document',
    handler: 'DocumentHandlers.exportDocumentXml',
    evidence: 'src/handlers/documentHandlers.js: exportDocumentXml destructures filePath/includeImages/includeStyles; old commented schema in legacy document type file.',
    schema: objectSchema({
      filePath: { type: 'string', description: 'Path to save XML file' },
      includeImages: { type: 'boolean', description: 'Include images in export', default: true },
      includeStyles: { type: 'boolean', description: 'Include style information', default: true },
    }, ['filePath']),
  },
  save_document_to_cloud: {
    domain: 'document',
    handler: 'DocumentHandlers.saveDocumentToCloud',
    evidence: 'src/handlers/documentHandlers.js: saveDocumentToCloud destructures cloudName/includeAssets; old commented schema in legacy document type file.',
    schema: objectSchema({
      cloudName: { type: 'string', description: 'Name for the cloud document' },
      includeAssets: { type: 'boolean', description: 'Include linked assets', default: true },
    }, ['cloudName']),
  },
  open_cloud_document: {
    domain: 'document',
    handler: 'DocumentHandlers.openCloudDocument',
    evidence: 'src/handlers/documentHandlers.js: openCloudDocument destructures cloudDocumentId; old commented schema in legacy document type file.',
    schema: objectSchema({
      cloudDocumentId: { type: 'string', description: 'Cloud document ID' },
    }, ['cloudDocumentId']),
  },
  validate_document: {
    domain: 'document',
    handler: 'DocumentHandlers.validateDocument',
    evidence: 'src/handlers/documentHandlers.js: validateDocument destructures checkLinks/checkFonts/checkImages/checkStyles; old commented schema in legacy document type file.',
    schema: objectSchema({
      checkLinks: { type: 'boolean', description: 'Check for broken links', default: true },
      checkFonts: { type: 'boolean', description: 'Check for missing fonts', default: true },
      checkImages: { type: 'boolean', description: 'Check for missing images', default: true },
      checkStyles: { type: 'boolean', description: 'Check for unused styles', default: false },
    }),
  },
  cleanup_document: {
    domain: 'document',
    handler: 'DocumentHandlers.cleanupDocument',
    evidence: 'src/handlers/documentHandlers.js: cleanupDocument destructures removeUnusedStyles/removeUnusedColors/removeUnusedLayers/removeHiddenElements; old commented schema in legacy document type file.',
    schema: objectSchema({
      removeUnusedStyles: { type: 'boolean', description: 'Remove unused styles', default: false },
      removeUnusedColors: { type: 'boolean', description: 'Remove unused colors', default: false },
      removeUnusedLayers: { type: 'boolean', description: 'Remove unused layers', default: false },
      removeHiddenElements: { type: 'boolean', description: 'Remove hidden elements', default: false },
    }),
  },
  place_xml_on_spread: {
    domain: 'spread',
    handler: 'SpreadHandlers.placeXmlOnSpread',
    evidence: 'src/handlers/spreadHandlers.js: placeXmlOnSpread destructures spreadIndex/xmlElementName/x/y/autoflowing/pageIndexWithinSpread.',
    schema: objectSchema({
      spreadIndex: { type: 'integer', description: 'Target spread index' },
      xmlElementName: { type: 'string', description: 'XML element name to place' },
      x: { type: 'number', description: 'X coordinate', default: 10 },
      y: { type: 'number', description: 'Y coordinate', default: 10 },
      autoflowing: { type: 'boolean', description: 'Whether to autoflow XML placement', default: false },
      pageIndexWithinSpread: { type: 'integer', description: 'Page index within spread', default: 0 },
    }, ['spreadIndex', 'xmlElementName']),
  },
};

const D_COMMANDS = [
  {
    id: 'architecture_presentation_full_offline',
    stableRunId: 'terminal_architecture_golden_architecture_presentation',
    args: ['tests/real-e2e/run-architecture-presentation.mjs', '--full', '--offline', '--run-id', 'terminal_architecture_golden_architecture_presentation'],
    rawEvidence: {
      summaryFile: 'D_architecture_presentation_catalog_summary.json',
      evidenceFile: 'D_architecture_presentation_catalog_evidence.json',
    },
  },
  {
    id: 'agent_ux_hardening_offline',
    stableRunId: 'terminal_architecture_golden_agent_ux_hardening',
    args: ['tests/real-e2e/run-agent-ux-hardening.mjs', '--offline', '--run-id', 'terminal_architecture_golden_agent_ux_hardening'],
  },
];

const D_SUCCESS_ARTIFACTS = new Set([
  'D_runner_outputs.json',
  'D_architecture_presentation_catalog_summary.json',
  'D_architecture_presentation_catalog_evidence.json',
]);

function objectSchema(properties, required = []) {
  const schema = { type: 'object', additionalProperties: false, properties };
  if (required.length) schema.required = required;
  return schema;
}

async function writeJson(relativePath, value) {
  const outputPath = path.join(goldenDir, relativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${stableStringify(value)}\n`, 'utf8');
}

async function prepareGoldenFixtures() {
  const fixtureDir = path.join(repoRoot, '.indesign-cli', 'terminal-golden-fixtures');
  const jsxPath = path.join(fixtureDir, 'run_jsx_file_golden.jsx');
  await fs.mkdir(fixtureDir, { recursive: true });
  await fs.writeFile(jsxPath, '"__GOLDEN_JSX_FILE__";\n', 'utf8');
  return { jsxPath };
}

async function unlinkIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function prepareDArtifactPublish(targetGoldenDir = goldenDir) {
  await Promise.all(
    [...D_SUCCESS_ARTIFACTS].map((name) => unlinkIfExists(path.join(targetGoldenDir, name))),
  );
  await cleanupDCommandFailureArtifacts(targetGoldenDir);
}

async function cleanupDCommandFailureArtifacts(targetGoldenDir = goldenDir) {
  const entries = await fs.readdir(targetGoldenDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /^D_.*\.json$/u.test(name) && !D_SUCCESS_ARTIFACTS.has(name))
      .map((name) => fs.unlink(path.join(targetGoldenDir, name))),
  );
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value), null, 2);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])]),
  );
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        PYTHONPATH: path.join(repoRoot, 'agent-harness'),
      },
      shell: false,
      windowsHide: true,
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (exitCode) => resolve({ command, args, exitCode, stdout, stderr }));
  });
}

async function requestMcpListTools(entry) {
  const child = spawn(process.execPath, [entry], {
    cwd: repoRoot,
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let nextId = 1;
  const stderrLines = [];
  child.stderr.on('data', (chunk) => {
    stderrLines.push(...chunk.toString().split(/\r?\n/).filter(Boolean));
  });
  const lineReader = createLineReader(child.stdout);

  async function request(method, params = {}) {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    for (;;) {
      const line = await lineReader.readLine();
      if (line === null) {
        throw new Error(`MCP process ended before ${method}; stderr=${stderrLines.slice(-10).join(' | ')}`);
      }
      const response = JSON.parse(line);
      if (response.id !== id) continue;
      if (response.error) throw new Error(`${method} failed: ${JSON.stringify(response.error)}`);
      return response.result || {};
    }
  }

  await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'record-golden', version: '1' },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
  const result = await request('tools/list', {});
  child.kill();
  return normalizeTools(result.tools || []);
}

export function createLineReader(stream) {
  let buffer = '';
  let ended = false;
  let streamError = null;
  const waiting = [];

  function nextLine() {
    const newline = buffer.indexOf('\n');
    if (newline < 0) return undefined;
    const line = buffer.slice(0, newline).replace(/\r$/u, '');
    buffer = buffer.slice(newline + 1);
    return line;
  }

  function pump() {
    while (waiting.length) {
      if (streamError) {
        waiting.shift().reject(streamError);
        continue;
      }
      const line = nextLine();
      if (line !== undefined) {
        waiting.shift().resolve(line);
        continue;
      }
      if (ended) {
        if (buffer.length) {
          const finalLine = buffer.replace(/\r$/u, '');
          buffer = '';
          waiting.shift().resolve(finalLine);
        } else {
          waiting.shift().resolve(null);
        }
        continue;
      }
      break;
    }
  }

  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    pump();
  });
  stream.once('end', () => {
    ended = true;
    pump();
  });
  stream.once('error', (error) => {
    streamError = error;
    pump();
  });

  return {
    readLine() {
      return new Promise((resolve, reject) => {
        waiting.push({ resolve, reject });
        pump();
      });
    },
  };
}

function normalizeTools(tools) {
  return tools
    .map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function dumpCliCatalogAndSchemas() {
  const code = String.raw`
import json
import sys
from cli_anything.indesign.indesign_cli import build_catalog_with_backends, slim_tools
from cli_anything.indesign.core.router import Router
from cli_anything.indesign.indesign_cli import repo_root

catalog, warnings = build_catalog_with_backends()
router = Router(catalog=catalog, repo_root=repo_root())
tools = catalog.list_tools(callable_only=False)
schemas = {}
schema_errors = {}
for tool in tools:
    tool_id = tool["id"]
    if not tool.get("callable"):
        continue
    try:
        schemas[tool_id] = {
            "ok": True,
            "command": "tool schema",
            "tool_id": tool_id,
            "data": router.schema(tool_id),
            "warnings": warnings,
        }
    except Exception as exc:
        schema_errors[tool_id] = {"type": exc.__class__.__name__, "message": str(exc)}
print(json.dumps({
    "warnings": warnings,
    "tool_list": slim_tools(tools),
    "schemas": schemas,
    "schema_errors": schema_errors,
}, ensure_ascii=False, sort_keys=True))
`;
  const result = await runProcess('python', ['-c', code]);
  if (result.exitCode !== 0) {
    throw new Error(`CLI catalog dump failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function internalSchemasFromCliDump(cliDump) {
  const schemas = {};
  const metadata = {};
  for (const tool of cliDump.tool_list) {
    if (tool.source !== 'hidden_handler' || tool.callable === false) continue;
    const schemaPayload = cliDump.schemas[tool.id];
    const inputSchema = schemaPayload?.data?.inputSchema;
    if (!inputSchema) {
      throw new Error(`CLI schema dump is missing internal schema for ${tool.id}`);
    }
    schemas[tool.id] = inputSchema;
    metadata[tool.id] = schemaPayload.data.metadata || {};
  }
  return { schemas, metadata };
}


function sampleArgs(schema) {
  const properties = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const args = {};
  for (const key of required) {
    args[key] = sampleValue(properties[key] || {}, key);
  }
  if (!required.length && schema?.minProperties && Object.keys(properties).length) {
    const key = Object.keys(properties)[0];
    args[key] = sampleValue(properties[key], key);
  }
  if (schema?.oneOf && Array.isArray(schema.oneOf) && schema.oneOf[0]?.required?.[0]) {
    const key = schema.oneOf[0].required[0];
    args[key] = sampleValue(properties[key] || {}, key);
  }
  return args;
}

function sampleValue(schema, key = 'value') {
  if (schema?.default !== undefined) return schema.default;
  if (Array.isArray(schema?.enum) && schema.enum.length) return schema.enum[0];
  const type = Array.isArray(schema?.type) ? schema.type[0] : schema?.type;
  if (type === 'boolean') return false;
  if (type === 'integer') return Math.max(0, Number(schema.minimum ?? 0));
  if (type === 'number') return Number(schema.minimum ?? 1);
  if (type === 'array') return [sampleValue(schema.items || { type: 'string' }, key)];
  if (type === 'object' || schema?.properties || schema?.additionalProperties) {
    if (schema.properties) return sampleArgs(schema);
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      return { sample: sampleValue(schema.additionalProperties, 'sample') };
    }
    return {};
  }
  if (/path|file|folder|output|source/i.test(key)) return 'D:/AI/mcp-indesign/.golden-placeholder';
  if (/code/i.test(key)) return '"golden mock";';
  if (/text|title|name|id|label|query|content|destination|prefix/i.test(key)) return 'golden';
  return 'golden';
}

function responseShape(value) {
  if (Array.isArray(value)) return value.map(responseShape);
  if (!value || typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, responseShape(child)]),
  );
}

async function buildToolCallSnapshots(classicTools, advancedTools, hiddenDump) {
  const { ScriptExecutor } = await import(pathToFileUrl(path.join(repoRoot, 'src/core/scriptExecutor.js')));
  const { registry } = await import(pathToFileUrl(path.join(repoRoot, 'src/tools/index.js')));

  const fixtures = await prepareGoldenFixtures();
  const snapshots = [];
  const skips = [];
  let captured = [];
  const originalExecuteScript = ScriptExecutor.executeInDesignScript;
  const originalExecuteScriptFile = ScriptExecutor.executeInDesignScriptFile;
  ScriptExecutor.executeInDesignScript = async (script) => {
    captured.push({ kind: 'inline', script });
    return '__GOLDEN_MOCK_RESULT__';
  };
  ScriptExecutor.executeInDesignScriptFile = async (filePath) => {
    captured.push({ kind: 'file', filePath: path.normalize(filePath) });
    return '__GOLDEN_MOCK_RESULT__';
  };

  const entries = [
    ...classicTools.map((tool) => ({ source: 'classic', domain: null, name: tool.name, schema: tool.inputSchema })),
    ...advancedTools.map((tool) => ({ source: 'advanced', domain: 'template', name: tool.name, schema: tool.inputSchema })),
    ...Object.entries(hiddenDump.schemas).map(([toolId, schema]) => ({
      source: 'hidden_handler',
      domain: toolId.split('.')[0],
      name: toolId.split('.')[1],
      schema,
    })),
    ...Object.entries(SWITCH_ONLY_TOOLS).map(([name, info]) => ({
      source: 'switch_only_no_cli_schema',
      domain: info.domain,
      name,
      schema: info.schema,
      evidence: info.evidence,
    })),
  ].sort((left, right) => `${left.source}:${left.name}`.localeCompare(`${right.source}:${right.name}`));

  const seen = new Set();
  try {
    for (const entry of entries) {
      const uniqueKey = `${entry.source}:${entry.name}`;
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);
      const args = sampleArgs(entry.schema);
      applyGoldenArgOverrides(entry, args, fixtures);
      captured = [];
      try {
        const tool = registry.byName.get(entry.name);
        if (!tool || typeof tool.handler !== 'function') {
          throw new Error(`registry handler missing for ${entry.name}`);
        }
        const result = await tool.handler(args);
        snapshots.push({
          name: entry.name,
          source: entry.source,
          domain: entry.domain,
          args,
          scriptCount: captured.length,
          scripts: captured,
          responseShape: responseShape(result),
          evidence: entry.evidence || undefined,
        });
      } catch (error) {
        skips.push({
          name: entry.name,
          source: entry.source,
          domain: entry.domain,
          args,
          reason: error.message,
          evidence: entry.evidence || undefined,
        });
      }
    }
  } finally {
    ScriptExecutor.executeInDesignScript = originalExecuteScript;
    ScriptExecutor.executeInDesignScriptFile = originalExecuteScriptFile;
  }

  return { snapshots, skips };
}

function applyGoldenArgOverrides(entry, args, fixtures) {
  if (entry.name === 'populate_table') {
    args.data = [['Header 1', 'Header 2'], ['Row 1', 'Value']];
  }
  if (entry.name === 'run_jsx_file') {
    args.filePath = fixtures.jsxPath;
  }
}

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1:')}`;
}

function withActualDRunId(command, index) {
  const actualRunId = `${command.stableRunId}_${process.pid}_${Date.now()}_${index}`;
  return {
    ...command,
    actualRunId,
    actualArgs: command.args.map((arg) => (arg === command.stableRunId ? actualRunId : arg)),
  };
}

function normalizeDOutput(value, actualRunId, stableRunId) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeDOutput(item, actualRunId, stableRunId));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeDOutput(child, actualRunId, stableRunId)]),
    );
  }
  if (typeof value !== 'string') {
    return value;
  }
  return value
    .replaceAll(actualRunId, stableRunId)
    .replaceAll(actualRunId.replace(/\\/g, '/'), stableRunId);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Required raw runner report is missing: ${filePath}`);
    }
    throw error;
  }
}

function assertCatalogSummary(summary, runRoot) {
  if (summary?.total !== 150) {
    throw new Error(`Raw catalog summary total must be 150 for ${runRoot}, got ${summary?.total}`);
  }
  if (summary?.bySource?.['cli.primitive'] !== 1) {
    throw new Error(
      `Raw catalog summary cli.primitive count must be 1 for ${runRoot}, got ${summary?.bySource?.['cli.primitive']}`,
    );
  }
}

function buildCatalogEvidence(summary, catalog, runRoot) {
  if (!Array.isArray(catalog)) {
    throw new Error(`Raw tool catalog must be an array for ${runRoot}`);
  }
  if (catalog.length !== summary.total) {
    throw new Error(`Raw tool catalog length must match summary total for ${runRoot}: ${catalog.length} !== ${summary.total}`);
  }
  const feedbackReport = catalog.find((tool) => tool.tool_id === 'feedback.report');
  if (!feedbackReport) {
    throw new Error(`Raw tool catalog is missing feedback.report for ${runRoot}`);
  }
  return {
    schemaVersion: 1,
    summary,
    catalogLength: catalog.length,
    containsFeedbackReport: true,
    feedbackReport: {
      tool_id: feedbackReport.tool_id,
      source: feedbackReport.source,
      domain: feedbackReport.domain,
      name: feedbackReport.name,
      callable: feedbackReport.callable,
      backend: feedbackReport.backend,
    },
  };
}

async function collectDRunEvidence(command, parsedStdout) {
  if (!parsedStdout?.runId || !parsedStdout?.runRoot) {
    throw new Error(`${command.id} stdout JSON must include runId and runRoot`);
  }
  const actualRunRoot = path.resolve(parsedStdout.runRoot);
  if (path.basename(actualRunRoot) !== parsedStdout.runId) {
    throw new Error(`${command.id} runRoot must point to actual runId: ${actualRunRoot} !== ${parsedStdout.runId}`);
  }

  const reportsDir = path.join(actualRunRoot, 'reports');
  const summary = await readJson(path.join(reportsDir, 'tool-catalog-summary.json'));
  const catalog = await readJson(path.join(reportsDir, 'tool-catalog.json'));
  assertCatalogSummary(summary, actualRunRoot);

  return {
    actualRunId: parsedStdout.runId,
    actualRunRoot,
    files: [
      [command.rawEvidence.summaryFile, summary],
      [command.rawEvidence.evidenceFile, buildCatalogEvidence(summary, catalog, actualRunRoot)],
    ],
  };
}

async function runD() {
  const results = [];
  const evidenceFiles = [];
  for (let index = 0; index < D_COMMANDS.length; index += 1) {
    const command = withActualDRunId(D_COMMANDS[index], index);
    const result = await runProcess(process.execPath, command.actualArgs, { timeout: 30 * 60 * 1000 });
    let parsedStdout = null;
    try {
      parsedStdout = JSON.parse(result.stdout);
    } catch {
      parsedStdout = null;
    }
    results.push({
      id: command.id,
      command: ['node', ...command.args].join(' '),
      exitCode: result.exitCode,
      stdoutJson: parsedStdout ? normalizeDOutput(parsedStdout, command.actualRunId, command.stableRunId) : null,
      stdoutTail: parsedStdout ? undefined : normalizeDOutput(result.stdout.split(/\r?\n/).slice(-40), command.actualRunId, command.stableRunId),
      stderrTail: normalizeDOutput(result.stderr.split(/\r?\n/).filter(Boolean).slice(-80), command.actualRunId, command.stableRunId),
    });
    if (result.exitCode !== 0) {
      await writeJson(`D_${command.id}.json`, results[results.length - 1]);
      throw new Error(`${command.id} failed with exit ${result.exitCode}`);
    }
    if (!parsedStdout) {
      throw new Error(`${command.id} must emit JSON stdout`);
    }
    if (command.rawEvidence) {
      const evidence = await collectDRunEvidence(command, parsedStdout);
      evidenceFiles.push(evidence);
    }
  }
  return { results, evidenceFiles };
}

async function main() {
  await fs.mkdir(goldenDir, { recursive: true });
  const branch = (await runProcess('git', ['branch', '--show-current'])).stdout.trim();
  if (branch !== 'refactor/terminal-architecture') {
    throw new Error(`Task 0 must run on refactor/terminal-architecture, got ${branch}`);
  }

  const classicTools = await requestMcpListTools('src/index.js');
  const advancedTools = await requestMcpListTools('src/advanced/index.js');
  await writeJson('A_classic_list_tools.json', { source: 'classic', count: classicTools.length, tools: classicTools });
  await writeJson('A_advanced_list_tools.json', { source: 'advanced', count: advancedTools.length, tools: advancedTools });

  const cliDump = await dumpCliCatalogAndSchemas();
  await writeJson('B_cli_tool_list_all_sources.json', cliDump.tool_list);
  await writeJson('B_cli_tool_schemas.json', cliDump.schemas);
  await writeJson('B_cli_schema_errors.json', cliDump.schema_errors);

  const whitelist = Object.entries(SWITCH_ONLY_TOOLS).map(([name, info]) => ({
    name,
    domain: info.domain,
    reason: 'current switch-only handler has no CLI/MCP schema; terminal architecture will add schema',
    evidence: info.evidence,
  }));
  await writeJson('schema_net_new_whitelist.json', whitelist);

  const hiddenDump = internalSchemasFromCliDump(cliDump);
  const { snapshots, skips } = await buildToolCallSnapshots(classicTools, advancedTools, hiddenDump);
  await writeJson('C_tool_call_snapshots.json', {
    count: snapshots.length,
    expectedNodeBackedCount: 150,
    snapshots,
  });
  await writeJson('skip_list.json', skips);

  await prepareDArtifactPublish();
  const { results: dResults, evidenceFiles } = await runD();
  await cleanupDCommandFailureArtifacts();
  for (const evidence of evidenceFiles) {
    for (const [fileName, value] of evidence.files) {
      await writeJson(fileName, value);
    }
  }
  await writeJson('D_runner_outputs.json', dResults);

  await writeJson('manifest.json', {
    schemaVersion: 1,
    branch,
    generatedBy: 'scripts/migration/record_golden.mjs',
    counts: {
      classicListTools: classicTools.length,
      advancedListTools: advancedTools.length,
      cliDiscoverableTools: cliDump.tool_list.length,
      toolCallSnapshots: snapshots.length,
      skips: skips.length,
      schemaNetNewWhitelist: whitelist.length,
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
