import path from 'node:path';

import { runCli } from './cli.mjs';
import { writeJson } from './run-dir.mjs';

const SOURCES = ['cli', 'cli.primitive', 'script', 'advanced', 'classic', 'hidden_handler'];

function backendFor(source) {
  if (source === 'hidden_handler') return 'hidden_handler_bridge';
  if (source === 'advanced') return 'mcp_advanced';
  if (source === 'classic') return 'mcp_classic';
  if (source === 'script') return 'script_bridge';
  return 'cli';
}

export async function captureCatalog(run) {
  const warnings = [];
  const version = await runCli(run, ['--version'], { toolId: null, source: 'cli', backend: 'cli' });
  if (!version.ok) warnings.push('version command failed');

  const domains = await runCli(run, ['tool', 'domains'], { source: 'cli', backend: 'cli' });
  if (!domains.ok) throw new Error('tool domains failed');

  const tools = [];
  for (const source of SOURCES) {
    const listed = await runCli(run, ['tool', 'list', '--source', source, '--callable-only'], {
      source,
      backend: backendFor(source),
    });
    if (!listed.ok) throw new Error(`tool list failed for source ${source}`);
    for (const tool of listed.payload.data || []) {
      tools.push(tool);
    }
  }

  const seen = new Set();
  const duplicateIds = [];
  for (const tool of tools) {
    if (seen.has(tool.id)) duplicateIds.push(tool.id);
    seen.add(tool.id);
  }
  if (duplicateIds.length) {
    throw new Error(`duplicate tool ids: ${duplicateIds.join(', ')}`);
  }

  const schemaById = {};
  for (const tool of tools) {
    const schema = await runCli(run, ['tool', 'schema', tool.id], {
      toolId: tool.id,
      source: tool.source,
      backend: backendFor(tool.source),
    });
    if (!schema.ok) throw new Error(`tool schema failed for ${tool.id}`);
    schemaById[tool.id] = schema.payload.data.inputSchema;
  }

  const sessionShow = await runCli(run, ['tool', 'call', 'session.show', '--args', await writeArgs(run, 'session-show', {})], {
    toolId: 'session.show',
    source: 'cli',
    backend: 'cli',
  });
  if (!sessionShow.ok) warnings.push('session.show call failed');

  const utilityHelp = tools.find(tool => tool.id === 'utility.help');
  if (utilityHelp) {
    const help = await runCli(run, ['tool', 'call', 'utility.help', '--args', await writeArgs(run, 'utility-help', {})], {
      toolId: 'utility.help',
      source: utilityHelp.source,
      backend: backendFor(utilityHelp.source),
    });
    if (!help.ok) warnings.push('utility.help call failed');
  }

  const catalog = tools.map(tool => ({
    tool_id: tool.id,
    source: tool.source,
    domain: tool.domain,
    name: tool.name,
    arg_names: tool.arg_names,
    schema: schemaById[tool.id],
    callable: tool.callable,
    side_effects: tool.side_effects,
    needs_indesign: tool.needs_indesign,
    produces_artifacts: tool.produces_artifacts,
    backend: backendFor(tool.source),
  }));

  const summary = {
    schemaVersion: 1,
    total: catalog.length,
    bySource: Object.fromEntries(SOURCES.map(source => [source, catalog.filter(tool => tool.source === source).length])),
    byDomain: catalog.reduce((acc, tool) => {
      acc[tool.domain] = (acc[tool.domain] || 0) + 1;
      return acc;
    }, {}),
    warnings,
  };

  await writeJson(path.join(run.dirs.reports, 'tool-domains.json'), domains.payload.data);
  await writeJson(path.join(run.dirs.reports, 'tool-catalog.json'), catalog);
  await writeJson(path.join(run.dirs.reports, 'tool-catalog-summary.json'), summary);
  return { catalog, summary };
}

async function writeArgs(run, name, payload) {
  const filePath = path.join(run.dirs.logs, `${name}-args.json`);
  await writeJson(filePath, payload);
  return filePath;
}
