import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactJsonl } from '../skills/share-session/scripts/redact.ts';
import { jsonl, records, secrets } from './fixtures/secrets.ts';

const parse = (s: string) => s.trimEnd().split('\n').map(l => JSON.parse(l));

test('redacts the synthetic secret corpus everywhere while preserving history and ordinary context', () => {
  const result = redactJsonl(jsonl);
  const output = parse(result.jsonl);
  for (const [kind, secret] of secrets) {
    assert.ok(!result.jsonl.includes(JSON.stringify(secret).slice(1, -1)), `${kind} leaked`);
    assert.ok(result.replacements[kind] > 0, `${kind} missing from preview`);
  }
  assert.equal(result.lines, records.length);
  assert.deepEqual(output.map(l => [l.uuid, l.parentUuid, l.sessionId]), records.map(l => [l.uuid, l.parentUuid, l.sessionId]));
  assert.deepEqual(output[0], records[0]);
  assert.equal(output[1].attachment.systemPrompt, 'Org instructions. [REDACTED:aws]');
  assert.deepEqual(output.at(-3).message.content, []);
  assert.equal(result.thinking_removed, 1);
  assert.equal(output.at(-2).message.content[0].signature, 'untouched-signature');
  assert.equal(output.at(-1).message.content[0].tool_use_id, 'tool1');
  assert.equal(redactJsonl(result.jsonl).jsonl, result.jsonl);
});

test('strip options remove thinking and tool payloads without losing lines or tool pairing', () => {
  const result = redactJsonl(jsonl, { stripThinking: true, stripToolResults: true });
  const output = parse(result.jsonl);
  assert.equal(result.lines, records.length);
  assert.equal(result.thinking_removed, 2);
  assert.equal(result.tool_results_stripped, 1);
  assert.ok(!result.jsonl.includes('ordinary reasoning'));
  assert.ok(!result.jsonl.includes('tool output'));
  assert.deepEqual(output.at(-2).message.content.map((b: any) => b.type), ['tool_use']);
  assert.equal(output.at(-1).message.content[0].tool_use_id, 'tool1');
  assert.equal(output.at(-1).message.content[0].content, '[REDACTED:tool-result]');
});

test('redacts credential assignments, JSON credential fields, signatures, paths and private-key variants', () => {
  const samples = [
    { text: 'export API_KEY="fake quoted value"\nPASSWORD=plain-fake\nKEY=generic-fake', password: 'json-fake' },
    { text: '"access_token": "fake-json-token"\npassword: fake-inline-password' },
    { text: '-----BEGIN OPENSSH PRIVATE KEY-----\nFAKE\n-----END OPENSSH PRIVATE KEY-----' },
    { type: 'thinking', thinking: 'clean', signature: secrets[9][1] },
    { text: 'C:\\repo\\.agents\\skills-config\\service\\config.json' },
  ];
  const result = redactJsonl(JSON.stringify({ samples }) + '\n');
  for (const value of ['fake quoted value', 'plain-fake', 'generic-fake', 'json-fake', 'fake-json-token', 'fake-inline-password', 'FAKE', 'config.json', secrets[9][1]]) {
    assert.ok(!result.jsonl.includes(value), `leaked ${value}`);
  }
});

test('rejects malformed or non-object JSONL safely rather than forwarding an unscanned line', () => {
  for (const text of ['{"message":"unterminated', '{}\nnot-json\n', 'null\n', '[]\n']) {
    assert.throws(() => redactJsonl(text), { code: 'invalid_jsonl' });
  }
  assert.equal(redactJsonl('{}\n\n{}\n').jsonl, '{}\n\n{}\n');
});

test('masks opaque bearer credentials and camelCase credential fields', () => {
  const result = redactJsonl(JSON.stringify({
    text: 'Authorization: Bearer opaque-fixture-token\nAuthorization: Basic ZmFrZTpmaXh0dXJl',
    attachment: { apiKey: 'camel-fixture-key', accessToken: 'camel-fixture-token' },
  }));
  for (const secret of ['opaque-fixture-token', 'ZmFrZTpmaXh0dXJl', 'camel-fixture-key', 'camel-fixture-token']) {
    assert.ok(!result.jsonl.includes(secret));
  }
});

test('masks multiline and escaped quoted passwords plus credential-bearing connection URLs', () => {
  const values = [
    'PASSWORD="first\nmultiline-fixture-secret"',
    'PASSWORD="first\\"escaped-fixture-secret"',
    '"password": "first\\"json-fixture-secret"',
    "PASSWORD='first\nsingle-fixture-secret'",
    'PASSWORD="first\nunfinished-fixture-secret',
    'https://alice:https-fixture-secret@db.example.test/database',
    'postgresql://alice:database-fixture-secret@db.example.test/database',
  ];
  const result = redactJsonl(JSON.stringify({ rendered: values }));
  for (const secret of ['multiline-fixture-secret', 'escaped-fixture-secret', 'json-fixture-secret', 'single-fixture-secret', 'unfinished-fixture-secret', 'https-fixture-secret', 'database-fixture-secret']) {
    assert.ok(!result.jsonl.includes(secret), `${secret} leaked`);
  }
});

test('Codex strip policies cover encrypted reasoning and function/custom tool output', () => {
  const rows = [
    { type: 'response_item', payload: { type: 'reasoning', encrypted_content: 'opaque', summary: [] } },
    { type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Reasoning', raw_content: ['opaque'] } } },
    { type: 'event_msg', payload: { type: 'exec_command_end', stdout: 'private output', aggregated_output: 'private output' } },
    ...['function_call_output', 'custom_tool_call_output'].map(type => ({ type: 'response_item', payload: { type, call_id: 'c1', output: 'private output' } })),
  ];
  const result = redactJsonl(rows.map(r => JSON.stringify(r)).join('\n') + '\n', { stripThinking: true, stripToolResults: true });
  assert.ok(!result.jsonl.includes('opaque'));
  assert.ok(!result.jsonl.includes('private output'));
  assert.ok(result.jsonl.includes('c1'));
});
