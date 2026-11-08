import assert from 'node:assert/strict';
import { test } from 'node:test';
import { page } from '../src/ui.ts';

// Exercise the public renderer: navigation remains ordinary links and a GET form,
// and project/member metadata cannot become markup inside the new shell.
test('navigation renders canonical destinations, active location, help and escaped metadata', async () => {
  const hostile = '"><img src=x onerror=alert(1)>';
  const response = page('Sessions', '<p>Conversation</p>', 200, true, {
    active: 'projects',
    email: hostile,
    projects: [{ slug: 'my project', name: hostile, role: 'reader', members: 1, sessions: 2,
      last_synced_at: 1, last_session_id: 'first', last_session_title: 'First' }],
    sidebar: [{ id: 'first', title: hostile, project: 'my project', branch: hostile, repo: null, owner_email: hostile,
      owner_name: hostile, last_synced_at: 1, external_app: hostile, forked_from: null }],
    breadcrumbs: [{ label: 'Home', href: '/' }, { label: hostile }],
    backHref: '/projects/my%20project?q=title&mine=1',
    backLabel: 'Back to project',
  });
  const html = await response.text();
  const primary = html.match(/<nav[^>]+aria-label="Main navigation"[^>]*>([^]*?)<\/nav>/)[1];
  assert.match(primary, /<a href="\/projects" aria-current="page">/);
  assert.match(primary, /href="\/sessions"/);
  assert.match(html, /<form[^>]+method="get" action="\/sessions" role="search">/);
  assert.match(html, /<input[^>]+name="q" type="search"/);
  assert.match(html, /data-list-back href="\/projects\/my%20project\?q=title&amp;mine=1"/);
  assert.match(html, /href="\/projects\/my%20project"/);
  assert.match(html, /id="share-help"/);
  assert.match(html, /href="\/share-session.skill" download/);
  assert.ok(html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x'));
  const nonce = html.match(/<script nonce="([^"]+)">/)[1];
  assert.ok(response.headers.get('content-security-policy').includes(`script-src 'nonce-${nonce}'`));
  assert.match(html, /data-nav-toggle aria-controls="sidebar"/);
  assert.ok(!html.includes('id="mobile-nav"'));
});

test('sidebar lists in-progress sessions grouped by project, capped, with done and idle links', async () => {
  const now = Date.now();
  const session = (id, project, extra = {}) => ({ id, title: `Title ${id}`, project, branch: 'main', repo: null,
    owner_email: 'me@x.io', owner_name: 'Me', last_synced_at: now - 3600000, external_app: null, forked_from: null, ...extra });
  const summary = (slug, done) => ({ slug, name: slug.toUpperCase(), role: 'writer', members: 1, sessions: 9, done,
    last_synced_at: now, last_session_id: null, last_session_title: null });
  const html = await page('Home', '', 200, false, {
    active: 'home', email: 'me@x.io', breadcrumbs: [{ label: 'Home' }], currentSession: 'a2',
    projects: [summary('alpha', 3), summary('beta', 0), summary('idle', 2)],
    sidebar: [
      session('a1', 'alpha', { last_synced_at: now - 60000 }), session('a2', 'alpha'),
      session('b1', 'beta', { owner_email: 'al@x.io', owner_name: 'Ada Lovelace', external_app: 't3code', title: '<b>x</b>' }),
      session('a3', 'alpha'), session('a4', 'alpha'), session('a5', 'alpha'), session('a6', 'alpha'),
    ],
  }).text();
  assert.match(html, /In progress · 7/);
  const groups = [...html.matchAll(/<section class="side-group" aria-label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(groups, ['ALPHA', 'BETA']);
  const alpha = html.slice(html.indexOf('aria-label="ALPHA"'), html.indexOf('aria-label="BETA"'));
  assert.equal(alpha.split('<details class="more">')[0].match(/class="side-session"/g).length, 4);
  assert.match(alpha, /Show 2 more/);
  assert.match(alpha, /href="\/projects\/alpha">3 done/);
  assert.match(alpha, /href="\/s\/a2" aria-current="page"/);
  assert.match(alpha, /class="dot live"/);
  assert.ok(!html.includes('<b>x</b>'));
  assert.match(html, /title="Ada Lovelace">AL</);
  assert.match(html, /class="app">T3 Code/);
  assert.match(html, /1 project with nothing in progress/);
});

test('the legacy four-argument page interface retains its detail return and body', async () => {
  const response = page('Unavailable', '<h1>Unavailable</h1>', 404, true);
  const html = await response.text();
  assert.equal(response.status, 404);
  assert.match(html, /<body class="is-detail">/);
  assert.match(html, /<a class="barback" href="\/">/);
  assert.match(html, /<h1>Unavailable<\/h1>/);
});
