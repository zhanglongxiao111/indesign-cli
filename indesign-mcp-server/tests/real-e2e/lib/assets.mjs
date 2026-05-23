import fs from 'node:fs/promises';
import path from 'node:path';

import { REAL_E2E_ROOT, relativeToRun, writeJson } from './run-dir.mjs';

const SEED_ROOT = path.join(REAL_E2E_ROOT, 'seed-assets');

export async function prepareOfflineAssets(run) {
  await fs.cp(SEED_ROOT, run.dirs.assets, { recursive: true });

  const heroSource = path.join(run.dirs.assets, 'photos', 'hero-waterfront.jpg');
  const xmlSource = path.join(run.dirs.assets, 'data', 'site-data.xml');
  const stressImage = path.join(run.dirs.pathAssets, '滨水 图片.jpg');
  const stressXml = path.join(run.dirs.pathAssets, 'site data 中文.xml');
  await fs.copyFile(heroSource, stressImage);
  await fs.copyFile(xmlSource, stressXml);

  const manifest = JSON.parse(await fs.readFile(path.join(run.dirs.assets, 'manifest.json'), 'utf8'));
  const deckBrief = JSON.parse(await fs.readFile(path.join(REAL_E2E_ROOT, 'deck-brief.json'), 'utf8'));
  const assetIds = new Set(manifest.assets.map(asset => asset.id));
  const missingDeckAssets = [];
  for (const page of deckBrief.pages) {
    for (const assetId of page.required_assets || []) {
      if (!assetIds.has(assetId)) {
        missingDeckAssets.push({ page: page.page, assetId });
      }
    }
  }
  if (deckBrief.pages.length !== 28) {
    throw new Error(`deck-brief must contain 28 pages, found ${deckBrief.pages.length}`);
  }
  if (missingDeckAssets.length) {
    throw new Error(`deck-brief references missing assets: ${JSON.stringify(missingDeckAssets)}`);
  }

  const summary = {
    schemaVersion: 1,
    mode: 'offline',
    seedRoot: SEED_ROOT,
    assets: manifest.assets.map(asset => ({
      ...asset,
      runPath: relativeToRun(run, path.join(run.dirs.assets, asset.relativePath)),
    })),
    pathStress: {
      image: relativeToRun(run, stressImage),
      xml: relativeToRun(run, stressXml),
    },
    deckBrief: {
      project: deckBrief.project.name,
      pages: deckBrief.pages.length,
      missingDeckAssets,
    },
  };
  await writeJson(path.join(run.dirs.reports, 'asset-report.json'), summary);
  await writeJson(path.join(run.dirs.reports, 'deck-brief-report.json'), {
    schemaVersion: 1,
    project: deckBrief.project,
    pageCount: deckBrief.pages.length,
    pages: deckBrief.pages.map(page => ({
      page: page.page,
      title: page.title,
      label: page.required_labels?.[0] || null,
      assets: page.required_assets || [],
    })),
  });
  return summary;
}
