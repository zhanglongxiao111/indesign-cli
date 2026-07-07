#!/usr/bin/env node
import path from 'node:path';

import { prepareOfflineAssets } from './lib/assets.mjs';
import { captureCatalog } from './lib/catalog.mjs';
import { buildCoverageBaseline } from './lib/coverage.mjs';
import { createRunContext, writeCheckpoint, writeJson } from './lib/run-dir.mjs';
import { runBootstrapContract } from './scenarios/bootstrap_contract.mjs';
import { runBookHidden } from './scenarios/book_hidden.mjs';
import { runContentTextAndAssets } from './scenarios/content_text_table.mjs';
import { runDestructiveScratch } from './scenarios/destructive_scratch.mjs';
import { runExportPackage } from './scenarios/export_package.mjs';
import { runMainDeckSetup } from './scenarios/main_deck_setup.mjs';
import { runPresentationHidden } from './scenarios/presentation_hidden.mjs';
import { runTemplateAndScriptTransport } from './scenarios/template_flow.mjs';

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
  node tests/real-e2e/run-architecture-presentation.mjs --phase main_deck_setup --offline
  node tests/real-e2e/run-architecture-presentation.mjs --phase content_text_table --offline
  node tests/real-e2e/run-architecture-presentation.mjs --phase template_flow --offline
  node tests/real-e2e/run-architecture-presentation.mjs --phase destructive_scratch --offline
  node tests/real-e2e/run-architecture-presentation.mjs --phase presentation_hidden --offline
  node tests/real-e2e/run-architecture-presentation.mjs --phase book_hidden --offline
  node tests/real-e2e/run-architecture-presentation.mjs --phase export_package --offline
  node tests/real-e2e/run-architecture-presentation.mjs --full --offline

Options:
  --inventory          Generate catalog, schemas, baseline reports without launching InDesign
  --phase <name>       Run a single phase. Supported: assets, inventory, bootstrap_contract, main_deck_setup, content_text_table, template_flow, destructive_scratch, presentation_hidden, book_hidden, export_package
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

async function ensureInventoryAndAssets(run, results) {
  results.phases.push({ phase: 'inventory', ...(await runInventory(run)) });
  results.phases.push({ phase: 'assets', ...(await runAssets(run)) });
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
  } else if (options.phase === 'bootstrap_contract') {
    await ensureInventoryAndAssets(run, results);
    results.phases.push({ phase: 'bootstrap_contract', ...(await runBootstrapContract(run)) });
  } else if (options.phase === 'main_deck_setup') {
    await ensureInventoryAndAssets(run, results);
    results.phases.push({ phase: 'bootstrap_contract', ...(await runBootstrapContract(run)) });
    results.phases.push({ phase: 'main_deck_setup', ...(await runMainDeckSetup(run)) });
  } else if (options.phase === 'content_text_table') {
    await ensureInventoryAndAssets(run, results);
    results.phases.push({ phase: 'bootstrap_contract', ...(await runBootstrapContract(run)) });
    results.phases.push({ phase: 'main_deck_setup', ...(await runMainDeckSetup(run)) });
    results.phases.push({ phase: 'content_text_table', ...(await runContentTextAndAssets(run)) });
  } else if (options.phase === 'template_flow') {
    await ensureInventoryAndAssets(run, results);
    results.phases.push({ phase: 'bootstrap_contract', ...(await runBootstrapContract(run)) });
    results.phases.push({ phase: 'main_deck_setup', ...(await runMainDeckSetup(run)) });
    results.phases.push({ phase: 'content_text_table', ...(await runContentTextAndAssets(run)) });
    results.phases.push({ phase: 'template_flow', ...(await runTemplateAndScriptTransport(run)) });
  } else if (options.phase === 'destructive_scratch') {
    await ensureInventoryAndAssets(run, results);
    results.phases.push({ phase: 'bootstrap_contract', ...(await runBootstrapContract(run)) });
    results.phases.push({ phase: 'main_deck_setup', ...(await runMainDeckSetup(run)) });
    results.phases.push({ phase: 'content_text_table', ...(await runContentTextAndAssets(run)) });
    results.phases.push({ phase: 'template_flow', ...(await runTemplateAndScriptTransport(run)) });
    results.phases.push({ phase: 'destructive_scratch', ...(await runDestructiveScratch(run)) });
  } else if (options.phase === 'presentation_hidden') {
    await ensureInventoryAndAssets(run, results);
    results.phases.push({ phase: 'bootstrap_contract', ...(await runBootstrapContract(run)) });
    results.phases.push({ phase: 'main_deck_setup', ...(await runMainDeckSetup(run)) });
    results.phases.push({ phase: 'content_text_table', ...(await runContentTextAndAssets(run)) });
    results.phases.push({ phase: 'template_flow', ...(await runTemplateAndScriptTransport(run)) });
    results.phases.push({ phase: 'destructive_scratch', ...(await runDestructiveScratch(run)) });
    results.phases.push({ phase: 'presentation_hidden', ...(await runPresentationHidden(run)) });
  } else if (options.phase === 'book_hidden') {
    await ensureInventoryAndAssets(run, results);
    results.phases.push({ phase: 'bootstrap_contract', ...(await runBootstrapContract(run)) });
    results.phases.push({ phase: 'main_deck_setup', ...(await runMainDeckSetup(run)) });
    results.phases.push({ phase: 'content_text_table', ...(await runContentTextAndAssets(run)) });
    results.phases.push({ phase: 'template_flow', ...(await runTemplateAndScriptTransport(run)) });
    results.phases.push({ phase: 'destructive_scratch', ...(await runDestructiveScratch(run)) });
    results.phases.push({ phase: 'presentation_hidden', ...(await runPresentationHidden(run)) });
    results.phases.push({ phase: 'book_hidden', ...(await runBookHidden(run)) });
  } else if (options.phase === 'export_package') {
    await ensureInventoryAndAssets(run, results);
    results.phases.push({ phase: 'bootstrap_contract', ...(await runBootstrapContract(run)) });
    results.phases.push({ phase: 'main_deck_setup', ...(await runMainDeckSetup(run)) });
    results.phases.push({ phase: 'content_text_table', ...(await runContentTextAndAssets(run)) });
    results.phases.push({ phase: 'template_flow', ...(await runTemplateAndScriptTransport(run)) });
    results.phases.push({ phase: 'destructive_scratch', ...(await runDestructiveScratch(run)) });
    results.phases.push({ phase: 'presentation_hidden', ...(await runPresentationHidden(run)) });
    results.phases.push({ phase: 'book_hidden', ...(await runBookHidden(run)) });
    results.phases.push({ phase: 'export_package', ...(await runExportPackage(run)) });
  } else if (options.full) {
    await ensureInventoryAndAssets(run, results);
    results.phases.push({ phase: 'bootstrap_contract', ...(await runBootstrapContract(run)) });
    results.phases.push({ phase: 'main_deck_setup', ...(await runMainDeckSetup(run)) });
    results.phases.push({ phase: 'content_text_table', ...(await runContentTextAndAssets(run)) });
    results.phases.push({ phase: 'template_flow', ...(await runTemplateAndScriptTransport(run)) });
    results.phases.push({ phase: 'destructive_scratch', ...(await runDestructiveScratch(run)) });
    results.phases.push({ phase: 'presentation_hidden', ...(await runPresentationHidden(run)) });
    results.phases.push({ phase: 'book_hidden', ...(await runBookHidden(run)) });
    results.phases.push({ phase: 'export_package', ...(await runExportPackage(run)) });
    await writeJson(path.join(run.dirs.reports, 'full-status.json'), {
      status: 'passed',
      implemented: [
        'inventory',
        'assets',
        'bootstrap_contract',
        'main_deck_setup',
        'content_text_table',
        'template_flow',
        'destructive_scratch',
        'presentation_hidden',
        'book_hidden',
        'export_package',
      ],
    });
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
