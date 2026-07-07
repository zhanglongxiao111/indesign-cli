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

export async function runPresentationHidden(run) {
  const mainPath = mainDocumentPath(run);
  const presentationPath = path.join(run.dirs.outputs, 'presentation-hidden.indd');
  const presentationPdfPath = path.join(run.dirs.outputs, 'presentation-hidden.pdf');

  await callRequired(run, 'presentation.create_presentation_document', {
    preset: 'RATIO_16x9',
    pages: 1,
    facingPages: false,
  });
  await callRequired(run, 'presentation.add_cover_page', {
    title: '东岸文化中心',
    subtitle: 'CLI-Anything Presentation Handler E2E',
    bgImagePath: photoPath(run, 'hero-waterfront'),
  });

  await scriptRunFile(run, await writePresentationNavigationScript(run, 1, 'presentation-page-2.jsx'), {
    note: 'prepare presentation section page',
  });
  await callRequired(run, 'presentation.add_section_page', {
    title: '场地、策略与形体',
  });

  await scriptRunFile(run, await writePresentationNavigationScript(run, 2, 'presentation-page-3.jsx'), {
    note: 'prepare presentation full bleed page',
  });
  await callRequired(run, 'presentation.add_full_bleed_image', {
    filePath: photoPath(run, 'architecture-facade'),
    caption: '立面与材料测试页',
  });

  await scriptRunFile(run, await writePresentationNavigationScript(run, 3, 'presentation-page-4.jsx'), {
    note: 'prepare presentation image grid page',
  });
  await callRequired(run, 'presentation.add_image_grid', {
    files: [
      photoPath(run, 'hero-waterfront'),
      photoPath(run, 'industrial-site'),
      photoPath(run, 'urban-site'),
      photoPath(run, 'green-roof'),
      photoPath(run, 'brick-material'),
      photoPath(run, 'architecture-facade'),
    ],
    rows: 2,
    columns: 3,
    gap: 6,
  });

  await callRequired(run, 'document.save_document', { filePath: presentationPath }, {
    artifact_paths: [relativeToRun(run, presentationPath)],
    note: 'save presentation hidden handler fixture',
  });
  await callRequired(run, 'presentation.export_presentation_pdf', {
    filePath: presentationPdfPath,
    preset: 'High Quality Print',
  }, {
    artifact_paths: [relativeToRun(run, presentationPdfPath)],
  });
  await callRequired(run, 'export.verify', { path: presentationPdfPath }, {
    artifact_paths: [relativeToRun(run, presentationPdfPath)],
    note: 'verify presentation hidden handler PDF',
  });
  await callRequired(run, 'document.close_document', {
    expectedDocumentName: path.basename(presentationPath),
    allowDiscard: true,
  });
  await callRequired(run, 'document.open_document', { filePath: mainPath }, {
    artifact_paths: [relativeToRun(run, mainPath)],
  });

  await writeCheckpoint(run, {
    phase: 'presentation_hidden',
    status: 'passed',
    open_documents_expected: [mainPath],
    main_document_path: mainPath,
    scratch_paths: [presentationPath],
    next_phase: 'book_hidden',
  });
  return {
    status: 'passed',
    presentationPath: relativeToRun(run, presentationPath),
    presentationPdfPath: relativeToRun(run, presentationPdfPath),
  };
}
