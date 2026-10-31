import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { ensurePlatformSchema, resolvePlatformActor } from './platform.mjs';

const RETRY_WINDOW = 23 * 60 * 60 * 1000;
const LEASE = 2 * 60 * 1000;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const hash = value => createHash('sha256').update(value).digest('hex');
const privileged = actor => ['superadmin', 'admin'].includes(actor.role);
const terminal = new Set(['accepted', 'preview', 'needs_recipient', 'needs_reconciliation']);
const prepared = new WeakMap();

export async function ensureNotificationSchema(pool) {
  let ready = prepared.get(pool);
  if (!ready) {
    ready = (async () => {
      await ensurePlatformSchema(pool);
      await pool.query(`CREATE TABLE IF NOT EXISTS stanaic_notification_deliveries (
        workspace_id text NOT NULL REFERENCES stanaic_platform_workspaces(id) ON DELETE CASCADE,
        notification_id text NOT NULL,
        recipient_id text NOT NULL,
        recipient text,
        sender text,
        subject text NOT NULL,
        body text NOT NULL,
        mode text NOT NULL,
        status text NOT NULL,
        idempotency_key text NOT NULL UNIQUE,
        attempts integer NOT NULL DEFAULT 0,
        first_attempt_at bigint,
        lease_until bigint,
        lease_token text,
        provider_id text,
        error text,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        PRIMARY KEY(workspace_id, notification_id)
      )`);
    })().catch(error => { prepared.delete(pool); throw error; });
    prepared.set(pool, ready);
  }
  return ready;
}

export function notificationConfiguration(env = {}, demo = false) {
  const mode = demo || env.MAIL_MODE !== 'resend' ? 'preview' : 'resend';
  const configured = mode === 'preview' || !!(env.RESEND_API_KEY && env.MAIL_FROM);
  return { mode, configured, cronConfigured: typeof env.NOTIFICATION_CRON_SECRET === 'string' && env.NOTIFICATION_CRON_SECRET.length >= 32,
    description: mode === 'preview' ? 'Protected preview only; no external email is sent.' : configured ? 'Provider configured. Accepted means accepted by the provider, not inbox delivery.' : 'Configure a verified sender and Resend credentials before external delivery.' };
}

async function workspace(client, actor) {
  const row = (await client.query('SELECT * FROM stanaic_platform_workspaces WHERE id=$1 FOR UPDATE', [actor.workspaceId])).rows[0];
  if (!row || row.demo !== actor.demo || (row.expires_at && Number(row.expires_at) <= Date.now())) fail(401, 'The workspace is unavailable or expired.');
  return row;
}

function sync(state, notificationId, result) {
  const item = (state.outbox || []).find(item => item.id === notificationId);
  if (item) { item.status = result.status; item.deliveryAttempts = Number(result.attempts || 0); item.providerAccepted = result.status === 'accepted'; }
}
async function saveState(client, actor, state) { await client.query('UPDATE stanaic_platform_workspaces SET state=$1::jsonb WHERE id=$2', [JSON.stringify(state), actor.workspaceId]); }
function validEmail(value) { return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function safeSubject(kind) { return `STANAIC update: ${String(kind || 'workspace').replace(/[\r\n\u0000-\u001f]/g, '').slice(0, 80)}`; }

async function claim(pool, actor, id, env, now) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await workspace(client, actor), state = row.state;
    const item = (state.outbox || []).find(item => item.id === id);
    if (!item) { await client.query('COMMIT'); return null; }
    const configuration = notificationConfiguration(env, actor.demo);
    const profile = (state.profiles || []).find(profile => profile.id === item.recipientId);
    // Only the server-verified identity email recorded on the profile is used.
    // Editable onboarding contactEmail, manuscript data and client recipient fields are ignored.
    const recipient = validEmail(profile?.email) ? profile.email.toLowerCase() : null;
    const status = !recipient ? 'needs_recipient' : configuration.mode === 'preview' ? 'preview' : 'queued';
    await client.query(`INSERT INTO stanaic_notification_deliveries
      (workspace_id,notification_id,recipient_id,recipient,sender,subject,body,mode,status,idempotency_key,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) ON CONFLICT(workspace_id,notification_id) DO NOTHING`,
      [actor.workspaceId, id, item.recipientId, recipient, configuration.mode === 'resend' ? env.MAIL_FROM : null,
        safeSubject(item.kind), String(item.text || '').slice(0, 20000), configuration.mode, status,
        `stanaic-platform/${hash(actor.workspaceId + ':' + id)}`, now]);
    const job = (await client.query('SELECT * FROM stanaic_notification_deliveries WHERE workspace_id=$1 AND notification_id=$2 FOR UPDATE', [actor.workspaceId, id])).rows[0];
    if (terminal.has(job.status)) { sync(state, id, job); await saveState(client, actor, state); await client.query('COMMIT'); return null; }
    if (job.status === 'sending' && Number(job.lease_until) > now) { await client.query('COMMIT'); return null; }
    if (job.first_attempt_at && now - Number(job.first_attempt_at) >= RETRY_WINDOW) {
      await client.query("UPDATE stanaic_notification_deliveries SET status='needs_reconciliation',error=$1,updated_at=$2 WHERE workspace_id=$3 AND notification_id=$4",
        ['The provider idempotency retry window is over. Check provider records before taking further action.', now, actor.workspaceId, id]);
      job.status = 'needs_reconciliation'; sync(state, id, job); await saveState(client, actor, state); await client.query('COMMIT'); return null;
    }
    // A captured preview is never promoted into a real message by a later config change.
    if (job.mode !== 'resend') { await client.query('COMMIT'); return null; }
    const leaseToken = randomUUID();
    const claimed = (await client.query(`UPDATE stanaic_notification_deliveries SET status='sending',attempts=attempts+1,
      first_attempt_at=COALESCE(first_attempt_at,$1),lease_until=$2,lease_token=$3,error=NULL,updated_at=$1
      WHERE workspace_id=$4 AND notification_id=$5 RETURNING *`, [now, now + LEASE, leaseToken, actor.workspaceId, id])).rows[0];
    sync(state, id, claimed); await saveState(client, actor, state); await client.query('COMMIT');
    return claimed;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function finish(pool, actor, job, result, now) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await workspace(client, actor);
    const updated = (await client.query(`UPDATE stanaic_notification_deliveries SET status=$1,provider_id=$2,error=$3,
      lease_until=NULL,lease_token=NULL,updated_at=$4 WHERE workspace_id=$5 AND notification_id=$6 AND lease_token=$7 RETURNING *`,
      [result.status, result.providerId || null, result.error || null, now, actor.workspaceId, job.notification_id, job.lease_token])).rows[0];
    if (updated) {
      sync(row.state, job.notification_id, updated);
      row.state.audit ??= [];
      row.state.audit.unshift({ id: randomUUID(), at: now, actorId: actor.actorId, role: actor.role, action: `notification.${result.status}`, target: job.notification_id, detail: result.status === 'accepted' ? 'Email accepted by the configured provider; delivery is not confirmed.' : `Notification delivery state: ${result.status}` });
      row.state.audit = row.state.audit.slice(0, 1000);
      await saveState(client, actor, row.state);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function processNotifications(pool, actor, env = {}, options = {}) {
  if (!privileged(actor)) fail(403, 'Only secretariat administrators may process notifications.');
  await ensureNotificationSchema(pool);
  const configuration = notificationConfiguration(env, actor.demo);
  if (!configuration.configured) fail(503, configuration.description);
  const limit = options.limit === undefined ? 10 : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) fail(400, 'Choose a batch size between 1 and 20.');
  const row = (await pool.query('SELECT * FROM stanaic_platform_workspaces WHERE id=$1', [actor.workspaceId])).rows[0];
  if (!row || row.demo !== actor.demo || (row.expires_at && Number(row.expires_at) <= Date.now())) fail(401, 'The workspace is unavailable or expired.');
  const ids = (row.state.outbox || []).filter(item => ['queued', 'failed', 'uncertain', 'sending'].includes(item.status)).slice(0, limit).map(item => item.id);
  const results = [], started = Date.now();
  for (const id of ids) {
    if (Date.now() - started > 35000) break;
    const job = await claim(pool, actor, id, env, options.now?.() ?? Date.now());
    if (!job) { results.push({ id, processed: false }); continue; }
    let result;
    try {
      const response = await (options.fetcher || fetch)('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': job.idempotency_key },
        body: JSON.stringify({ from: job.sender, to: [job.recipient], subject: job.subject, text: job.body }),
      });
      const data = await response.json().catch(() => ({}));
      result = response.ok && typeof data.id === 'string' && data.id ? { status: 'accepted', providerId: data.id } : { status: response.status >= 500 || response.ok ? 'uncertain' : 'failed', error: `Email provider returned ${response.status}.` };
    } catch { result = { status: 'uncertain', error: 'Provider response interrupted. Any permitted retry uses the original idempotency key and payload.' }; }
    await finish(pool, actor, job, result, options.now?.() ?? Date.now());
    results.push({ id, processed: true, status: result.status });
  }
  return { results, considered: ids.length, configuration };
}

async function status(pool, actor, env) {
  const isAdmin = privileged(actor);
  const rows = (await pool.query(`SELECT notification_id,recipient_id,recipient,status,attempts,first_attempt_at,lease_until,provider_id,error,created_at,updated_at
    FROM stanaic_notification_deliveries WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 500`, [actor.workspaceId])).rows;
  const state = (await pool.query('SELECT state,demo,expires_at FROM stanaic_platform_workspaces WHERE id=$1', [actor.workspaceId])).rows[0];
  if (!state || state.demo !== actor.demo || (state.expires_at && Number(state.expires_at) <= Date.now())) fail(401, 'The workspace is unavailable or expired.');
  const ownId = actor.demo && ['learner', 'author'].includes(actor.role) ? 'demo-learner' : actor.actorId;
  const jobs = new Map(rows.map(row => [row.notification_id, row]));
  const items = (state.state.outbox || []).filter(item => isAdmin || item.recipientId === ownId).map(item => {
    const job = jobs.get(item.id);
    return { id: item.id, kind: item.kind, text: item.text, createdAt: item.createdAt, status: job?.status || item.status,
      attempts: Number(job?.attempts || 0), error: job?.error || null, providerAccepted: job?.status === 'accepted',
      ...(isAdmin ? { recipient: job?.recipient || null, recipientId: item.recipientId, firstAttemptAt: job?.first_attempt_at || null, leaseUntil: job?.lease_until || null } : {}) };
  });
  return { items, canProcess: isAdmin, configuration: notificationConfiguration(env, actor.demo) };
}

function cronAuthorised(request, env) {
  if (!env.NOTIFICATION_CRON_SECRET || typeof env.NOTIFICATION_CRON_SECRET !== 'string' || env.NOTIFICATION_CRON_SECRET.length < 32) return false;
  const actual = Buffer.from(hash(request.headers.get('authorization') || ''));
  const expected = Buffer.from(hash(`Bearer ${env.NOTIFICATION_CRON_SECRET}`));
  return timingSafeEqual(actual, expected);
}

/** @param {Request} request @param {any} pool @param {any} identity @param {any} env @param {any} options */
export async function handleNotifications(request, pool, identity = null, env = {}, options = {}) {
  try {
    const url = new URL(request.url), path = url.pathname.replace(/^\/api\/platform\/notifications\/?/, '');
    if (!['GET', 'POST'].includes(request.method)) fail(405, 'Method not supported.');
    if (path === 'cron') {
      if (request.method !== 'GET') fail(405, 'Use GET for the protected scheduler callback.');
      if (!cronAuthorised(request, env)) fail(401, 'Scheduler authorisation is missing or invalid.');
      await ensureNotificationSchema(pool);
      return json(await processNotifications(pool, { workspaceId: 'institution-live', actorId: 'notification-scheduler', role: 'admin', demo: false }, env, options));
    }
    let body = {};
    if (request.method === 'POST') {
      if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'Use this workspace to process notifications.');
      if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, 'JSON is required.');
      const raw = await request.text(); if (raw.length > 2000) fail(413, 'Request is too large.');
      try { body = JSON.parse(raw); } catch { fail(400, 'Invalid JSON.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Invalid request.');
    }
    const mode = (body.mode || url.searchParams.get('mode')) === 'demo' ? 'demo' : 'live';
    await ensureNotificationSchema(pool);
    const actor = await resolvePlatformActor(request, pool, identity, env, mode);
    if (path === 'status' && request.method === 'GET') return json(await status(pool, actor, env));
    if (path === 'process' && request.method === 'POST') {
      const processed = await processNotifications(pool, actor, env, { ...options, limit: body.limit ?? 10 });
      return json({ ...processed, ...await status(pool, actor, env) });
    }
    fail(404, 'Notification endpoint not found.');
  } catch (error) { return json({ error: error.status ? error.message : 'Notification processing is temporarily unavailable. Retry after checking configuration.' }, error.status || 503); }
}
