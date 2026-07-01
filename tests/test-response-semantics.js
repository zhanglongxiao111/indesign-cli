import assert from 'node:assert/strict';
import { formatScriptResult } from '../src/utils/stringUtils.js';

assert.equal(formatScriptResult('No document open', 'Get Document Info').success, false);
assert.equal(formatScriptResult('Error creating rectangle: x', 'Create Rectangle').success, false);
assert.equal(formatScriptResult(JSON.stringify({ success: false, error: 'x' }), 'Operation').success, false);
assert.equal(formatScriptResult(JSON.stringify({ success: false, code: 'ARTIFACT_FORMAT_UNSUPPORTED', message: 'Only JPEG is supported' }), 'Export Images').message, 'Only JPEG is supported');
const jsxFailure = formatScriptResult(JSON.stringify({
  ok: false,
  step: 'trigger intentional reference failure',
  error: 'INTENTIONAL_REFERENCE_ERROR is undefined',
  errorName: 'ReferenceError',
  errorNumber: 24,
  line: 27,
  fileName: 'probe.jsx'
}), 'Run JSX File');
assert.equal(jsxFailure.step, 'trigger intentional reference failure');
assert.equal(jsxFailure.line, 27);
assert.equal(jsxFailure.fileName, 'probe.jsx');
assert.equal(jsxFailure.errorName, 'ReferenceError');
assert.equal(formatScriptResult('Document created', 'Create Document').success, true);

console.log('response semantics tests passed');
