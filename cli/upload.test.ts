import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import fs from 'node:fs/promises';
import os, { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { main } from '../../../.agents/skills/share-session/scripts/client.ts';
import { CONFIG_PATH } from '../../../.agents/skills/share-session/scripts/lib.ts';
import { jsonl, secrets, sessionId } from './fixtures/secrets.ts';

test('CLI previews without auth/network, binds confirmation to content/options, sends only sanitized form data', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'session-share-redaction-'));
  const path = join(dir, 'fixture.jsonl');
  const previousPath = process.env.PATH;
  t.after(async () => {
    process.env.PATH = previousPath;
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await rm(dir, { recursive: true, force: true });
  });
  const originalReadFile = fs.readFile;
  t.mock.method(os, 'homedir', () => dir);
  t.mock.method(fs, 'readFile', (...args: Parameters<typeof readFile>) => args[0] === CONFIG_PATH ? Promise.resolve('{"baseUrl":"https://sessions.test"}') : originalReadFile(...args));
  syncBuiltinESMExports();
  await writeFile(path, jsonl);
  let calls = 0;
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: any, init: any) => {
    calls++;
    const meta = String(init.body.get('meta'));
    const clean = await init.body.get('jsonl').text();
    for (const [, secret] of secrets) {
      assert.ok(!meta.includes(secret));
      assert.ok(!clean.includes(secret));
    }
    assert.equal(JSON.parse(meta).title, '[REDACTED:openai]');
    assert.equal(Buffer.byteLength(clean), preview.preview.bytes);
    assert.equal(clean.trimEnd().split('\n').length, preview.preview.lines);
    return Response.json({ id: 'uploaded' });
  });
  // A secret in the title is an independent leak path through multipart metadata.
  const source = jsonl + JSON.stringify({ type: 'ai-title', aiTitle: secrets[4][1] }) + '\n';
  await writeFile(path, source);
  process.env.PATH = dir; // preview must work even when cloudflared cannot be found
  const preview = await main(['upload', path]) as any;
  assert.equal(preview.status, 'confirmation_required');
  assert.equal(preview.preview.lines, 18);
  assert.ok(preview.preview.replacements.openai > 0);
  assert.match(preview.confirmation, /^[a-f0-9]{64}$/);
  assert.equal(calls, 0);
  await assert.rejects(main(['upload', path, '--confirm', 'yes']), { code: 'confirmation_mismatch' });
  await assert.rejects(main(['upload', path, '--strip-thinking', '--confirm', preview.confirmation]), { code: 'confirmation_mismatch' });
  await writeFile(path, source + '{}\n');
  await assert.rejects(main(['upload', path, '--confirm', preview.confirmation]), { code: 'confirmation_mismatch' });
  assert.equal(calls, 0);
  await writeFile(path, source);
  await writeFile(join(dir, 'cloudflared'), '#!/bin/sh\nprintf "fake.access.token"\n', { mode: 0o700 });
  assert.deepEqual(await main(['upload', path, '--confirm', preview.confirmation]), { id: 'uploaded', marker: `share-session:opt-in ${sessionId}` });
  assert.equal(calls, 1);
  assert.equal(await readFile(path, 'utf8'), source, 'original remains untouched');
  fetch.mock.restore();
});

test('CLI strip flags produce a distinct preview and malformed input never reaches fetch', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'session-share-preview-'));
  t.mock.method(os, 'homedir', () => dir);
  syncBuiltinESMExports();
  t.after(async () => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await rm(dir, { recursive: true, force: true });
  });
  const path = join(dir, 'fixture.jsonl');
  t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected network'); });
  await writeFile(path, jsonl);
  const preview = await main(['upload', path, '--strip-thinking', '--strip-tool-results']) as any;
  assert.equal(preview.preview.thinking_removed, 2);
  assert.equal(preview.preview.tool_results_stripped, 1);
  await writeFile(path, '{"password":"partial');
  await assert.rejects(main(['upload', path]), { code: 'invalid_jsonl' });
  await assert.rejects(main(['upload', path, '--yes']), { code: 'usage' });
});
