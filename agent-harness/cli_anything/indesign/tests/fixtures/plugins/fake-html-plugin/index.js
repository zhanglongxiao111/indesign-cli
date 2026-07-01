#!/usr/bin/env node
import { stdin, stdout } from 'node:process';

const raw = await new Promise((resolve) => {
  let data = '';
  stdin.setEncoding('utf8');
  stdin.on('data', (chunk) => {
    data += chunk;
  });
  stdin.on('end', () => resolve(data));
});

const request = JSON.parse(raw || '{}');

const tools = [
  {
    id: 'html.authoring_lint',
    domain: 'html',
    name: 'authoring_lint',
    one_line_purpose: '检查固定语义 HTML 作者包',
    arg_names: ['package', 'strict'],
    rank: 10,
    schema_size: 'medium',
    callable: true,
    requires: [],
    side_effects: [],
    artifact_kinds: ['json'],
    destructive: false,
    target_scope: 'workspace',
    needs_indesign: false,
    produces_artifacts: true,
    preconditions: [],
    return_example: { status: 'complete', data: { ok: true }, artifacts: [{ kind: 'json', path: 'test/workspace/lint-report.json' }] },
    failure_example: { code: 'PLUGIN_CALL_FAILED', message: 'Fake lint failure' },
  },
  {
    id: 'html.compile_instructions',
    domain: 'html',
    name: 'compile_instructions',
    one_line_purpose: '生成 InDesign 构建指令',
    arg_names: ['package', 'out'],
    rank: 20,
    schema_size: 'medium',
    callable: true,
    requires: [],
    side_effects: ['filesystem_write'],
    artifact_kinds: ['json'],
    destructive: false,
    target_scope: 'workspace',
    needs_indesign: false,
    produces_artifacts: true,
    preconditions: ['Valid fixed semantic HTML package path.'],
    return_example: { status: 'complete', data: { ok: true, instruction_count: 3 }, artifacts: [{ kind: 'json', path: 'test/workspace/instructions.json' }] },
    failure_example: { code: 'PLUGIN_SCHEMA_INVALID', message: 'Package cannot be compiled' },
  },
  {
    id: 'html.build_indesign',
    domain: 'html',
    name: 'build_indesign',
    one_line_purpose: '通过宿主动作生成 InDesign 文档',
    arg_names: ['package', 'mode'],
    rank: 30,
    schema_size: 'medium',
    callable: true,
    requires: ['indesign_com'],
    side_effects: ['filesystem_write', 'indesign_mutation'],
    artifact_kinds: ['indd', 'pdf', 'json'],
    destructive: false,
    target_scope: 'indesign',
    needs_indesign: true,
    produces_artifacts: true,
    preconditions: ['InDesign COM is available.', 'Host actions are allowed by the manifest.'],
    return_example: { status: 'complete', data: { ok: true }, artifacts: [{ kind: 'pdf', path: 'test/workspace/output/fake.pdf' }] },
    failure_example: { code: 'PLUGIN_HOST_ACTION_FAILED', message: 'Host action failed' },
  },
];

const schemas = {
  'html.authoring_lint': {
    type: 'object',
    additionalProperties: false,
    properties: {
      package: { type: 'string', description: '作者包配置文件路径' },
      strict: { type: 'boolean', description: '是否启用严格检查' },
    },
    required: ['package'],
  },
  'html.compile_instructions': {
    type: 'object',
    additionalProperties: false,
    properties: {
      package: { type: 'string', description: '作者包配置文件路径' },
      out: { type: 'string', description: '输出 JSON 指令路径' },
    },
    required: ['package'],
  },
  'html.build_indesign': {
    type: 'object',
    additionalProperties: false,
    properties: {
      package: { type: 'string', description: '作者包配置文件路径' },
      mode: { type: 'string', description: '测试模式' },
    },
    required: ['package'],
  },
};

function respond(result) {
  stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id || null, result }));
}

function fail(code, message, details = {}) {
  stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id || null, error: { code, message, details } }));
}

const method = request.method;
const params = request.params || {};

if (params.sleep_ms) {
  await new Promise((resolve) => setTimeout(resolve, Number(params.sleep_ms)));
}

if (method === 'plugin/handshake') {
  respond({
    id: 'fake-html-plugin',
    version: '0.1.0',
    protocol: 'indesign-cli-plugin.v1',
    domain: 'html',
    capabilities: {
      tools: true,
      host_actions: ['script.run', 'export.verify', 'session.show'],
    },
  });
} else if (method === 'tools/list') {
  respond({ tools });
} else if (method === 'tools/schema') {
  const schema = schemas[params.tool_id];
  if (!schema) {
    fail('PLUGIN_TOOL_NOT_FOUND', `Tool not found: ${params.tool_id}`, { tool_id: params.tool_id });
  } else {
    respond({ tool: { id: params.tool_id }, inputSchema: schema });
  }
} else if (method === 'tools/call') {
  const args = params.args || {};
  if (params.tool_id === 'html.authoring_lint') {
    if (args.fail) {
      fail('PLUGIN_CALL_FAILED', 'Fake lint failure', { tool_id: params.tool_id });
    } else {
      respond({
        status: 'complete',
        data: { ok: true, errors: [], warnings: [], package: args.package },
        artifacts: [{ kind: 'json', path: 'test/workspace/lint-report.json' }],
      });
    }
  } else if (params.tool_id === 'html.compile_instructions') {
    respond({
      status: 'complete',
      data: { ok: true, instruction_count: 3 },
      artifacts: [{ kind: 'json', path: args.out || 'test/workspace/instructions.json' }],
    });
  } else if (params.tool_id === 'html.build_indesign') {
    if (args.mode === 'illegal-host-action') {
      respond({
        status: 'requires_host_actions',
        state: { run_id: 'fake-run', step: 'illegal' },
        actions: [{ id: 'bad', tool_id: 'server.setup', args: {} }],
        resume: { method: 'tools/resume' },
      });
    } else {
      respond({
        status: 'requires_host_actions',
        state: { run_id: 'fake-run', step: 'build' },
        actions: [{ id: 'read-session', tool_id: 'session.show', args: { verbose: false } }],
        resume: { method: 'tools/resume' },
      });
    }
  } else {
    fail('PLUGIN_TOOL_NOT_FOUND', `Tool not found: ${params.tool_id}`, { tool_id: params.tool_id });
  }
} else if (method === 'tools/resume') {
  respond({
    status: 'complete',
    data: { ok: true, resumed: true, host_results: params.host_results || [] },
    artifacts: [{ kind: 'pdf', path: 'test/workspace/output/fake.pdf' }],
  });
} else if (method === 'plugin/doctor') {
  respond({ ok: true, checks: [{ name: 'fake', ok: true }] });
} else {
  fail('PLUGIN_METHOD_NOT_FOUND', `Method not found: ${method}`, { method });
}
