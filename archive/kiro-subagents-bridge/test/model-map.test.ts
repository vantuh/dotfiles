// Test: bare Kiro model ids map onto the kiro-acp provider only when the agent
// can run through it and the id is one the provider knows.
// Run: bun test/model-map.test.ts

import assert from 'node:assert/strict';

import type { KiroAgentJson } from '../kiro-parse.ts';
import { mapKiroModel } from '../model-map.ts';

const compatible: KiroAgentJson = { name: 'compatible' };
const mcpNative: KiroAgentJson = {
  name: 'mcp-native',
  mcpServers: { kiro: {} },
};

const mapped = [
  ['auto', 'kiro-acp/auto'],
  ['claude-opus-5.5', 'kiro-acp/claude-opus-5.5'],
  ['claude-haiku-4.5', 'kiro-acp/claude-haiku-4.5'],
  ['qwen3-coder-next', 'kiro-acp/qwen3-coder-next'],
] as const;
for (const [id, expected] of mapped) {
  assert.equal(
    mapKiroModel(compatible, id),
    expected,
    `known bare id ${id} maps to its kiro-acp provider`,
  );
}

assert.equal(
  mapKiroModel(compatible, '  claude-sonnet-5.5  '),
  'kiro-acp/claude-sonnet-5.5',
  'whitespace is trimmed before the id lookup',
);
assert.equal(
  mapKiroModel(compatible, 'kiro-acp/claude-sonnet-5.5'),
  'kiro-acp/claude-sonnet-5.5',
  'qualified kiro-acp id passes through',
);
assert.equal(
  mapKiroModel(compatible, 'openai/gpt-6.1-sol'),
  'openai/gpt-6.1-sol',
  'another provider id passes through',
);
assert.equal(
  mapKiroModel(compatible, 'claude-sonnet-9.9'),
  'claude-sonnet-9.9',
  'unknown bare id is left for the default provider',
);
assert.equal(
  mapKiroModel(mcpNative, 'claude-sonnet-5.5'),
  undefined,
  'MCP-native agent gets no kiro-acp model',
);
assert.equal(mapKiroModel(compatible, undefined), undefined, 'missing model');
assert.equal(mapKiroModel(compatible, '   '), undefined, 'blank model');

console.log('all model-map assertions passed');
