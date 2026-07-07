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

export async function runBookHidden(run) {
  const mainPath = mainDocumentPath(run);
  const fixtureScript = await writeBookFixtureScript(run);
  const bookPath = path.join(run.dirs.outputs, 'architecture-book.indb');
  const docAPath = path.join(run.dirs.pathBook, 'chapter-01-site.indd');
  const docBPath = path.join(run.dirs.pathBook, 'chapter-02-design.indd');
  const bookPdfPath = path.join(run.dirs.outputs, 'architecture-book.pdf');
  const bookPackagePath = path.join(run.dirs.outputs, 'book-package');
  const preflightPath = path.join(run.dirs.outputs, 'book-preflight.txt');
  const missingPrintPath = path.join(run.dirs.outputs, 'missing-print-target.indb');

  await scriptRunFile(run, fixtureScript, {
    artifact_paths: [relativeToRun(run, fixtureScript), relativeToRun(run, docAPath), relativeToRun(run, docBPath)],
    note: 'create two saved InDesign chapter documents for book tools',
  });

  await callRequired(run, 'book.create_book', { filePath: bookPath }, {
    artifact_paths: [relativeToRun(run, bookPath)],
  });
  await callRequired(run, 'book.open_book', { filePath: bookPath });
  await callRequired(run, 'book.list_books', {});
  await scriptRunFile(run, await writeCloseBooksScript(run), {
    note: 'reset open Book state after open_book/list_books coverage',
  });
  await callRequired(run, 'book.add_document_to_book', { bookPath, documentPath: docAPath });
  await callRequired(run, 'book.add_document_to_book', { bookPath, documentPath: docBPath });
  await callRequired(run, 'book.get_book_info', { bookPath });
  await callRequired(run, 'book.set_book_properties', {
    bookPath,
    automaticPagination: true,
    automaticDocumentConversion: true,
    insertBlankPage: false,
    mergeIdenticalLayers: false,
    synchronizeParagraphStyle: true,
    synchronizeCharacterStyle: true,
    synchronizeSwatch: true,
  });
  await callRequired(run, 'book.synchronize_book', { bookPath });
  await callRequired(run, 'book.repaginate_book', { bookPath });
  await callRequired(run, 'book.update_all_cross_references', { bookPath });
  await callRequired(run, 'book.update_all_numbers', { bookPath });
  await callRequired(run, 'book.update_chapter_and_paragraph_numbers', { bookPath });
  await callRequired(run, 'book.preflight_book', {
    bookPath,
    outputPath: preflightPath,
    autoOpen: false,
  }, {
    artifact_paths: [relativeToRun(run, preflightPath)],
  });
  await callRequired(run, 'book.export_book', {
    bookPath,
    outputPath: bookPdfPath,
    format: 'PDF',
  }, {
    artifact_paths: [relativeToRun(run, bookPdfPath)],
  });
  await callRequired(run, 'book.package_book', {
    bookPath,
    outputPath: bookPackagePath,
    copyingFonts: false,
    copyingLinkedGraphics: true,
    copyingProfiles: false,
    updatingGraphics: false,
    includingHiddenLayers: false,
    ignorePreflightErrors: true,
    creatingReport: true,
    includeIdml: false,
    includePdf: false,
  }, {
    artifact_paths: [relativeToRun(run, bookPackagePath)],
  });
  await callExpectedFailure(run, 'book.print_book', {
    bookPath: missingPrintPath,
    printDialog: false,
    printerPreset: 'DEFAULT_VALUE',
  }, /Book file not found/i, {
    note: 'print_book is covered through safe missing-file guard to avoid sending a print job',
  });

  await callRequired(run, 'document.open_document', { filePath: mainPath }, {
    artifact_paths: [relativeToRun(run, mainPath)],
  });
  await writeCheckpoint(run, {
    phase: 'book_hidden',
    status: 'passed',
    open_documents_expected: [mainPath],
    main_document_path: mainPath,
    scratch_paths: [docAPath, docBPath, bookPath],
    next_phase: 'export_package',
  });
  return {
    status: 'passed',
    bookPath: relativeToRun(run, bookPath),
    bookPdfPath: relativeToRun(run, bookPdfPath),
  };
}
