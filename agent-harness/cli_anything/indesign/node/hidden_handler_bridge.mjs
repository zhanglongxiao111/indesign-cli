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
      fs.existsSync(path.join(candidate, 'src', 'handlers', 'bookHandlers.js')) &&
      fs.existsSync(path.join(candidate, 'src', 'handlers', 'presentationHandlers.js'))
    ) {
      return candidate;
    }
  }

  throw new Error('Unable to resolve InDesign CLI server root');
}

const serverRoot = resolveServerRoot();
const { BookHandlers } = await import(pathToFileURL(path.join(serverRoot, 'src', 'handlers', 'bookHandlers.js')).href);
const { PresentationHandlers } = await import(
  pathToFileURL(path.join(serverRoot, 'src', 'handlers', 'presentationHandlers.js')).href
);

const HANDLERS = {
  book: BookHandlers,
  presentation: PresentationHandlers,
};

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

function snakeToCamel(value) {
  return String(value || '').replace(/_([a-z0-9])/g, (_match, letter) => letter.toUpperCase());
}

function camelToSnake(value) {
  return String(value || '')
    .replace(/(.)([A-Z][a-z]+)/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function resolveMethodName(handlerClass, name) {
  const normalized = String(name || '');
  for (const candidate of Object.getOwnPropertyNames(handlerClass)) {
    if (typeof handlerClass[candidate] === 'function' && camelToSnake(candidate) === normalized) {
      return candidate;
    }
  }
  return snakeToCamel(normalized);
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
  const domain = request.domain;
  const name = request.name;
  const args = request.args || {};

  const handlerClass = HANDLERS[domain];
  if (!handlerClass) {
    return failure('HIDDEN_HANDLER_DOMAIN_NOT_FOUND', `Unknown hidden handler domain: ${domain}`);
  }

  const methodName = resolveMethodName(handlerClass, name);
  const method = handlerClass[methodName];
  if (typeof method !== 'function') {
    return failure('HIDDEN_HANDLER_METHOD_NOT_FOUND', `Unknown hidden handler method: ${domain}.${name}`);
  }

  if (request.resolveOnly) {
    return { ok: true, methodName };
  }

  const result = await method.call(handlerClass, args);
  return { ok: true, result };
}

main()
  .then(payload => {
    stdout.write(JSON.stringify(payload));
  })
  .catch(error => {
    stdout.write(JSON.stringify(failure('HIDDEN_HANDLER_EXCEPTION', error?.message || String(error))));
  });
