import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { platformSeed, ensurePlatformSchema, handlePlatform } from '../lib/platform.mjs';
import { ensureNotificationSchema, handleNotifications, processNotifications } from '../lib/notifications.mjs';

const owner = { id: 'owner-id', email: 'owner@example.org', emailVerified: true };
const student = { id: 'student-id', email: 'student@example.org', emailVerified: true };
const actor = { workspaceId: 'institution-live', actorId: owner.id, role: 'superadmin', demo: false };
const item = (id = 'message-one', recipientId = student.id) => ({ id, recipientId, kind: 'receipt', text: 'Your course payment has been recorded.', status: 'queued', createdAt: Date.now() });

async function fixture(t) {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  let tail = Promise.resolve();
  const raw = (sql, values) => sql.includes('CREATE TABLE IF NOT EXISTS stanaic_platform_workspaces') ? pg.exec(sql).then(() => ({ rows: [] })) : pg.query(sql, values);
  const connect = async () => { const before = tail; let unlock; tail = new Promise(resolve => unlock = resolve); await before; return { query: raw, release: unlock }; };
  const pool = { connect, query: async (...args) => { const c = await connect(); try { return await c.query(...args); } finally { c.release(); } } };
  await ensurePlatformSchema(pool); await ensureNotificationSchema(pool);
  const state = platformSeed(false);
  state.profiles = [{ id: student.id, name: 'Sample learner', email: student.email, contactEmail: 'unverified@example.net' }, { id: 'other-id', name: 'Other learner', email: 'other@example.org' }];
  state.outbox = [item()];
  await pool.query('INSERT INTO stanaic_platform_workspaces(id,demo,state,created_at) VALUES($1,false,$2::jsonb,$3)', ['institution-live', JSON.stringify(state), Date.now()]);
  t.after(() => pg.close());
  const env = { OWNER_EMAIL: owner.email, MAIL_MODE: 'preview' };
  async function call(path, data, identity = owner, headers = {}, options = {}) {
    const request = new Request('https://platform.test/api/platform/notifications/' + path, { method: data === undefined ? 'GET' : 'POST', headers: { origin: 'https://platform.test', 'content-type': 'application/json', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    const response = await handleNotifications(request, pool, identity, env, options);
    return { status: response.status, body: await response.json() };
  }
  async function stateNow() { return (await pool.query("SELECT state FROM stanaic_platform_workspaces WHERE id='institution-live'")).rows[0].state; }
  return { pg, pool, env, call, stateNow };
}

test('notification status enforces verified access, own-record scope, role and request origin', async t => {
  const f = await fixture(t);
  const state = await f.stateNow(); state.outbox.push(item('other-message', 'other-id'));
  await f.pool.query("UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id='institution-live'", [JSON.stringify(state)]);
  assert.equal((await f.call('status', undefined, null)).status, 401);
  assert.equal((await f.call('status', undefined, { ...owner, emailVerified: false })).status, 403);
  const own = await f.call('status', undefined, student);
  assert.equal(own.status, 200); assert.equal(own.body.items.length, 1); assert.equal(own.body.items[0].recipient, undefined); assert.equal(own.body.canProcess, false);
  assert.equal((await f.call('process', {}, student)).status, 403);
  assert.equal((await f.call('process', {}, owner, { origin: 'https://other.test' })).status, 403);
  assert.equal((await f.call('process', { limit: 30 })).status, 400);
});

test('preview mode records preview and never calls an external sender, even after mode changes', async t => {
  const f = await fixture(t); let sends = 0;
  const fetcher = async () => { sends++; throw Error('External call forbidden in preview'); };
  const first = await f.call('process', {}, owner, {}, { fetcher });
  assert.equal(first.status, 200); assert.equal(first.body.items[0].status, 'preview'); assert.equal(sends, 0);
  f.env.MAIL_MODE = 'resend'; f.env.RESEND_API_KEY = 'test-only'; f.env.MAIL_FROM = 'STANAIC <sender@example.org>';
  await f.call('process', {}, owner, {}, { fetcher }); assert.equal(sends, 0);
  assert.equal((await f.stateNow()).outbox[0].status, 'preview');
});

test('configured delivery binds verified recipient, snapshots request and deduplicates accepted sends', async t => {
  const f = await fixture(t); Object.assign(f.env, { MAIL_MODE: 'resend', RESEND_API_KEY: 'test-only', MAIL_FROM: 'STANAIC <sender@example.org>' });
  const requests = [];
  const fetcher = async (url, init) => { requests.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return Response.json({ id: 'resend-accepted-id' }); };
  let r = await f.call('process', {}, owner, {}, { fetcher });
  assert.equal(r.status, 200); assert.equal(r.body.items[0].status, 'accepted'); assert.equal(r.body.items[0].providerAccepted, true);
  assert.deepEqual(requests[0].body.to, [student.email]); assert.match(requests[0].headers['Idempotency-Key'], /^stanaic-platform\/[a-f0-9]{64}$/);
  assert.equal((await f.stateNow()).outbox[0].status, 'accepted');
  await f.call('process', {}, owner, {}, { fetcher }); assert.equal(requests.length, 1);
  assert.ok((await f.stateNow()).audit.some(a => a.action === 'notification.accepted'));
  assert.ok(!JSON.stringify(r.body).includes('test-only'));
});

test('missing credentials fail closed without changing queued records', async t => {
  const f = await fixture(t); f.env.MAIL_MODE = 'resend'; let sends = 0;
  const r = await f.call('process', {}, owner, {}, { fetcher: async () => { sends++; } });
  assert.equal(r.status, 503); assert.equal(sends, 0); assert.equal((await f.stateNow()).outbox[0].status, 'queued');
});

test('uncertain response retries original immutable request within window; old ambiguity requires reconciliation', async t => {
  const f = await fixture(t); Object.assign(f.env, { MAIL_MODE: 'resend', RESEND_API_KEY: 'test-only', MAIL_FROM: 'first@example.org' });
  const calls = []; let now = Date.now();
  const interrupted = async (_url, init) => { calls.push(init); throw Error('Response interrupted'); };
  await processNotifications(f.pool, actor, f.env, { fetcher: interrupted, now: () => now });
  const first = calls[0]; assert.equal((await f.stateNow()).outbox[0].status, 'uncertain');
  const s = await f.stateNow(); s.profiles[0].email = 'new@example.org'; s.outbox[0].text = 'Changed text';
  await f.pool.query("UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id='institution-live'", [JSON.stringify(s)]);
  f.env.MAIL_FROM = 'changed@example.org'; now += 1000;
  await processNotifications(f.pool, actor, f.env, { fetcher: interrupted, now: () => now });
  assert.equal(calls[1].headers['Idempotency-Key'], first.headers['Idempotency-Key']); assert.equal(calls[1].body, first.body);
  now += 24 * 3600000;
  await processNotifications(f.pool, actor, f.env, { fetcher: interrupted, now: () => now });
  assert.equal(calls.length, 2); assert.equal((await f.stateNow()).outbox[0].status, 'needs_reconciliation');
});

test('active lease excludes concurrent workers and expired lease retains key with stale-worker fencing', async t => {
  const f = await fixture(t); Object.assign(f.env, { MAIL_MODE: 'resend', RESEND_API_KEY: 'test-only', MAIL_FROM: 'sender@example.org' });
  let release; const started = new Promise(resolve => release = resolve); let complete; const pending = new Promise(resolve => complete = resolve); let sends = 0; const keys = [];
  const first = processNotifications(f.pool, actor, f.env, { fetcher: async (_url, init) => { sends++; keys.push(init.headers['Idempotency-Key']); release(); await pending; return Response.json({ id: 'late-worker-result' }); } });
  await started;
  const second = await processNotifications(f.pool, actor, f.env, { fetcher: async () => { sends++; return Response.json({ id: 'duplicate' }); } });
  assert.equal(second.results[0].processed, false); assert.equal(sends, 1);
  await f.pool.query("UPDATE stanaic_notification_deliveries SET lease_until=0 WHERE workspace_id='institution-live'");
  await processNotifications(f.pool, actor, f.env, { fetcher: async (_url, init) => { sends++; keys.push(init.headers['Idempotency-Key']); return Response.json({ id: 'reconciled-one-delivery' }); } });
  complete(); await first;
  assert.equal(keys[0], keys[1]); assert.equal(sends, 2);
  const job = (await f.pool.query("SELECT status,provider_id,attempts FROM stanaic_notification_deliveries WHERE workspace_id='institution-live'")).rows[0];
  assert.equal(job.status, 'accepted'); assert.equal(job.provider_id, 'reconciled-one-delivery'); assert.equal(job.attempts, 2);
  assert.equal((await f.stateNow()).outbox[0].status, 'accepted');
});

test('demo worker stays isolated and cannot send with live provider settings', async t => {
  const f = await fixture(t); Object.assign(f.env, { MAIL_MODE: 'resend', RESEND_API_KEY: 'test-only', MAIL_FROM: 'sender@example.org' });
  const request = new Request('https://platform.test/api/platform/demo/start', { method: 'POST', headers: { origin: 'https://platform.test', 'content-type': 'application/json' }, body: '{}' });
  const start = await handlePlatform(request, f.pool, null, f.env); const cookie = start.headers.get('set-cookie').split(';')[0];
  const row = (await f.pool.query('SELECT id,state FROM stanaic_platform_workspaces WHERE demo=true')).rows[0];
  row.state.outbox = [item('demo-notification', 'demo-learner')];
  await f.pool.query('UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id=$2', [JSON.stringify(row.state), row.id]);
  let sends = 0;
  const r = await f.call('process?mode=demo', { mode: 'demo' }, null, { cookie }, { fetcher: async () => { sends++; throw Error(); } });
  assert.equal(r.status, 200); assert.equal(r.body.items[0].status, 'preview'); assert.equal(sends, 0);
  assert.equal((await f.stateNow()).outbox[0].status, 'queued');
});

test('scheduler requires a dedicated strong secret and never falls back to other credentials', async t => {
  const f = await fixture(t); f.env.CREDENTIAL_SIGNING_SECRET = 's'.repeat(64);
  assert.equal((await f.call('cron', undefined, null, { authorization: 'Bearer ' + f.env.CREDENTIAL_SIGNING_SECRET })).status, 401);
  f.env.NOTIFICATION_CRON_SECRET = 'dedicated-' + 'x'.repeat(64);
  assert.equal((await f.call('cron', undefined, null, { authorization: 'Bearer wrong' })).status, 401);
  const r = await f.call('cron', undefined, null, { authorization: 'Bearer ' + f.env.NOTIFICATION_CRON_SECRET });
  assert.equal(r.status, 200); assert.equal((await f.stateNow()).outbox[0].status, 'preview');
});
