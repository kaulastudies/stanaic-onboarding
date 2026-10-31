// Public demonstration only. This module never queries live onboarding tables or sends email.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
export const DEMO_ACCOUNTS = Object.freeze({
  admin: { username: 'demo-admin', password: 'AdminDemo2026!' },
  member: { username: 'demo-member', password: 'MemberDemo2026!' },
});
const TTL = 6 * 60 * 60 * 1000;
const hash = value => createHash('sha256').update(value || '').digest('hex');
const secret = () => randomBytes(32).toString('hex');
const cookies = request => Object.fromEntries((request.headers.get('cookie') || '').split(';').map(x => x.trim().split('=')));
const cookie = (name, value, age = TTL / 1000) => `${name}=${value}; Path=/api/demo; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const json = (value, status = 200, setCookies = []) => {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
  for (const value of setCookies) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(value), { status, headers });
};
const text = (value, label, max, required = true) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(400, `Please check ${label}.`);
  return value.trim();
};
const sampleEmail = value => {
  const email = text(value, 'the sample email address', 254).toLowerCase();
  if (!/^[a-z0-9._+-]+@example\.(org|com|net)$/.test(email)) fail(400, 'For this demo, use a sample address ending in @example.org, @example.com, or @example.net.');
  return email;
};
function message(state, member, kind, subject, body, link, recipient = member.email) {
  const id = randomUUID();
  state.mail.unshift({ id, recipient, kind, status: 'preview', created_at: Date.now(), subject, message: body, link });
  state.mail = state.mail.slice(0, 150);
}
function invitation(state, member, origin) {
  member.token = secret(); member.token_expires = Date.now() + TTL; member.tokenUsed = false;
  message(state, member, 'Invitation', 'Your STANAIC onboarding invitation', `Hello ${member.name},\n\nThis is a sample onboarding invitation for ${member.designation}. Open the link below to complete the demo form.\n\nDemo only: this message has not been emailed.`, `${origin}/demo/member#token=${member.token}`);
}
export function demoSeed(origin) {
  const state = { members: [{ id: 'demo-member', requestKey: 'seed', name: 'Demo Member', email: 'member@example.org', designation: 'Sample role', status: 'invited', created_at: Date.now(), profile: null, feedback: '' }], mail: [], staff: [] };
  invitation(state, state.members[0], origin);
  return state;
}
const record = m => ({ ...m, token: undefined, requestKey: undefined, expiresAt: m.token_expires, submittedAt: m.submitted_at });

// The caller holds a row lock on the browser's workspace throughout each request.
export function demoAction(state, path, data, role, memberId, origin) {
  if (path.startsWith('admin/') && role !== 'admin') fail(403, 'Please sign in with the demo administrator account.');
  if (path.startsWith('member/') && role !== 'member') fail(403, 'Please sign in with the demo member account.');
  const find = id => state.members.find(m => m.id === id) || fail(404, 'Sample member not found.');
  if (path === 'admin/dashboard') return { user: { email: 'admin@example.org', role: 'Demo admin', permissions: ['read', 'invite', 'review', 'mail', 'team'] }, members: state.members.map(record), titles: [...new Set(state.members.map(m => m.designation))], mailMode: 'preview', serverTime: Date.now() };
  if (path === 'admin/member') return record(find(data.id));
  if (path === 'admin/mail') return { items: state.mail.map(({ subject, message, link, ...item }) => item) };
  if (path === 'admin/mail/preview') return state.mail.find(m => m.id === data.id) || fail(404, 'Sample message not found.');
  if (path === 'admin/team/list') return { staff: state.staff };
  if (path === 'admin/team') {
    const email = sampleEmail(data.email);
    if (!['admin', 'maintainer', 'viewer'].includes(data.role)) fail(400, 'Select an access role.');
    const staff = state.staff.find(s => s.email === email);
    if (staff) staff.role = data.role;
    else { if (state.staff.length >= 10) fail(400, 'This demo supports up to 10 sample colleagues.'); state.staff.push({ id: randomUUID(), email, role: data.role, user_id: null }); }
    return { ok: true };
  }
  if (path === 'admin/team/remove') { state.staff = state.staff.filter(s => s.id !== data.id); return { ok: true }; }
  if (path === 'admin/invite') {
    const name = text(data.name, 'the name', 120), email = sampleEmail(data.email), designation = text(data.designation, 'the role or programme', 100), requestKey = text(data.requestKey, 'the request identifier', 100);
    const existing = state.members.find(m => m.requestKey === requestKey);
    if (existing) return { id: existing.id };
    if (state.members.some(m => m.email === email && !['revoked', 'declined'].includes(m.status))) fail(409, 'An active invitation already exists for this sample email.');
    if (state.members.length >= 25) fail(400, 'This demo supports 25 members. Reset the workspace to start again.');
    const member = { id: randomUUID(), requestKey, name, email, designation, status: 'invited', created_at: Date.now(), profile: null, feedback: '' };
    state.members.unshift(member); invitation(state, member, origin); return { id: member.id };
  }
  if (path === 'admin/member/update') {
    const member = find(data.id);
    if (['revoked', 'declined'].includes(member.status)) fail(409, 'Only an active sample onboarding record can be updated.');
    member.designation = text(data.designation, 'the approved membership designation', 100);
    state.audit ||= [];
    state.audit.unshift({ actor: 'demo-admin', action: 'membership.designation.updated', target: member.id, created_at: Date.now() });
    return { ok: true, designation: member.designation };
  }
  if (path === 'admin/renew' || path === 'admin/revoke') {
    const member = find(data.id);
    if (member.status !== 'invited') fail(409, 'Only an invitation awaiting details can be changed.');
    if (path === 'admin/revoke') { member.status = 'revoked'; member.token = null; }
    else invitation(state, member, origin);
    return { ok: true };
  }
  if (path === 'admin/review') {
    const member = find(data.id);
    if (member.status !== 'submitted') fail(409, 'This sample member is not awaiting review.');
    if (!['approved', 'declined'].includes(data.status)) fail(400, 'Choose a review decision.');
    member.feedback = text(data.feedback || '', 'the review note', 1000, false);
    member.status = data.status; member.reviewed_at = Date.now();
    message(state, member, 'Review update', 'Your onboarding review', `Hello ${member.name},\n\nYour sample onboarding status is ${member.status}.\n${member.feedback}\n\nDemo only: no appointment or certification is issued.`, `${origin}/demo/member`);
    return { ok: true };
  }
  if (path === 'member/profile' || path === 'member/submit') {
    const member = find(memberId);
    if (member.status === 'revoked') fail(410, 'This sample invitation was revoked. Ask the demo administrator to reset the workspace.');
    if (path === 'member/profile') return record(member);
    if (member.status !== 'invited') fail(409, 'Details have already been submitted.');
    if (data.consent !== true) fail(400, 'Please confirm consent before submitting.');
    const profile = { contactEmail: data.contactEmail ? sampleEmail(data.contactEmail) : member.email, requestedDesignation: text(data.requestedDesignation || '', 'the requested role or programme', 100, false), name: text(data.name, 'the name', 120), country: text(data.country, 'the country', 100), expertise: text(data.expertise, 'the research interests', 600), affiliation: text(data.affiliation || '', 'the affiliation', 200, false), bio: text(data.bio || '', 'the introduction', 1500, false), portfolio: text(data.portfolio || '', 'the portfolio URL', 500, false), consent: true, consentAt: Date.now() };
    if (profile.portfolio) { try { if (new URL(profile.portfolio).protocol !== 'https:') fail(400, 'Use an https:// portfolio URL.'); } catch { fail(400, 'Use a valid https:// portfolio URL.'); } }
    member.profile = profile; member.name = profile.name; member.status = 'submitted'; member.submitted_at = Date.now();
    message(state, member, 'Submission receipt', 'Your details were received', `Hello ${member.name},\n\nYour sample details are ready for the demo administrator to review.`, `${origin}/demo/member`);
    message(state, member, 'Review notification', 'A sample member is ready for review', `${member.name} submitted their onboarding details. Open the demo dashboard to review them.`, `${origin}/demo/admin`, 'admin@example.org');
    return { ok: true };
  }
  fail(404, 'Demo action not found.');
}

export async function handleDemo(request, pool, clientIp = 'unknown') {
  const url = new URL(request.url), path = url.pathname.replace(/^\/api\/demo\/?/, ''), jar = cookies(request), now = Date.now();
  let client, transaction = false;
  try {
    if (!['GET', 'POST'].includes(request.method)) fail(405, 'Method not supported.');
    let data = {};
    if (request.method === 'POST') {
      if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'Please use this demo portal to submit the form.');
      if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, 'JSON is required.');
      const body = await request.text(); if (body.length > 16000) fail(413, 'The form is too large.');
      try { data = JSON.parse(body); } catch { fail(400, 'Invalid form data.'); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Invalid form data.');
    } else data = Object.fromEntries(url.searchParams);
    const readPaths = ['admin/dashboard', 'admin/member', 'admin/mail', 'admin/mail/preview', 'admin/team', 'member/profile'];
    if (request.method === 'GET' && !readPaths.includes(path)) fail(405, 'Use POST for this action.');
    if (request.method === 'POST' && readPaths.includes(path) && path !== 'admin/team') fail(405, 'Use GET for this action.');
    client = await pool.connect();
    if (path === 'login') {
      const bucket = `${hash(clientIp)}:${Math.floor(now / 3600000)}`;
      const limit = await client.query('INSERT INTO demo_login_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=demo_login_limits.count+1 RETURNING count', [bucket, now + 3600000]);
      if (Number(limit.rows[0].count) > 60) fail(429, 'Too many demo sign-in attempts. Please try again later.');
      const role = Object.keys(DEMO_ACCOUNTS).find(role => data.username === DEMO_ACCOUNTS[role].username && data.password === DEMO_ACCOUNTS[role].password);
      if (!role) fail(401, 'The demo username or password is incorrect. Use the credentials shown below.');
      await client.query('BEGIN'); transaction = true;
      await client.query('DELETE FROM demo_workspaces WHERE expires_at < $1', [now]);
      await client.query('DELETE FROM demo_login_limits WHERE expires_at < $1', [now]);
      let workspaceToken = jar.stanaic_demo_workspace, workspace = (await client.query('SELECT id,expires_at FROM demo_workspaces WHERE id=$1 AND expires_at>$2', [hash(workspaceToken), now])).rows[0];
      const setCookies = [];
      if (!workspace) {
        // Bound the public sandbox independently of live records.
        await client.query('SELECT pg_advisory_xact_lock(73104003)');
        const count = await client.query('SELECT count(*) AS count FROM demo_workspaces');
        if (Number(count.rows[0].count) >= 500) fail(503, 'All demo workspaces are in use. Please try again later.');
        workspaceToken = secret(); workspace = { id: hash(workspaceToken), expires_at: now + TTL };
        await client.query('INSERT INTO demo_workspaces(id,state,expires_at) VALUES($1,$2::jsonb,$3)', [workspace.id, JSON.stringify(demoSeed(url.origin)), workspace.expires_at]);
        setCookies.push(cookie('stanaic_demo_workspace', workspaceToken));
      }
      const token = secret(), sessionName = `stanaic_demo_${role}`;
      // One session per role and browser workspace. Login rotates that role's token.
      await client.query('DELETE FROM demo_sessions WHERE workspace_id=$1 AND role=$2', [workspace.id, role]);
      await client.query('INSERT INTO demo_sessions(token_hash,workspace_id,role,member_id,expires_at) VALUES($1,$2,$3,$4,$5)', [hash(token), workspace.id, role, 'demo-member', workspace.expires_at]);
      await client.query('COMMIT'); transaction = false;
      setCookies.push(cookie(sessionName, token, Math.max(1, Math.floor((workspace.expires_at - now) / 1000))));
      return json({ role, next: `/demo/${role}` }, 200, setCookies);
    }
    await client.query('BEGIN'); transaction = true;
    const requiredRole = path.startsWith('admin/') || path === 'reset' ? 'admin' : path === 'logout' ? data.role : 'member';
    if (!['admin', 'member'].includes(requiredRole)) fail(400, 'Select a demo role.');
    let session = (await client.query('SELECT * FROM demo_sessions WHERE token_hash=$1 AND role=$2 AND expires_at>$3', [hash(jar[`stanaic_demo_${requiredRole}`]), requiredRole, now])).rows[0];
    // An admin may open a sample invitation from their own demo inbox.
    if (!session && path === 'member/exchange') session = (await client.query("SELECT * FROM demo_sessions WHERE token_hash=$1 AND role='admin' AND expires_at>$2", [hash(jar.stanaic_demo_admin), now])).rows[0];
    if (!session || session.workspace_id !== hash(jar.stanaic_demo_workspace)) fail(401, 'Sign in to the demo to continue.');
    const workspace = (await client.query('SELECT * FROM demo_workspaces WHERE id=$1 AND expires_at>$2 FOR UPDATE', [session.workspace_id, now])).rows[0];
    if (!workspace) fail(401, 'Your six-hour demo workspace expired. Please sign in again.');
    let state = workspace.state, result, setCookies = [];
    if (path === 'logout') {
      await client.query('DELETE FROM demo_sessions WHERE token_hash=$1', [session.token_hash]);
      setCookies.push(cookie(`stanaic_demo_${requiredRole}`, '', 0)); result = { ok: true };
    } else if (path === 'reset') {
      state = demoSeed(url.origin); await client.query("DELETE FROM demo_sessions WHERE workspace_id=$1 AND role='member'", [workspace.id]);
      result = { ok: true };
    } else if (path === 'member/exchange') {
      const token = text(data.token, 'the invitation link', 64);
      const member = state.members.find(m => m.token === token && m.status === 'invited' && !m.tokenUsed && m.token_expires > now);
      if (!member) fail(410, 'This demo invitation has expired or was already opened. Create a replacement link in the demo administrator portal.');
      member.tokenUsed = true;
      const memberToken = secret();
      await client.query("DELETE FROM demo_sessions WHERE workspace_id=$1 AND role='member'", [workspace.id]);
      await client.query("INSERT INTO demo_sessions(token_hash,workspace_id,role,member_id,expires_at) VALUES($1,$2,'member',$3,$4)", [hash(memberToken), workspace.id, member.id, workspace.expires_at]);
      setCookies.push(cookie('stanaic_demo_member', memberToken, Math.max(1, Math.floor((workspace.expires_at - now) / 1000)))); result = { ok: true };
    } else {
      const action = path === 'admin/team' && request.method === 'GET' ? 'admin/team/list' : path;
      result = demoAction(state, action, data, session.role, session.member_id, url.origin);
      if (path === 'admin/renew' || path === 'admin/revoke') await client.query("DELETE FROM demo_sessions WHERE workspace_id=$1 AND role='member' AND member_id=$2", [workspace.id, data.id]);
    }
    if (request.method === 'POST') await client.query('UPDATE demo_workspaces SET state=$1::jsonb WHERE id=$2', [JSON.stringify(state), workspace.id]);
    await client.query('COMMIT'); transaction = false;
    return json(result, 200, setCookies);
  } catch (error) {
    if (transaction) await client.query('ROLLBACK');
    return json({ error: error.status ? error.message : 'The demo is temporarily unavailable. Please try again.' }, error.status || 503);
  } finally { client?.release(); }
}
