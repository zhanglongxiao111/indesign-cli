import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { createLineReader } from '../../scripts/migration/record_golden.mjs';

test('MCP line reader preserves multiple lines delivered in one chunk', async () => {
  const stream = new PassThrough();
  const reader = createLineReader(stream);

  stream.end('{"id":1}\n{"id":2}\n');

  assert.equal(await reader.readLine(), '{"id":1}');
  assert.equal(await reader.readLine(), '{"id":2}');
  assert.equal(await reader.readLine(), null);
});
