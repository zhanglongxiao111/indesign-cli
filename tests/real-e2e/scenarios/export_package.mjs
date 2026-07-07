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

export async function runExportPackage(run) {
  const documentPath = mainDocumentPath(run);
  const pdfPath = path.join(run.dirs.outputs, 'architecture-presentation.pdf');
  const imagesPath = path.join(run.dirs.outputs, 'page-images');
  const epubPath = path.join(run.dirs.outputs, 'architecture-presentation.epub');
  const packagePath = run.dirs.pathPackage;
  const cleanupScript = await writeMainDeckFinalCleanupScript(run);

  await callRequired(run, 'document.open_document', { filePath: documentPath }, {
    artifact_paths: [relativeToRun(run, documentPath)],
  });
  await callRequired(run, 'page.delete_page', { pageIndex: 28 });
  await scriptRunFile(run, cleanupScript, {
    artifact_paths: [relativeToRun(run, cleanupScript)],
    note: 'ensure main architecture deck returns to 28 pages before export',
  });
  const { auditPath } = await runAudit(run, 'final-export-ready');

  await callRequired(run, 'export.export_pdf', {
    filePath: pdfPath,
    pages: 'all',
    quality: 'PRINT',
    includeBleed: true,
    includeMarks: false,
  }, {
    artifact_paths: [relativeToRun(run, pdfPath)],
  });
  await callRequired(run, 'export.verify', { path: pdfPath }, {
    artifact_paths: [relativeToRun(run, pdfPath)],
    audit_refs: [relativeToRun(run, auditPath)],
    note: 'verify final architecture presentation PDF',
  });
  await callRequired(run, 'export.export_images', {
    outputPath: imagesPath,
    format: 'JPEG',
    resolution: 144,
    quality: 80,
    pages: '1-4',
  }, {
    artifact_paths: [relativeToRun(run, imagesPath)],
  });
  await callRequired(run, 'export.export_epub', {
    filePath: epubPath,
  }, {
    artifact_paths: [relativeToRun(run, epubPath)],
  });
  await callRequired(run, 'export.package_document', {
    outputPath: packagePath,
    includeFonts: false,
    includeLinks: true,
    includeProfiles: false,
  }, {
    artifact_paths: [relativeToRun(run, packagePath)],
  });
  await callRequired(run, 'document.save_document', { filePath: documentPath }, {
    artifact_paths: [relativeToRun(run, documentPath)],
  });

  await writeCheckpoint(run, {
    phase: 'export_package',
    status: 'passed',
    open_documents_expected: [documentPath],
    main_document_path: documentPath,
    scratch_paths: [],
    next_phase: 'complete',
  });
  return {
    status: 'passed',
    pdfPath: relativeToRun(run, pdfPath),
    imagesPath: relativeToRun(run, imagesPath),
    epubPath: relativeToRun(run, epubPath),
    packagePath: relativeToRun(run, packagePath),
  };
}
