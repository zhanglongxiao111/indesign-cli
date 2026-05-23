#!/usr/bin/env node
import path from 'node:path';

import { prepareOfflineAssets } from './lib/assets.mjs';
import { captureCatalog } from './lib/catalog.mjs';
import { buildCoverageBaseline } from './lib/coverage.mjs';
import { createRunContext, writeCheckpoint, writeJson } from './lib/run-dir.mjs';

function parseArgs(argv) {
  const options = {
    argv,
    inventory: false,
    full: false,
    offline: false,
    keepOpen: false,
    phase: null,
    tool: null,
    runId: null,
    resumeFrom: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--inventory') options.inventory = true;
    else if (arg === '--full') options.full = true;
    else if (arg === '--offline') options.offline = true;
    else if (arg === '--keep-open') options.keepOpen = true;
    else if (arg === '--phase') options.phase = argv[++index];
    else if (arg === '--tool') options.tool = argv[++index];
    else if (arg === '--run-id') options.runId = argv[++index];
    else if (arg === '--resume-from') options.resumeFrom = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.inventory && !options.full && !options.phase && !options.tool) {
    options.inventory = true;
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node tests/real-e2e/run-architecture-presentation.mjs --inventory --offline
  node tests/real-e2e/run-architecture-presentation.mjs --phase assets --offline
  node tests/real-e2e/run-architecture-presentation.mjs --full --offline

Options:
  --inventory          Generate catalog, schemas, baseline reports without launching InDesign
  --phase <name>       Run a single phase. Currently supported: assets, inventory
  --tool <tool_id>     Reserve a single-tool rerun slot for later full E2E implementation
  --offline            Use checked-in seed assets
  --run-id <id>        Use a stable run directory id
  --resume-from <name> Reserve checkpoint resume for later full E2E implementation
`);
}

async function runInventory(run) {
  const { catalog, summary } = await captureCatalog(run);
  await buildCoverageBaseline(run, catalog);
  await writeCheckpoint(run, {
    phase: 'inventory',
    status: 'passed',
    open_documents_expected: [],
    main_document_path: null,
    scratch_paths: [],
    next_phase: 'assets',
  });
  return { catalogSummary: summary };
}

async function runAssets(run) {
  const assetReport = await prepareOfflineAssets(run);
  await writeCheckpoint(run, {
    phase: 'assets',
    status: 'passed',
    open_documents_expected: [],
    main_document_path: null,
    scratch_paths: [],
    next_phase: 'main_deck_setup',
  });
  return { assetReport };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const run = await createRunContext(options);
  const results = {
    runId: run.id,
    runRoot: run.root,
    phases: [],
  };

  if (options.phase === 'assets') {
    results.phases.push({ phase: 'assets', ...(await runAssets(run)) });
  } else if (options.phase === 'inventory' || options.inventory) {
    results.phases.push({ phase: 'inventory', ...(await runInventory(run)) });
    if (options.offline) {
      results.phases.push({ phase: 'assets', ...(await runAssets(run)) });
    }
  } else if (options.full) {
    results.phases.push({ phase: 'inventory', ...(await runInventory(run)) });
    results.phases.push({ phase: 'assets', ...(await runAssets(run)) });
    await writeJson(path.join(run.dirs.reports, 'full-status.json'), {
      status: 'blocked',
      reason: 'Full InDesign execution phases are not implemented in this checkpoint.',
      implemented: ['inventory', 'assets'],
    });
    throw new Error('Full InDesign execution phases are not implemented yet. Inventory and assets were generated.');
  } else if (options.tool) {
    throw new Error('--tool rerun is reserved for the full E2E implementation checkpoint.');
  } else {
    throw new Error('No runnable phase selected.');
  }

  await writeJson(path.join(run.dirs.reports, 'runner-summary.json'), results);
  console.log(JSON.stringify({ ok: true, ...results }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
