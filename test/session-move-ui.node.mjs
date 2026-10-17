import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { page } from '../src/ui.ts';

for (const succeeds of [true, false]) test(`session move ${succeeds ? 'reloads after success' : 'shows server errors and allows retry'}`, async () => {
  const button = { disabled: true };
  const error = { hidden: true, textContent: '' };
  let submit, reloads = 0;
  const calls = [];
  const form = {
    dataset: { sessionMove: 'fded39a6-17df-420c-aac4-0b9d26727b9d' },
    elements: { project: { value: 'demo' } },
    querySelector: s => s === 'button' ? button : error,
    addEventListener: (_, listener) => { submit = listener; },
  };
  const script = (await page('Move', '').text()).match(/<script nonce="[^"]+">([^]*?)<\/script>/)[1];
  vm.runInNewContext(script, {
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: s => s === '[data-session-move]' ? form : null,
    },
    window: { matchMedia: () => ({}), location: { reload: () => reloads++ } },
    fetch: async (url, init) => {
      calls.push([url, init.method, JSON.parse(init.body)]);
      return { ok: succeeds, json: async () => ({ error: 'writer role required <script>' }) };
    },
    Error,
  });
  assert.equal(button.disabled, false);
  let prevented = false;
  const pending = submit({ preventDefault: () => { prevented = true; } });
  assert.equal(button.disabled, true);
  await pending;
  assert.equal(prevented, true);
  assert.deepEqual(calls, [['/api/sessions/fded39a6-17df-420c-aac4-0b9d26727b9d/project', 'PUT', { project: 'demo' }]]);
  assert.equal(button.disabled, false);
  assert.equal(reloads, succeeds ? 1 : 0);
  assert.equal(error.hidden, succeeds);
  if (!succeeds) assert.equal(error.textContent, 'writer role required <script>');
});
