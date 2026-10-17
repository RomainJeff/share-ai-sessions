import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { page } from '../src/ui.ts';

// Execute the shipped nonce script with just its browser boundary supplied.
async function controls(reply, { existing = true, networkError = false } = {}) {
  const listeners = {};
  const buttons = [{ disabled: true }, { disabled: true }];
  const error = { hidden: true, textContent: '' };
  const email = 'a+"<tag>@example.com';
  const form = {
    dataset: existing ? { email } : {},
    elements: { email: { value: ` ${email} ` }, role: { value: 'writer' } },
    querySelectorAll: () => buttons,
    querySelector: () => ({ addEventListener: (_, callback) => { listeners.remove = callback; } }),
    addEventListener: (_, callback) => { listeners.submit = callback; },
  };
  const settings = {
    dataset: { project: 'team' },
    querySelector: () => error,
    querySelectorAll: (selector) => selector === 'button' ? buttons : [form],
  };
  const calls = [];
  let reloads = 0;
  const script = (await page('Test', '').text()).match(/<script nonce="[^"]+">([^]*?)<\/script>/)[1];
  vm.runInNewContext(script, {
    document: {
      getElementById: () => null,
      querySelector: (selector) => selector === '[data-project]' ? settings : null,
      querySelectorAll: () => [],
    },
    window: { matchMedia: () => ({}), location: { reload: () => reloads++ } },
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      if (networkError) throw new Error('Network unavailable');
      return reply;
    },
    Error,
  });
  assert.ok(buttons.every((b) => !b.disabled));
  return { listeners, buttons, error, calls, email, reloads: () => reloads };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

for (const existing of [true, false]) test(`sends a JSON PUT for ${existing ? 'role changes' : 'new members'}`, async () => {
  const ui = await controls({ ok: true }, { existing });
  let prevented = false;
  ui.listeners.submit({ preventDefault: () => { prevented = true; } });
  assert.ok(prevented);
  assert.ok(ui.buttons.every((b) => b.disabled));
  await settle();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].url, '/api/projects/team/members/' + encodeURIComponent(ui.email));
  assert.equal(ui.calls[0].method, 'PUT');
  assert.equal(ui.calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(ui.calls[0].body), { role: 'writer' });
  assert.equal(ui.reloads(), 1);
});

test('removal displays the API 409 error as text and restores controls', async () => {
  const message = 'a project keeps at least one owner <script>';
  const ui = await controls({ ok: false, status: 409, json: async () => ({ error: message }) });
  ui.listeners.remove();
  await settle();
  assert.equal(ui.calls[0].method, 'DELETE');
  assert.equal(ui.calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(ui.calls[0].body), {});
  assert.equal(ui.error.textContent, message);
  assert.equal(ui.error.hidden, false);
  assert.ok(ui.buttons.every((b) => !b.disabled));
  assert.equal(ui.reloads(), 0);
});

test('network failure stays on the page with retry controls', async () => {
  const ui = await controls(null, { networkError: true });
  ui.listeners.remove();
  await settle();
  assert.equal(ui.error.textContent, 'Network unavailable');
  assert.equal(ui.error.hidden, false);
  assert.ok(ui.buttons.every((b) => !b.disabled));
  assert.equal(ui.reloads(), 0);
});
