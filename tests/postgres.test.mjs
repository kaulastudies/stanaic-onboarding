import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { database, postgresSql } from '../lib/database.mjs';
import { handle } from '../lib/onboarding.mjs';

test('Postgres: complete workflow, transactional rollback and consumed links', async () => {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  const query = (...args) => pg.query(...args);
  const DB = database({ query, connect: async () => ({ query, release() {} }) });
  const identity = { id: 'postgres-owner', email: 'owner@example.org', emailVerified: true };
  const env = { DB, OWNER_EMAIL: identity.email, MAIL_MODE: 'preview', MAIL_ENCRYPTION_KEY: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64') };
  const call = async (path, data, memberCookie, who = identity) => {
    const response = await handle(new Request(`https://test.example/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { origin: 'https://test.example', 'content-type': 'application/json', ...(memberCookie ? { cookie: memberCookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) }), { ...env, identity: who });
    return { status: response.status, data: await response.json(), response };
  };
  const invited = await call('admin/invite', { name: 'Test Participant', email: 'participant@example.org', designation: 'Committee-approved role', requestKey: 'pg-test' });
  assert.equal(invited.status, 201, JSON.stringify(invited.data));
  const mail = await call(`admin/mail/preview?id=${invited.data.id}-invitation`);
  assert.doesNotMatch(mail.data.message, /honorary|recurring fees|joining fees/i);
  const token = new URLSearchParams(new URL(mail.data.link).hash.slice(1)).get('token');
  const exchanged = await call('member/exchange', { token }, undefined, null);
  assert.equal(exchanged.status, 200, JSON.stringify(exchanged.data));
  assert.equal((await call('member/exchange', { token }, undefined, null)).status, 410);
  const cookie = exchanged.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('member/submit', { name: 'Test Participant', country: 'India', expertise: 'AI governance', consent: true }, cookie, null)).status, 200);
  assert.equal((await call('admin/dashboard')).data.members[0].status, 'submitted');
  assert.equal((await call('admin/review', { id: invited.data.id, status: 'approved' })).status, 200);
  assert.equal((await call('member/profile', undefined, cookie, null)).data.status, 'approved');
  assert.equal((await call('admin/mail')).data.items.length, 4);
  await assert.rejects(DB.batch([DB.prepare('INSERT INTO staff(id,email,role,created_at) VALUES (?,?,?,?)').bind('rollback', 'rollback@example.org', 'viewer', Date.now()), DB.prepare('INSERT INTO not_a_table(id) VALUES (?)').bind('bad')]));
  assert.equal(await DB.prepare('SELECT id FROM staff WHERE id=?').bind('rollback').first(), null);
  await pg.close();
});

test('authentication boundary rejects spoofed headers and unverified identities', async () => {
  const env = { DB: {}, OWNER_EMAIL: 'owner@example.org' };
  const request = () => new Request('https://test.example/api/admin/dashboard', { headers: { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': env.OWNER_EMAIL } });
  assert.equal((await handle(request(), env)).status, 401);
  assert.equal((await handle(request(), { ...env, identity: { id: 'owner', email: env.OWNER_EMAIL, emailVerified: false } })).status, 403);
});

test('Postgres placeholders preserve literal question marks', () => {
  assert.equal(postgresSql("SELECT '?' AS question WHERE id=?"), "SELECT '?' AS question WHERE id=$1");
});
