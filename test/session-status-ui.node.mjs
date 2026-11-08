import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { page } from '../src/ui.ts';

test('session status shows a server error with the button restored, then reloads once it succeeds', async () => {
  const error = { hidden: true, textContent: '' };
  let click, reloads = 0, ok = false;
  const calls = [];
  const button = {
    disabled: true,
    dataset: { sessionStatus: 'fded39a6-17df-420c-aac4-0b9d26727b9d', status: 'done' },
    addEventListener: (_, listener) => { click = listener; },
  };
  const script = (await page('Status', '').text()).match(/<script nonce="[^"]+">([^]*?)<\/script>/)[1];
  vm.runInNewContext(script, {
    document: {
      getElementById: () => null,
      querySelectorAll: (selector) => selector === '[data-session-status]' ? [button] : [],
      querySelector: s => ({ '[data-session-status]': button, '[data-status-error]': error })[s] ?? null,
    },
    window: { matchMedia: () => ({}), location: { reload: () => reloads++ } },
    fetch: async (url, init) => {
      calls.push([url, init.method, JSON.parse(init.body)]);
      return { ok, json: async () => ({ error: 'project owner required <b>' }) };
    },
    Error,
  });
  assert.equal(button.disabled, false);
  const pending = click();
  assert.equal(button.disabled, true);
  await pending;
  assert.equal(button.disabled, false);
  assert.equal(error.hidden, false);
  assert.equal(error.textContent, 'project owner required <b>');
  assert.equal(reloads, 0);
  ok = true;
  await click();
  assert.equal(error.hidden, true);
  assert.equal(reloads, 1);
  assert.deepEqual(calls, Array(2).fill(['/api/sessions/fded39a6-17df-420c-aac4-0b9d26727b9d/status', 'PUT', { status: 'done' }]));
});
