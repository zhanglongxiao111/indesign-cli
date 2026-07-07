import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

import { appendJsonl, relativeToRun, writeJson } from './run-dir.mjs';

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function backendFor(source) {
  if (source === 'hidden_handler') return 'internal_tool_bridge';
  if (source === 'advanced') return 'mcp_advanced';
  if (source === 'classic') return 'mcp_classic';
  if (source === 'script') return 'script_bridge';
  return 'cli';
}

export async function runCli(run, args, meta = {}) {
  const started = Date.now();
  const sequence = ++run.sequence;
  const stdoutPath = path.join(run.dirs.stdout, `${String(sequence).padStart(4, '0')}.json`);
  const stderrPath = path.join(run.dirs.stderr, `${String(sequence).padStart(4, '0')}.log`);
  const python = process.env.PYTHON || 'python';
  const env = {
    ...process.env,
    PYTHONPATH: [
      path.join(run.repoRoot, 'agent-harness'),
      process.env.PYTHONPATH || '',
    ].filter(Boolean).join(path.delimiter),
  };

  const result = await new Promise((resolve) => {
    const child = spawn(python, ['-m', 'cli_anything.indesign', ...args], {
      cwd: run.repoRoot,
      env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => {
      stderr += `${error.stack || error.message}\n`;
    });
    if (typeof meta.stdin === 'string') {
      child.stdin.write(meta.stdin);
      child.stdin.end();
    }
    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });
  });

  await fs.writeFile(stdoutPath, result.stdout || '', 'utf8');
  await fs.writeFile(stderrPath, result.stderr || '', 'utf8');

  let payload = null;
  try {
    payload = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    payload = null;
  }

  const source = meta.source || payload?.source || null;
  const entry = {
    sequence,
    tool_id: meta.toolId || payload?.tool_id || null,
    source,
    backend: meta.backend || payload?.backend || backendFor(source),
    command: ['python', '-m', 'cli_anything.indesign', ...args].join(' '),
    args_digest: digest(args),
    duration_ms: Date.now() - started,
    ok: result.code === 0 && (!payload || payload.ok !== false),
    exit_code: result.code,
    stdout_path: relativeToRun(run, stdoutPath),
    stderr_path: relativeToRun(run, stderrPath),
  };
  await appendJsonl(path.join(run.dirs.logs, 'calls.jsonl'), entry);

  return {
    ...entry,
    stdout: result.stdout,
    stderr: result.stderr,
    payload,
  };
}

export async function writeArgsFile(run, name, payload) {
  const safeName = String(name || 'args').replace(/[^a-zA-Z0-9_.-]+/g, '-');
  const filePath = path.join(run.dirs.args, `${String(run.sequence + 1).padStart(4, '0')}-${safeName}.json`);
  await writeJson(filePath, payload || {});
  return filePath;
}

export async function toolCall(run, toolId, args = {}, meta = {}) {
  const argsPath = await writeArgsFile(run, toolId, args);
  return runCli(run, ['tool', 'call', toolId, '--args', argsPath], {
    toolId,
    ...meta,
  });
}
