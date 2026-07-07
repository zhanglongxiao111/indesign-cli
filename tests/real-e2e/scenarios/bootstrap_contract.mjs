import fs from 'node:fs/promises';
import path from 'node:path';

import {
  callExpectedFailure,
  callRequired,
  dataPath,
  isSemanticallyOk,
  jsxPath,
  loadDeckBrief,
  mainDocumentPath,
  photoPath,
  recordCallCoverage,
  relativeToRun,
  runAudit,
  runCli,
  scriptRunFile,
  semanticText,
  svgPath,
  toolCall,
  writeBookFixtureScript,
  writeCheckpoint,
  writeCloseBooksScript,
  writeDeckSkeletonScript,
  writeDestructiveScratchSetupScript,
  writeJson,
  writeMainDeckFinalCleanupScript,
  writePopulateContentScript,
  writePresentationNavigationScript,
  writeScratchIndexScript,
  writeTemplateSetupScript,
} from './shared.mjs';

export async function runBootstrapContract(run) {
  await callRequired(run, 'session.clear', {});
  await callRequired(run, 'server.health', { deep: true });
  await callRequired(run, 'session.show', {});
  await callRequired(run, 'utility.help', {});
  await writeCheckpoint(run, {
    phase: 'bootstrap_contract',
    status: 'passed',
    open_documents_expected: [],
    main_document_path: null,
    scratch_paths: [],
    next_phase: 'main_deck_setup',
  });
  return { status: 'passed' };
}
