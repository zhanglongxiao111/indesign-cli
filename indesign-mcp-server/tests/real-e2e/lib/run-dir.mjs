import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REAL_E2E_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(REAL_E2E_ROOT, '..', '..');
export const RUNS_ROOT = path.join(REPO_ROOT, '.indesign-e2e-runs');

function pad(value) {
  return String(value).padStart(2, '0');
}

export function timestampRunId(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    '-arch-presentation',
  ].join('');
}

export function relativeToRun(run, value) {
  return path.relative(run.root, value).replace(/\\/g, '/');
}

export async function createRunContext(options) {
  const runId = options.runId || timestampRunId();
  const root = path.join(RUNS_ROOT, runId);
  const dirs = {
    root,
    assets: path.join(root, 'assets'),
    scripts: path.join(root, 'scripts'),
    outputs: path.join(root, 'outputs'),
    reports: path.join(root, 'reports'),
    logs: path.join(root, 'logs'),
    stdout: path.join(root, 'logs', 'stdout'),
    stderr: path.join(root, 'logs', 'stderr'),
    failures: path.join(root, 'logs', 'failures'),
    pathAssets: path.join(root, 'assets', '路径 测试'),
    pathBook: path.join(root, 'outputs', '路径 测试', 'book docs'),
    pathPackage: path.join(root, 'outputs', '路径 测试', 'package out'),
  };

  await fs.mkdir(root, { recursive: true });
  for (const dir of Object.values(dirs)) {
    await fs.mkdir(dir, { recursive: true });
  }

  const run = {
    id: runId,
    root,
    dirs,
    repoRoot: REPO_ROOT,
    realE2eRoot: REAL_E2E_ROOT,
    options,
    startedAt: new Date().toISOString(),
    sequence: 0,
  };

  await writeJson(path.join(root, 'manifest.json'), {
    schemaVersion: 1,
    runId,
    startedAt: run.startedAt,
    argv: options.argv,
    options: {
      full: options.full,
      inventory: options.inventory,
      offline: options.offline,
      keepOpen: options.keepOpen,
      phase: options.phase,
      tool: options.tool,
      resumeFrom: options.resumeFrom,
    },
    repoRoot: REPO_ROOT,
    node: process.version,
    platform: process.platform,
  });

  await writeCheckpoint(run, {
    phase: 'init',
    status: 'created',
    open_documents_expected: [],
    main_document_path: null,
    scratch_paths: [],
    next_phase: options.phase || (options.inventory ? 'inventory' : 'assets'),
  });

  await fs.writeFile(path.join(dirs.logs, 'calls.jsonl'), '', 'utf8');
  return run;
}

export async function writeCheckpoint(run, checkpoint) {
  await writeJson(path.join(run.root, 'phase-checkpoint.json'), {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    ...checkpoint,
  });
}

export async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function appendJsonl(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}
