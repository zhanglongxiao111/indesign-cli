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

export async function runDestructiveScratch(run) {
  const mainPath = mainDocumentPath(run);
  const setupScript = await writeDestructiveScratchSetupScript(run);
  const scratchPath = path.join(run.dirs.outputs, 'destructive-scratch.indd');
  await scriptRunFile(run, setupScript, {
    artifact_paths: [relativeToRun(run, setupScript), relativeToRun(run, scratchPath)],
    note: 'create scratch document for destructive commands',
  });

  const indexScript = await writeScratchIndexScript(run);
  const indexCall = await scriptRunFile(run, indexScript, {
    artifact_paths: [relativeToRun(run, indexScript)],
    allowAnyText: true,
    note: 'inspect scratch group indexes',
  });
  let indexes = { groupIndex: 0, itemIndex: 1 };
  try {
    indexes = JSON.parse(semanticText(indexCall));
  } catch {}

  await callRequired(run, 'page.duplicate_page', { pageIndex: 0 });
  await callRequired(run, 'page.move_page', { pageIndex: 1, newPosition: 'AT_END', position: 'AT_END' });
  await callRequired(run, 'page.resize_page', { pageIndex: 0, width: 430, height: 300 });
  await callRequired(run, 'page.snapshot_page_layout', { pageIndex: 0 });
  await callRequired(run, 'page.delete_page_layout_snapshot', { pageIndex: 0 });
  await callRequired(run, 'page.delete_all_page_layout_snapshots', { pageIndex: 0 });
  await callRequired(run, 'page.reframe_page', { pageIndex: 0, x1: 0, y1: 0, x2: 420, y2: 297 });
  await callRequired(run, 'page.get_page_content_summary', { pageIndex: 0 });

  await callRequired(run, 'object.get_group_info', { pageIndex: 0, groupIndex: indexes.groupIndex });
  await callRequired(run, 'object.set_group_properties', {
    pageIndex: 0,
    groupIndex: indexes.groupIndex,
    visible: true,
    locked: false,
    name: 'E2E Scratch Group',
  });
  await callRequired(run, 'page.list_groups', { pageIndex: 0 });
  await callRequired(run, 'object.create_group_from_items', { pageIndex: 1, itemIndices: [0, 1] });
  await callRequired(run, 'object.create_group', { pageIndex: 0 });
  await callRequired(run, 'page.add_item_to_group', { pageIndex: 0, groupIndex: indexes.groupIndex, itemIndex: indexes.itemIndex });
  await callRequired(run, 'page.remove_item_from_group', { pageIndex: 0, groupIndex: indexes.groupIndex, itemIndex: 0 });
  await callRequired(run, 'object.ungroup', { pageIndex: 0, groupIndex: indexes.groupIndex });
  await callRequired(run, 'page.delete_page_item', { pageIndex: 0, itemIndex: 0 });

  await callRequired(run, 'spread.duplicate_spread', { spreadIndex: 0 });
  await callRequired(run, 'spread.move_spread', { spreadIndex: 1, position: 'AT_END' });
  await callRequired(run, 'spread.place_file_on_spread', {
    spreadIndex: 0,
    filePath: svgPath(run, 'section'),
    x: 260,
    y: 60,
    layerName: '',
  });
  await callRequired(run, 'spread.get_spread_content_summary', { spreadIndex: 0 });
  await callRequired(run, 'spread.delete_spread', { spreadIndex: 1 });

  await callRequired(run, 'master.detach_master_items', { pageIndex: 1 });
  await callRequired(run, 'master.remove_master_override', { pageIndex: 1, itemIndex: 0 });
  await callRequired(run, 'master.delete_master_spread', { name: 'Z-Scratch', masterIndex: 1 });
  await callRequired(run, 'document.organize_document_layers', { deleteEmptyLayers: false, sortLayers: true });
  await callRequired(run, 'document.get_session_info', {});
  await callRequired(run, 'document.clear_session', {});
  await callRequired(run, 'document.close_document', {
    expectedDocumentName: path.basename(scratchPath),
    allowDiscard: true,
  });

  await callRequired(run, 'document.open_document', { filePath: mainPath }, {
    artifact_paths: [relativeToRun(run, mainPath)],
  });
  await writeCheckpoint(run, {
    phase: 'destructive_scratch',
    status: 'passed',
    open_documents_expected: [mainPath],
    main_document_path: mainPath,
    scratch_paths: [scratchPath],
    next_phase: 'presentation_hidden',
  });
  return { status: 'passed', scratchPath: relativeToRun(run, scratchPath) };
}
