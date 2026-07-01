#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';

import { runCli } from './lib/cli.mjs';
import { createRunContext, writeJson } from './lib/run-dir.mjs';

function parseArgs(argv) {
  const options = { argv, offline: false, runId: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--offline') options.offline = true;
    else if (arg === '--run-id') options.runId = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node tests/real-e2e/run-agent-ux-hardening.mjs --offline

This smoke runner uses real indesign-cli calls and writes reports under .indesign-e2e-runs/.`);
}

async function writeArgs(run, name, payload) {
  const filePath = path.join(run.dirs.args, `${name}.json`);
  await writeJson(filePath, payload);
  return filePath;
}

async function writeText(run, name, text) {
  const filePath = path.join(run.dirs.scripts, name);
  await fs.writeFile(filePath, text, 'utf8');
  return filePath;
}

function evidence(call) {
  return {
    ok: call.ok,
    exit_code: call.exit_code,
    tool_id: call.tool_id,
    stdout_path: call.stdout_path,
    stderr_path: call.stderr_path,
    code: call.payload?.error?.code || null,
  };
}

function createdDocumentName(call) {
  const result = call.payload?.data?.parsed?.result;
  const match = typeof result === 'string' ? result.match(/Document name: (.+)$/) : null;
  if (!match) {
    throw new Error('create_document did not return a document name');
  }
  return match[1];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const run = await createRunContext({
    ...options,
    inventory: false,
    full: false,
    phase: 'agent_ux_hardening',
    runId: options.runId || `${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12)}_agent_ux_hardening`,
  });

  const checks = [];
  async function step(name, args, expectation = true) {
    const expected = typeof expectation === 'boolean' ? { ok: expectation } : expectation;
    const call = await runCli(run, args, { toolId: args[0] === 'tool' && args[1] === 'call' ? args[2] : null });
    const code = call.payload?.error?.code || null;
    const failedStep = call.payload?.data?.failed_step || null;
    const assertions = [
      call.ok === expected.ok,
      !expected.expectedCode || code === expected.expectedCode,
      !expected.failed_step || failedStep === expected.failed_step,
    ];
    const passed = assertions.every(Boolean);
    checks.push({
      name,
      passed,
      expected_ok: expected.ok,
      expected_code: expected.expectedCode || null,
      expected_failed_step: expected.failed_step || null,
      evidence: { ...evidence(call), failed_step: failedStep },
    });
    if (!passed) {
      throw new Error(`${name} failed expectation`);
    }
    return call;
  }

  await step('com_probe', ['server', 'health', '--deep', '--connect-indesign'], true);

  const createArgs = await writeArgs(run, 'create-document', {
    width: 120,
    height: 90,
    pages: 1,
    facingPages: false,
  });
  const firstDocument = await step('create_document', ['tool', 'call', 'document.create_document', '--args-file', createArgs], true);
  const firstDocumentName = createdDocumentName(firstDocument);
  await step('document_info_without_args', ['tool', 'call', 'document.get_document_info'], true);

  const rectangleArgs = await writeArgs(run, 'rectangle', {
    x: 10,
    y: 10,
    width: 40,
    height: 25,
    cornerRadius: 3,
  });
  await step('create_rectangle', ['tool', 'call', 'graphics.create_rectangle', '--args-file', rectangleArgs], true);

  const textArgs = await writeArgs(run, 'text-frame', {
    x: 10,
    y: 42,
    width: 80,
    height: 20,
    content: 'agent ux smoke',
  });
  await step('create_text_frame', ['tool', 'call', 'text.create_text_frame', '--args-file', textArgs], true);

  const jpegArgs = await writeArgs(run, 'export-jpeg', {
    outputPath: path.join(run.dirs.outputs, 'images'),
    format: 'JPEG',
    pages: 'all',
    resolution: 72,
  });
  await step('export_jpeg', ['tool', 'call', 'export.export_images', '--args-file', jpegArgs], true);

  const pngArgs = await writeArgs(run, 'export-png', {
    outputPath: path.join(run.dirs.outputs, 'png-images'),
    format: 'PNG',
    pages: 'all',
  });
  await step('export_png_rejected', ['tool', 'call', 'export.export_images', '--args-file', pngArgs], {
    ok: false,
    expectedCode: 'ARTIFACT_FORMAT_UNSUPPORTED',
  });

  const failScript = await writeText(run, 'wrapper-fail.jsx', `
var __step = "export";
JSON.stringify({ ok: false, step: __step, error: "boom" });
`);
  await step('wrapper_failure', ['script', 'run', failScript, '--timeout-ms', '120000'], {
    ok: false,
    expectedCode: 'INDESIGN_SCRIPT_FAILED',
  });

  const batchPlan = await writeArgs(run, 'batch', {
    steps: [
      { id: 'show', type: 'tool', tool: 'session.show', args: {} },
      { id: 'bad-step', type: 'tool', tool: 'missing.tool', args: {} },
    ],
  });
  await step('batch_failed_step', ['tool', 'batch', '--plan', batchPlan, '--on-error', 'stop', '--timeout-ms', '120000'], {
    ok: false,
    expectedCode: 'BATCH_STEP_FAILED',
    failed_step: 'bad-step',
  });
  await step('session_doctor', ['session', 'doctor'], true);

  const secondCreateArgs = await writeArgs(run, 'create-second-document', {
    width: 100,
    height: 80,
    pages: 1,
    facingPages: false,
  });
  const secondDocument = await step('create_second_document', ['tool', 'call', 'document.create_document', '--args-file', secondCreateArgs], true);
  const secondDocumentName = createdDocumentName(secondDocument);
  await step('close_document_requires_explicit_target', ['tool', 'call', 'document.close_document'], {
    ok: false,
    expectedCode: 'DOCUMENT_TARGET_AMBIGUOUS',
  });

  const closeSecondArgs = await writeArgs(run, 'close-second-document', {
    expectedDocumentName: secondDocumentName,
    allowDiscard: true,
  });
  await step('close_second_document_by_name', ['tool', 'call', 'document.close_document', '--args-file', closeSecondArgs], true);

  const closeFirstArgs = await writeArgs(run, 'close-first-document', {
    expectedDocumentName: firstDocumentName,
    allowDiscard: true,
  });
  await step('close_first_document_by_name', ['tool', 'call', 'document.close_document', '--args-file', closeFirstArgs], true);

  const report = {
    runId: run.id,
    runRoot: run.root,
    passed: checks.every(item => item.passed),
    checks,
  };
  await writeJson(path.join(run.dirs.reports, 'agent-ux-hardening-report.json'), report);
  await writeJson(path.join(run.dirs.reports, 'coverage-report.json'), {
    summary: { passed: report.passed, checks: checks.length },
    tools: checks.map(item => ({ id: item.name, passed: item.passed, evidence: item.evidence })),
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
