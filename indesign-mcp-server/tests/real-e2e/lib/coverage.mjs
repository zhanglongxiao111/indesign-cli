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
