import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { handleDemo, DEMO_ACCOUNTS } from '../lib/demo.mjs';
import { handle } from '../lib/onboarding.mjs';

async function fixture(t) {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  t.after(() => pg.close());
  const pool = { connect: async () => ({ query: (...args) => pg.query(...args), release() {} }) };
  function browser() {
    const jar = {};
    async function call(path, body, overrides = {}) {
      const response = await handleDemo(new Request(`https://portal.example/api/demo/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { origin: 'https://portal.example', 'content-type': 'application/json', cookie: Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; '), ...overrides },
        body: body === undefined ? undefined : JSON.stringify(body),
      }), pool, 'test-client');
      for (const value of response.headers.getSetCookie()) { const [name, content] = value.split(';')[0].split('='); jar[name] = content; assert.match(value, /HttpOnly; Secure; SameSite=Strict/); }
      return { status: response.status, data: await response.json(), response };
    }
    return { call, jar, login: role => call('login', DEMO_ACCOUNTS[role]) };
  }
  return { pg, browser };
}

test('demo: member submission, admin review, inbox invitation and live-data isolation', async t => {
  const { pg, browser } = await fixture(t), demo = browser();
  assert.equal((await demo.call('admin/dashboard')).status, 401);
  assert.equal((await demo.login('member')).status, 200);
  assert.equal((await demo.call('admin/dashboard')).status, 401);
  assert.equal((await demo.call('member/profile')).data.email, 'member@example.org');
  assert.equal((await demo.call('member/submit', { name: 'Demo Member', country: 'India', expertise: 'AI evaluation', consent: false })).status, 400);
  assert.equal((await demo.call('member/submit', { name: 'Demo Member', country: 'India', expertise: 'AI evaluation', consent: true })).status, 200);
  assert.equal((await demo.login('admin')).status, 200);
  assert.equal((await demo.call('admin/dashboard')).data.members[0].status, 'submitted');
  assert.equal((await demo.call('admin/review', { id: 'demo-member', status: 'approved', feedback: 'Demo review complete.' })).status, 200);
  assert.equal((await demo.call('member/profile')).data.status, 'approved');
  assert.equal((await demo.call('admin/mail')).data.items.length, 4);
  const input = { name: 'Sample Invitee', email: 'invitee@example.org', designation: 'Sample programme', requestKey: 'request-1' };
  const invite = await demo.call('admin/invite', input);
  assert.equal(invite.status, 200);
  assert.equal((await demo.call('admin/invite', input)).data.id, invite.data.id);
  const inbox = await demo.call('admin/mail');
  const preview = await demo.call(`admin/mail/preview?id=${inbox.data.items[0].id}`);
  const token = new URL(preview.data.link).hash.slice(7);
  assert.equal((await demo.call('member/exchange', { token })).status, 200);
  assert.equal((await demo.call('member/exchange', { token })).status, 410);
  assert.equal((await demo.call('member/profile')).data.id, invite.data.id);
  assert.equal((await demo.call('admin/revoke', { id: invite.data.id })).status, 200);
  assert.equal((await demo.call('member/profile')).status, 401);
  assert.equal((await pg.query('SELECT count(*) AS count FROM invitations')).rows[0].count, 0);
  assert.equal((await pg.query('SELECT count(*) AS count FROM staff')).rows[0].count, 0);
  assert.equal((await pg.query('SELECT count(*) AS count FROM outbox')).rows[0].count, 0);
  const live = await handle(new Request('https://portal.example/api/admin/dashboard', { headers: { cookie: Object.entries(demo.jar).map(([k,v])=>`${k}=${v}`).join('; ') } }), { DB: {}, OWNER_EMAIL: 'owner@example.org' });
  assert.equal(live.status, 401);
});

test('demo: workspace separation, CSRF, sample addresses, reset and expiration', async t => {
  const { pg, browser } = await fixture(t), first = browser(), second = browser();
  assert.equal((await first.call('login', { username: 'demo-admin', password: 'wrong' })).status, 401);
  assert.equal((await first.call('login', DEMO_ACCOUNTS.admin, { origin: 'https://other.example' })).status, 403);
  assert.equal((await first.call('login', DEMO_ACCOUNTS.admin, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await first.call('reset')).status, 405);
  await first.login('admin'); await second.login('admin');
  const input = { name: 'Sample Two', email: 'sample@example.org', designation: 'Sample role', requestKey: 'two' };
  const result = await first.call('admin/invite', input);
  assert.equal((await second.call(`admin/member?id=${result.data.id}`)).status, 404);
  assert.equal((await second.call('admin/dashboard')).data.members.length, 1);
  assert.equal((await first.call('admin/invite', { ...input, requestKey: 'real-email', email: 'person@gmail.com' })).status, 400);
  assert.equal((await first.call('admin/team', { email: 'viewer@example.org', role: 'viewer' })).status, 200);
  assert.equal((await first.call('admin/team')).data.staff[0].role, 'viewer');
  await first.login('member');
  const stolen = second.jar.stanaic_demo_admin;
  second.jar.stanaic_demo_admin = first.jar.stanaic_demo_member;
  assert.equal((await second.call('admin/dashboard')).status, 401);
  second.jar.stanaic_demo_admin = stolen;
  assert.equal((await first.call('reset', {})).status, 200);
  assert.equal((await first.call('admin/dashboard')).data.members.length, 1);
  assert.equal((await first.call('member/profile')).status, 401);
  await pg.query('UPDATE demo_workspaces SET expires_at=0');
  assert.equal((await first.call('admin/dashboard')).status, 401);
  assert.equal((await first.login('member')).status, 200);
  assert.equal((await first.call('member/profile')).data.status, 'invited');
  assert.equal((await first.call('logout', { role: 'member' })).status, 200);
  assert.equal((await first.call('member/profile')).status, 401);
});

test('demo: editable member contact and requested title; admin assigns approved designation without access escalation', async t => {
  const { pg, browser } = await fixture(t), demo = browser();
  await demo.login('member');
  assert.equal((await demo.call('member/submit', { name: 'Demo Member', country: 'India', expertise: 'AI evaluation', contactEmail: 'person@gmail.com', requestedDesignation: 'Technical Fellow', consent: true })).status, 400);
  assert.equal((await demo.call('member/submit', { name: 'Demo Member', country: 'India', expertise: 'AI evaluation', contactEmail: 'contact@example.net', requestedDesignation: 'Technical Fellow', designation: 'owner', role: 'owner', consent: true })).status, 200);
  const submitted = (await demo.call('member/profile')).data;
  assert.equal(submitted.profile.contactEmail, 'contact@example.net');
  assert.equal(submitted.profile.requestedDesignation, 'Technical Fellow');
  assert.equal(submitted.email, 'member@example.org');
  assert.equal(submitted.designation, 'Sample role');
  assert.equal((await demo.call('admin/member/update', { id: 'demo-member', designation: 'Senior Advisor' })).status, 401);
  await demo.login('admin');
  assert.equal((await demo.call('admin/member/update', { id: 'demo-member', designation: 'Senior Advisor', role: 'owner' })).status, 200);
  assert.equal((await demo.call('member/profile')).data.designation, 'Senior Advisor');
  assert.equal((await demo.call('admin/team')).data.staff.length, 0);
  const workspace = (await pg.query('SELECT state FROM demo_workspaces')).rows[0].state;
  assert.equal(workspace.audit[0].action, 'membership.designation.updated');
  assert.equal((await pg.query('SELECT count(*) AS count FROM staff')).rows[0].count, 0);
});
