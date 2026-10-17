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
    breadcrumbs: [{ label: 'Accueil', href: '/' }, { label: hostile }],
    backHref: '/projects/my%20project?q=title&mine=1',
    backLabel: 'Retour au projet',
  });
  const html = await response.text();
  const primary = html.match(/<nav[^>]+aria-label="Navigation principale"[^>]*>([^]*?)<\/nav>/)[1];
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
});

test('the legacy four-argument page interface retains its detail return and body', async () => {
  const response = page('Unavailable', '<h1>Unavailable</h1>', 404, true);
  const html = await response.text();
  assert.equal(response.status, 404);
  assert.match(html, /<body class="is-detail">/);
  assert.match(html, /<a class="barback" href="\/">/);
  assert.match(html, /<h1>Unavailable<\/h1>/);
});
