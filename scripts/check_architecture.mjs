#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { registry } from '../src/tools/index.js';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const legacyServerFile = ['InDesign', 'MCP', 'Server.js'].join('');

const REMOVED_PATHS = [
  `src/core/${legacyServerFile}`,
  'src/handlers',
  'src/types'
];

const SCAN_ROOTS = ['src', 'tests', 'scripts', 'agent-harness'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.py']);
const OLD_IMPORT_PATTERNS = [
  /from\s+['"][^'"]*(?:src\/)?handlers\//,
  /from\s+['"][^'"]*(?:src\/)?types\//,
  new RegExp(`from\\s+['"][^'"]*${legacyServerFile.replace('.', '\\.')}['"]`),
  /import\([^)]*['"][^'"]*(?:src\/)?handlers\//,
  /import\([^)]*['"][^'"]*(?:src\/)?types\//,
  new RegExp(`import\\([^)]*['"][^'"]*${legacyServerFile.replace('.', '\\.')}['"]`)
];
const OLD_RUNTIME_TOKENS = [
  new RegExp(`new\\s+${legacyServerFile.replace('.js', '')}\\b`),
  /\bAdvancedTemplateHandlers\b/,
  /\ballToolDefinitions\b/,
  /\bTOOL_MAP\b/
];
const TASK4_LEGACY_TOKENS = [
  ['hidden_handler', 'schemas'].join('_'),
  ['infer', 'domain'].join('_'),
  ['hidden_handler', 'bridge'].join('_')
];
const FILE_SIZE_WARNING_BYTES = 60 * 1024;

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function walkFiles(rootDir) {
  const files = [];
  if (!fs.existsSync(rootDir)) {
    return files;
  }
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function isHistoricalWhitelist(relPath, line) {
  if (relPath === 'scripts/migration/record_golden.mjs' && line.includes('evidence:')) {
    return true;
  }
  if (relPath === 'src/tools/spread/placement.js' && line.trim().startsWith('// Source:')) {
    return true;
  }
  return false;
}

function isTask4LegacyWhitelist(relPath, line, token) {
  return (
    token === ['hidden_handler', 'bridge'].join('_') &&
    relPath === 'agent-harness/cli_anything/indesign/tests/test_core.py' &&
    line.includes('assert not') &&
    line.includes('exists()')
  );
}

function assertRegistryLoads() {
  if (!registry || !Array.isArray(registry.tools)) {
    throw new Error('registry did not load');
  }
  if (registry.tools.length !== 150) {
    throw new Error(`registry tool count mismatch: expected 150, got ${registry.tools.length}`);
  }
}

function assertArtifactCurrent() {
  execFileSync(process.execPath, ['src/core/artifact.js', '--check'], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
}

function assertRemovedPathsAbsent() {
  const existing = REMOVED_PATHS.filter((rel) => fs.existsSync(path.join(repoRoot, rel)));
  if (existing.length) {
    throw new Error(`removed architecture paths still exist: ${existing.join(', ')}`);
  }
}

function assertNoOldRuntimeReferences() {
  const violations = [];
  const whitelisted = [];
  for (const root of SCAN_ROOTS) {
    for (const filePath of walkFiles(path.join(repoRoot, root))) {
      const rel = relativePath(filePath);
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        const matchesOldImport = OLD_IMPORT_PATTERNS.some((pattern) => pattern.test(line));
        const matchesOldRuntimeToken = OLD_RUNTIME_TOKENS.some((pattern) => pattern.test(line));
        const containsHistoricalPath = /src[\/\\](?:handlers|types)[\/\\]/.test(line);
        if (!matchesOldImport && !matchesOldRuntimeToken && !containsHistoricalPath) {
          return;
        }
        const hit = `${rel}:${index + 1}: ${line.trim()}`;
        if (isHistoricalWhitelist(rel, line) && !matchesOldImport && !matchesOldRuntimeToken) {
          whitelisted.push(hit);
          return;
        }
        violations.push(hit);
      });
    }
  }
  if (whitelisted.length) {
    console.error(`Historical whitelist entries: ${whitelisted.length}`);
  }
  if (violations.length) {
    throw new Error(`old architecture references found:\n${violations.join('\n')}`);
  }
}

function assertNoTask4LegacyTokens() {
  const violations = [];
  const whitelisted = [];
  for (const root of SCAN_ROOTS) {
    for (const filePath of walkFiles(path.join(repoRoot, root))) {
      const rel = relativePath(filePath);
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const token of TASK4_LEGACY_TOKENS) {
          if (!line.includes(token)) continue;
          const hit = `${rel}:${index + 1}: ${line.trim()}`;
          if (isTask4LegacyWhitelist(rel, line, token)) {
            whitelisted.push(hit);
            continue;
          }
          violations.push(hit);
        }
      });
    }
  }
  if (whitelisted.length) {
    console.error(`Task 4 legacy whitelist entries: ${whitelisted.length}`);
  }
  if (violations.length) {
    throw new Error(`Task 4 legacy tokens found:\n${violations.join('\n')}`);
  }
}

function warnLargeFiles() {
  const warnings = [];
  for (const root of SCAN_ROOTS) {
    for (const filePath of walkFiles(path.join(repoRoot, root))) {
      const size = fs.statSync(filePath).size;
      if (size > FILE_SIZE_WARNING_BYTES) {
        warnings.push(`${relativePath(filePath)} (${size} bytes)`);
      }
    }
  }
  if (warnings.length) {
    console.error(`File size warnings:\n${warnings.join('\n')}`);
  }
}

try {
  assertRegistryLoads();
  assertArtifactCurrent();
  assertRemovedPathsAbsent();
  assertNoOldRuntimeReferences();
  assertNoTask4LegacyTokens();
  warnLargeFiles();
  console.log('Architecture check passed');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
