#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { env, stdin, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveServerRoot() {
  const candidates = [
    env.INDESIGN_CLI_SERVER_ROOT,
    path.resolve(__dirname, '../../../../'),
    path.resolve(__dirname, '../server'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, 'src', 'core', 'toolRouter.js')) &&
      fs.existsSync(path.join(candidate, 'src', 'core', 'indesign-tool-registry.json'))
    ) {
      return candidate;
    }
  }

  throw new Error('Unable to resolve InDesign CLI server root');
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    stdin.setEncoding('utf8');
    stdin.on('data', chunk => {
      data += chunk;
    });
    stdin.on('end', () => resolve(data));
    stdin.on('error', reject);
  });
}

function failure(code, message) {
  return {
    ok: false,
    error: { code, message },
  };
}

async function main() {
  const input = await readStdin();
  const request = JSON.parse(input || '{}');
  const toolId = String(request.toolId || '');
  if (!toolId) {
    return failure('INTERNAL_TOOL_ID_REQUIRED', 'toolId is required');
  }

  const serverRoot = resolveServerRoot();
  const [{ registry }, toolRouter] = await Promise.all([
    import(pathToFileURL(path.join(serverRoot, 'src', 'tools', 'index.js')).href),
    import(pathToFileURL(path.join(serverRoot, 'src', 'core', 'toolRouter.js')).href),
  ]);
  const tool = registry.byCliId.get(toolId);
  if (!tool) {
    return failure('INTERNAL_TOOL_NOT_FOUND', `Unknown internal tool: ${toolId}`);
  }
  if (tool.profiles.length !== 0) {
    return failure('INTERNAL_TOOL_PROFILE_MISMATCH', `${toolId} is not an internal tool`);
  }

  if (request.resolveOnly) {
    return {
      ok: true,
      toolId,
      source: 'hidden_handler',
      name: tool.name,
    };
  }

  const result = await toolRouter.call(tool.name, request.args || {}, {
    profile: 'internal',
    registry,
  });
  return { ok: true, toolId, result };
}

main()
  .then(payload => {
    stdout.write(JSON.stringify(payload));
  })
  .catch(error => {
    stdout.write(JSON.stringify(failure('INTERNAL_TOOL_EXCEPTION', error?.message || String(error))));
  });
