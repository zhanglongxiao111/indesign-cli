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

export async function runMainDeckSetup(run) {
  const brief = await loadDeckBrief(run);
  const documentPath = mainDocumentPath(run);

  await callRequired(run, 'document.create_document', {
    width: 914.4,
    height: 514.8,
    pages: 1,
    facingPages: false,
    pageOrientation: 'LANDSCAPE',
    bleedTop: 9,
    bleedBottom: 9,
    bleedInside: 9,
    bleedOutside: 9,
    marginTop: 36,
    marginBottom: 36,
    marginLeft: 42,
    marginRight: 42,
  });
  await callRequired(run, 'document.set_document_preferences', {
    preferenceType: 'GENERAL',
    preferences: {
      pageWidth: 320,
      pageHeight: 180,
      facingPages: false,
      documentBleedTopOffset: 3,
      documentBleedBottomOffset: 3,
      documentBleedInsideOrLeftOffset: 3,
      documentBleedOutsideOrRightOffset: 3,
    },
  });
  await callRequired(run, 'document.get_document_preferences', { preferenceType: 'GENERAL' });
  await callRequired(run, 'document.set_document_layout_preferences', {
    adjustLayout: false,
    adjustLayoutMargins: true,
    adjustLayoutPageBreaks: true,
  });
  await callRequired(run, 'document.get_document_layout_preferences', {});

  for (const layerName of ['background', 'photos', 'diagrams', 'text', 'annotations']) {
    await callRequired(run, 'layer.create_layer', { name: layerName, visible: true, locked: false, color: 'BLUE' });
  }
  await callRequired(run, 'layer.set_active_layer', { layerName: 'text' });
  await callRequired(run, 'layer.list_layers', {});

  for (const master of ['A-Cover', 'B-Content', 'C-Analysis']) {
    await callRequired(run, 'master.create_master_spread', { name: master });
  }
  await callRequired(run, 'master.duplicate_master_spread', {
    name: 'A-Cover',
    newName: 'D-Cover-Copy',
    masterIndex: 0,
    position: 'AT_END',
  });
  await callRequired(run, 'master.create_master_text_frame', {
    masterName: 'A-Cover',
    content: '东岸文化中心 / E2E',
    x: 42,
    y: 462,
    width: 420,
    height: 30,
    fontSize: 10,
  });
  await callRequired(run, 'master.create_master_rectangle', {
    masterName: 'A-Cover',
    x: 0,
    y: 0,
    width: 18,
    height: 514,
    fillColor: 'Black',
    strokeColor: 'Black',
    strokeWidth: 0,
  });
  await callRequired(run, 'master.create_master_guides', {
    masterName: 'A-Cover',
    numberOfRows: 2,
    numberOfColumns: 3,
    rowGutter: '6pt',
    columnGutter: '8pt',
    guideColor: '[0, 0, 255]',
    fitMargins: true,
  });
  await callRequired(run, 'master.get_master_spread_info', { name: 'A-Cover', masterIndex: 0 });
  await callRequired(run, 'document.list_master_spreads', {});

  await callRequired(run, 'page.add_page', { position: 'AT_END' });
  await callRequired(run, 'master.apply_master_spread', { masterName: 'A-Cover', pageRange: '1' });
  await callRequired(run, 'master.apply_master_spread', { masterName: 'B-Content', pageRange: '2-28' });

  const skeletonScript = await writeDeckSkeletonScript(run, brief);
  await scriptRunFile(run, skeletonScript, {
    artifact_paths: [relativeToRun(run, skeletonScript)],
    note: 'create 28-page architecture deck skeleton',
  });

  await callRequired(run, 'spread.list_spreads', {});
  await callRequired(run, 'spread.get_spread_info', { spreadIndex: 0 });
  await callRequired(run, 'spread.set_spread_properties', {
    spreadIndex: 0,
    name: 'e2e.spread.cover',
    allowPageShuffle: false,
    showMasterItems: true,
    spreadHidden: false,
  });
  await callRequired(run, 'spread.create_spread_guides', {
    spreadIndex: 0,
    numberOfRows: 2,
    numberOfColumns: 4,
    rowGutter: '6pt',
    columnGutter: '8pt',
    guideColor: 'BLUE',
    fitMargins: true,
  });
  await callRequired(run, 'spread.select_spread', { spreadIndex: 0 });

  await callRequired(run, 'page.navigate_to_page', { pageIndex: 0 });
  await callRequired(run, 'page.get_page_info', { pageIndex: 0 });
  await callRequired(run, 'page.set_page_properties', {
    pageIndex: 0,
    label: 'e2e.deck.page.01.cover',
    pageColor: 'BLUE',
    optionalPage: false,
  });
  await callRequired(run, 'page.adjust_page_layout', {
    pageIndex: 0,
    leftMargin: '14mm',
    topMargin: '12mm',
    rightMargin: '14mm',
    bottomMargin: '12mm',
  });
  await callRequired(run, 'page.create_page_guides', {
    pageIndex: 0,
    numberOfRows: 3,
    numberOfColumns: 4,
    rowGutter: '6pt',
    columnGutter: '8pt',
    guideColor: 'BLUE',
    fitMargins: true,
  });
  await callRequired(run, 'page.select_page', { pageIndex: 0 });
  await callRequired(run, 'page.zoom_to_page', { pageIndex: 0, zoomLevel: 100 });

  await callRequired(run, 'document.save_document', { filePath: documentPath }, {
    artifact_paths: [relativeToRun(run, documentPath)],
  });
  await callRequired(run, 'document.get_document_info', {});

  const { auditPath } = await runAudit(run);
  await writeCheckpoint(run, {
    phase: 'main_deck_setup',
    status: 'passed',
    open_documents_expected: [documentPath],
    main_document_path: documentPath,
    scratch_paths: [],
    next_phase: 'content_text_table',
  });

  return {
    status: 'passed',
    mainDocumentPath: documentPath,
    auditPath: relativeToRun(run, auditPath),
  };
}
