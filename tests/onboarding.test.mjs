import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handle, deliver } from '../lib/onboarding.mjs';

// Exercise the production SQL and request handlers against transactional SQLite.
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); for (const f of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) this.db.exec(readFileSync(`drizzle/${f}`, 'utf8')); }
  prepare(sql) {
    const db = this.db;
    const wrapper = args => ({ bind: (...a) => wrapper(a), first: async () => db.prepare(sql).get(...args) || null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }), execute: () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }) });
    return wrapper([]);
  }
  async batch(statements) { this.db.exec('BEGIN IMMEDIATE'); try { const out = statements.map(s => s.execute()); this.db.exec('COMMIT'); return out; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
}
const owner = { 'oai-authenticated-user-id': 'owner-test', 'oai-authenticated-user-email': 'owner@example.org' };
const fixture = () => ({ DB: new D1(), OWNER_USER_ID: 'owner-test', OWNER_EMAIL: 'owner@example.org', MAIL_MODE: 'preview', MAIL_ENCRYPTION_KEY: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64') });
async function call(env, path, data, headers = owner) {
  const response = await handle(new Request(`https://portal.example/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { ...headers, ...(data === undefined ? {} : { origin: 'https://portal.example', 'content-type': 'application/json' }) }, body: data === undefined ? undefined : JSON.stringify(data) }), env);
  return { response, data: await response.json(), status: response.status };
}
const inviteData = (address = 'member@example.org') => ({ name: 'Pilot Member', email: address, designation: 'Research Fellow', requestKey: crypto.randomUUID() });
async function invite(env, address) {
  const result = await call(env, 'admin/invite', inviteData(address)); assert.equal(result.status, 201, JSON.stringify(result.data));
  const preview = await call(env, `admin/mail/preview?id=${result.data.id}-invitation`);
  const token = new URLSearchParams(new URL(preview.data.link).hash.slice(1)).get('token');
  return { id: result.data.id, token };
}
async function join(env, invitation) {
  const result = await call(env, 'member/exchange', { token: invitation.token }, {}); assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.match(result.response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  return { cookie: result.response.headers.get('set-cookie').split(';')[0] };
}
const profile = { name: 'Pilot Member', country: 'India', affiliation: 'Independent', expertise: 'Responsible AI and evaluation', bio: 'Open-source research', portfolio: 'https://github.com/example', consent: true };

test('complete invite → member → submission → admin review; deduplicated outbox', async () => {
  const env = fixture(), invitation = await invite(env), session = await join(env, invitation);
  const initial = await call(env, 'member/profile', undefined, session); assert.equal(initial.data.email, 'member@example.org');
  assert.equal((await call(env, 'member/submit', profile, session)).status, 200);
  assert.equal((await call(env, 'member/submit', profile, session)).status, 200);
  const dashboard = await call(env, 'admin/dashboard'); assert.equal(dashboard.data.members[0].status, 'submitted');
  let messages = await call(env, 'admin/mail'); assert.equal(messages.data.items.length, 3);
  assert.ok(messages.data.items.every(x => x.status === 'preview'));
  assert.equal((await call(env, 'admin/review', { id: invitation.id, status: 'approved', feedback: 'Welcome.' })).status, 200);
  assert.equal((await call(env, 'member/profile', undefined, session)).data.status, 'approved');
  messages = await call(env, 'admin/mail'); assert.equal(messages.data.items.length, 4);
  const row = env.DB.db.prepare('SELECT payload FROM outbox LIMIT 1').get(); assert.ok(!row.payload.includes(invitation.token));
});
test('roles enforced on server; members and unknown users cannot read admin records', async () => {
  const env = fixture();
  assert.equal((await call(env, 'admin/dashboard', undefined, {})).status, 401);
  assert.equal((await call(env, 'admin/dashboard', undefined, { ...owner, 'oai-authenticated-user-id': 'stranger' })).status, 403);
  for (const role of ['viewer', 'maintainer', 'admin']) {
    const address = `${role}@example.org`, staff = { 'oai-authenticated-user-id': role, 'oai-authenticated-user-email': address };
    assert.equal((await call(env, 'admin/team', { email: address, role })).status, 200);
    assert.equal((await call(env, 'admin/dashboard', undefined, staff)).status, 200);
    assert.equal((await call(env, 'admin/team', undefined, staff)).status, 403);
    assert.equal((await call(env, 'admin/mail', undefined, staff)).status, role === 'admin' ? 200 : 403);
    assert.equal((await call(env, 'admin/invite', inviteData(`${role}-member@example.org`), staff)).status, role === 'admin' ? 201 : 403);
    if (role === 'viewer') assert.equal((await call(env, 'admin/review', { id: 'any', status: 'approved' }, staff)).status, 403);
  }
  assert.equal((await call(env, 'admin/team', { email: 'new@example.org', role: 'owner' })).status, 400);
});
test('single-use invitation, member isolation, renewal and revocation', async () => {
  const env = fixture(), a = await invite(env, 'a@example.org'), b = await invite(env, 'b@example.org');
  const session = await join(env, a);
  assert.equal((await call(env, 'member/exchange', { token: a.token }, {})).status, 410);
  assert.equal((await call(env, `member/profile?id=${b.id}`, undefined, session)).data.id, a.id);
  assert.equal((await call(env, 'admin/mail', undefined, session)).status, 401);
  assert.equal((await call(env, 'admin/renew', { id: a.id })).status, 200);
  assert.equal((await call(env, 'member/profile', undefined, session)).status, 401);
  await call(env, 'admin/revoke', { id: b.id });
  assert.equal((await call(env, 'member/exchange', { token: b.token }, {})).status, 410);
});
test('expired links, CSRF, required consent, URL injection and role injection are rejected or ignored', async () => {
  const env = fixture(), a = await invite(env), session = await join(env, a);
  assert.equal((await call(env, 'member/submit', { ...profile, consent: false }, session)).status, 400);
  assert.equal((await call(env, 'member/submit', { ...profile, portfolio: 'javascript:alert(1)' }, session)).status, 400);
  assert.equal((await call(env, 'member/submit', { ...profile, role: 'owner', email: 'hacker@example.org' }, session)).status, 200);
  assert.equal((await call(env, 'member/profile', undefined, session)).data.email, 'member@example.org');
  const response = await handle(new Request('https://portal.example/api/admin/invite', { method: 'POST', headers: { ...owner, origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify(inviteData()) }), env);
  assert.equal(response.status, 403);
  const expired = await invite(env, 'expired@example.org'); env.DB.db.prepare('UPDATE invitations SET token_expires=0 WHERE id=?').run(expired.id);
  assert.equal((await call(env, 'member/exchange', { token: expired.token }, {})).status, 410);
});
test('invite request is idempotent and active duplicate email is rejected', async () => {
  const env = fixture(), data = inviteData();
  const a = await call(env, 'admin/invite', data), b = await call(env, 'admin/invite', data);
  assert.equal(a.data.id, b.data.id); assert.equal(b.data.duplicate, true);
  assert.equal((await call(env, 'admin/invite', { ...data, requestKey: 'another' })).status, 409);
  assert.equal((await call(env, 'admin/mail')).data.items.length, 1);
});
test('email failure does not lose submission; retry preserves provider idempotency key', async () => {
  const env = fixture(), a = await invite(env), session = await join(env, a);
  env.MAIL_MODE = 'resend'; env.RESEND_API_KEY = 'test-key'; env.MAIL_FROM = 'Portal <portal@example.org>';
  const seen = []; env.fetch = async (_url, options) => { seen.push(options.headers['Idempotency-Key']); throw new Error('network lost'); };
  assert.equal((await call(env, 'member/submit', profile, session)).status, 200);
  assert.equal((await call(env, 'admin/dashboard')).data.members[0].status, 'submitted');
  assert.equal((await call(env, 'admin/mail')).data.items.filter(x => x.status === 'uncertain').length, 2);
  env.fetch = async (_url, options) => { seen.push(options.headers['Idempotency-Key']); return Response.json({ id: 'provider-message' }); };
  await deliver(env, [`${a.id}-notice`]);
  assert.equal(seen.filter(x => x === `${a.id}-notice`).length, 2);
  const row = env.DB.db.prepare('SELECT status FROM outbox WHERE id=?').get(`${a.id}-notice`); assert.equal(row.status, 'accepted');
  env.DB.db.prepare('UPDATE outbox SET attempted_at=1 WHERE id=?').run(`${a.id}-receipt`);
  assert.equal((await call(env, 'admin/mail/retry', { id: `${a.id}-receipt` })).status, 409);
});
test('transaction rollback prevents orphan invitation if outbox write fails', async () => {
  const env = fixture(); env.DB.db.exec("CREATE TRIGGER break_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
  const result = await call(env, 'admin/invite', inviteData()); assert.equal(result.status, 500);
  assert.equal(env.DB.db.prepare('SELECT count(*) AS n FROM invitations').get().n, 0);
});
