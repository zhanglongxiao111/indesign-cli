import fs from 'node:fs/promises';
import path from 'node:path';

import { REAL_E2E_ROOT, writeJson } from './run-dir.mjs';

const DOMAIN_SCENARIOS = {
  server: 'bootstrap_contract',
  session: 'bootstrap_contract',
  utility: 'bootstrap_contract',
  script: 'script_transport',
  document: 'main_deck_setup',
  page: 'main_deck_setup',
  spread: 'masters_layers_spreads',
  master: 'masters_layers_spreads',
  layer: 'masters_layers_spreads',
  text: 'content_text_table',
  style: 'content_text_table',
  graphics: 'asset_graphics',
  object: 'destructive_scratch',
  template: 'template_flow',
  export: 'export_package',
  book: 'book_hidden',
  presentation: 'presentation_hidden',
};

export async function loadCoverageOverrides() {
  const filePath = path.join(REAL_E2E_ROOT, 'coverage-overrides.json');
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function buildCoverageBaseline(run, catalog) {
  const overrides = await loadCoverageOverrides();
  const overrideIds = Object.keys(overrides.overrides || {});
  const knownIds = new Set(catalog.map(tool => tool.tool_id));
  const unknownOverrides = overrideIds.filter(id => !knownIds.has(id));
  if (unknownOverrides.length) {
    throw new Error(`coverage-overrides contains unknown tool ids: ${unknownOverrides.join(', ')}`);
  }

  const tools = catalog.map(tool => {
    const override = overrides.overrides?.[tool.tool_id] || {};
    const scenario = override.scenario || DOMAIN_SCENARIOS[tool.domain] || 'uncategorized';
    return {
      tool_id: tool.tool_id,
      source: tool.source,
      backend: tool.backend,
      domain: tool.domain,
      scenario,
      status: 'pending',
      call_sequence: [],
      stdout_path: null,
      stderr_path: null,
      artifact_paths: [],
      audit_refs: [],
      fixture_id: override.fixture_id || `${scenario}:default`,
      accept_id: override.accept_id || `${scenario}:default`,
      cleanup_id: override.cleanup_id || `${scenario}:default`,
    };
  });

  const baseline = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    tools,
  };
  await writeJson(path.join(run.dirs.reports, 'coverage-baseline.json'), baseline);
  await writeCoverageReport(run, tools, { mode: 'inventory' });
  return baseline;
}

export async function readCoverageTools(run) {
  const reportPath = path.join(run.dirs.reports, 'coverage-report.json');
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  return report.tools;
}

export async function ensureCoverageBaseline(run) {
  const reportPath = path.join(run.dirs.reports, 'coverage-report.json');
  try {
    await fs.access(reportPath);
  } catch {
    throw new Error('coverage-report.json is missing; run inventory before executing real E2E phases.');
  }
}

export async function recordCoverage(run, toolId, update = {}) {
  await ensureCoverageBaseline(run);
  const tools = await readCoverageTools(run);
  const tool = tools.find(entry => entry.tool_id === toolId);
  if (!tool) {
    throw new Error(`coverage report does not contain tool id: ${toolId}`);
  }

  const callSequence = Array.isArray(update.call_sequence)
    ? update.call_sequence
    : update.call
      ? [update.call.sequence]
      : [];
  const artifactPaths = Array.isArray(update.artifact_paths) ? update.artifact_paths : [];
  const auditRefs = Array.isArray(update.audit_refs) ? update.audit_refs : [];

  tool.status = update.status || tool.status;
  tool.call_sequence = [...new Set([...(tool.call_sequence || []), ...callSequence])];
  tool.stdout_path = update.stdout_path || update.call?.stdout_path || tool.stdout_path || null;
  tool.stderr_path = update.stderr_path || update.call?.stderr_path || tool.stderr_path || null;
  tool.artifact_paths = [...new Set([...(tool.artifact_paths || []), ...artifactPaths])];
  tool.audit_refs = [...new Set([...(tool.audit_refs || []), ...auditRefs])];
  if (update.backend) tool.backend = update.backend;
  if (update.note) tool.note = update.note;
  if (update.error) tool.error = update.error;

  return writeCoverageReport(run, tools, { mode: update.mode || 'phase' });
}

export async function recordCallCoverage(run, toolId, call, options = {}) {
  return recordCoverage(run, toolId, {
    status: options.status || (call.ok ? 'passed' : 'failed'),
    call,
    backend: call.backend,
    artifact_paths: options.artifact_paths || [],
    audit_refs: options.audit_refs || [],
    note: options.note,
    error: call.ok ? undefined : {
      exit_code: call.exit_code,
      stderr_path: call.stderr_path,
      stdout_path: call.stdout_path,
    },
  });
}

export async function writeCoverageReport(run, tools, extra = {}) {
  const unique = new Map(tools.map(tool => [tool.tool_id, tool]));
  const values = [...unique.values()];
  const summary = {
    schemaVersion: 1,
    mode: extra.mode || 'full',
    ability_total: values.length,
    current_callable_total: values.length,
    hidden_handler_total: values.filter(tool => tool.source === 'hidden_handler').length,
    passed: values.filter(tool => tool.status === 'passed').length,
    failed: values.filter(tool => tool.status === 'failed').length,
    blocked: values.filter(tool => tool.status === 'blocked').length,
    expected_failure_passed: values.filter(tool => tool.status === 'expected_failure_passed').length,
    not_callable: values.filter(tool => tool.status === 'not_callable').length,
    pending: values.filter(tool => tool.status === 'pending').length,
  };

  const report = {
    summary,
    tools: values,
  };
  await writeJson(path.join(run.dirs.reports, 'coverage-report.json'), report);
  return report;
}
