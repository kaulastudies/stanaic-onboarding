// Identity headers must come from the trusted Sites dispatcher, never a direct public worker.
const DAY = 86400000;
const ROLES = { owner: ["read", "invite", "review", "mail", "team"], admin: ["read", "invite", "review", "mail"], maintainer: ["read", "review"], viewer: ["read"] };
export const DESIGNATIONS = ["Research Fellow", "Technical Consultant", "Research Contributor", "Volunteer Coordinator"];
const enc = new TextEncoder();
const uuid = () => crypto.randomUUID();
const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const first = (env, sql, ...args) => stmt(env, sql, ...args).first();
const all = async (env, sql, ...args) => (await stmt(env, sql, ...args).all()).results;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const json = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", ...extra } });
export async function hash(value) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))), x => x.toString(16).padStart(2, "0")).join(""); }
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, "0")).join("");
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = value => Uint8Array.from(atob(value), x => x.charCodeAt(0));
async function key(env) {
  if (!env.MAIL_ENCRYPTION_KEY || unb64(env.MAIL_ENCRYPTION_KEY).length !== 32) fail(503, "Secure mail configuration is missing. Please contact the administrator.");
  return crypto.subtle.importKey("raw", unb64(env.MAIL_ENCRYPTION_KEY), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(env), enc.encode(JSON.stringify(value)));
  return `${b64(iv)}.${b64(new Uint8Array(body))}`;
}
async function unseal(env, value) {
  const [iv, body] = value.split(".");
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(env), unb64(body))));
}
function text(value, label, max, required = true) {
  if (typeof value !== "string") { if (!required && value == null) return ""; fail(400, `${label} is required.`); }
  const clean = value.trim();
  if ((required && !clean) || clean.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(clean)) fail(400, `Please check ${label.toLowerCase()} (maximum ${max} characters).`);
  return clean;
}
function email(value) { const v = text(value, "Email", 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(400, "Enter a valid email address."); return v; }
async function body(request) {
  if (!request.headers.get("content-type")?.includes("application/json")) fail(415, "Send JSON data.");
  const value = await request.text(); if (value.length > 16000) fail(413, "This form is too large.");
  try { const parsed = JSON.parse(value); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error(); return parsed; } catch { fail(400, "Please check the form and try again."); }
}
function originCheck(request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") fail(403, "Please use this portal to submit the form.");
}
async function actor(request, env, permission = "read") {
  const id = request.headers.get("oai-authenticated-user-id"), address = request.headers.get("oai-authenticated-user-email")?.toLowerCase();
  if (!id || !address) fail(401, "Sign in to the administrator portal.");
  let role;
  if (env.OWNER_USER_ID && id === env.OWNER_USER_ID) role = "owner";
  else {
    await stmt(env, "UPDATE staff SET user_id=? WHERE email=? AND user_id IS NULL", id, address).run();
    role = (await first(env, "SELECT role FROM staff WHERE user_id=?", id))?.role;
  }
  if (!ROLES[role]?.includes(permission)) fail(403, "Your account does not have access to this action.");
  return { id, email: address, role, permissions: ROLES[role] };
}
async function rate(env, bucket, maximum, period) {
  const k = `${bucket}:${Math.floor(Date.now() / period)}`;
  const row = await first(env, "INSERT INTO limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count", k, Date.now() + period);
  if (row.count > maximum) fail(429, "Too many attempts. Please try again later.");
  await stmt(env, "DELETE FROM limits WHERE expires_at<?", Date.now()).run();
}
function event(env, who, action, target) { return stmt(env, "INSERT INTO audit (id,actor,action,target,created_at) VALUES (?,?,?,?,?)", uuid(), who, action, target, Date.now()); }
async function member(request, env) {
  const raw = request.headers.get("cookie")?.match(/(?:^|;\s*)stanaic_member=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!raw) fail(401, "Open your invitation email to continue.");
  const row = await first(env, "SELECT i.* FROM invitations i JOIN sessions s ON s.invitation_id=i.id WHERE s.hash=? AND s.expires_at>? AND i.status!='revoked'", await hash(raw), Date.now());
  if (!row) fail(401, "This session has expired. Please ask the administrator for a new invitation.");
  return row;
}
function publicMember(row) { return { id: row.id, name: row.name, email: row.email, designation: row.designation, status: row.status, profile: row.profile ? JSON.parse(row.profile) : null, feedback: row.feedback, submittedAt: row.submitted_at }; }
async function mailStatement(env, { id, to, kind, invitationId, subject, message, link }) {
  const payload = await seal(env, { subject, message, link });
  return stmt(env, "INSERT OR IGNORE INTO outbox (id,recipient,kind,invitation_id,payload,status,attempts,created_at) VALUES (?,?,?,?,?,?,0,?)", id, to, kind, invitationId, payload, env.MAIL_MODE === "resend" ? "queued" : "preview", Date.now());
}
export async function deliver(env, ids) {
  if (env.MAIL_MODE !== "resend") return;
  for (const id of ids) {
    const row = await first(env, "SELECT * FROM outbox WHERE id=?", id);
    if (!row || !["queued", "failed", "uncertain"].includes(row.status)) continue;
    if (row.attempted_at && Date.now() - row.attempted_at > 23 * 3600000) continue;
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) { await stmt(env, "UPDATE outbox SET status='failed',error=? WHERE id=?", "Sending account is not configured.", id).run(); continue; }
    const claimed = await first(env, "UPDATE outbox SET status='sending',attempts=attempts+1,attempted_at=COALESCE(attempted_at,?),error=NULL WHERE id=? AND status IN ('queued','failed','uncertain') RETURNING id", Date.now(), id);
    if (!claimed) continue;
    try {
      const payload = await unseal(env, row.payload);
      const result = await (env.fetch || fetch)("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": id },
        body: JSON.stringify({ from: env.MAIL_FROM, to: [row.recipient], subject: payload.subject, text: payload.message + (payload.link ? `\n\n${payload.link}` : "") }),
      });
      const data = await result.json().catch(() => ({}));
      const state = result.ok && data.id ? "accepted" : result.status >= 500 ? "uncertain" : "failed";
      await stmt(env, "UPDATE outbox SET status=?,provider_id=?,error=? WHERE id=?", state, data.id || null, state === "accepted" ? null : `Email provider returned ${result.status}.`, id).run();
    } catch { await stmt(env, "UPDATE outbox SET status='uncertain',error=? WHERE id=?", "Delivery response was interrupted. Retry uses the same provider idempotency key.", id).run(); }
  }
}
export async function handle(request, env) {
  try {
    if (!env.DB || !env.OWNER_USER_ID) fail(503, "Portal setup is incomplete. Please contact the administrator.");
    const path = new URL(request.url).pathname.replace(/^\/api\//, ""), isPost = request.method === "POST";
    if (!["GET", "POST"].includes(request.method)) fail(405, "Method not supported.");
    if (isPost) originCheck(request);
    if (path === "session" && !isPost) {
      const id = request.headers.get("oai-authenticated-user-id"), address = request.headers.get("oai-authenticated-user-email");
      if (!id || !address) fail(401, "Sign in to view your account reference.");
      return json({ userId: id, email: address });
    }
    if (path === "member/exchange" && isPost) {
      const b = await body(request);
      await rate(env, `exchange:${await hash(request.headers.get("cf-connecting-ip") || "local")}`, 40, 60000);
      if (typeof b.token !== "string" || !/^[a-f0-9]{64}$/.test(b.token)) fail(400, "This invitation link is invalid.");
      const h = await hash(b.token), raw = token(), sessionHash = await hash(raw), now = Date.now();
      const result = await env.DB.batch([
        stmt(env, "INSERT INTO sessions (hash,invitation_id,expires_at) SELECT ?,id,? FROM invitations WHERE token_hash=? AND token_used IS NULL AND token_expires>? AND status='invited'", sessionHash, now + 14 * DAY, h, now),
        stmt(env, "UPDATE invitations SET token_used=? WHERE token_hash=? AND token_used IS NULL AND EXISTS(SELECT 1 FROM sessions WHERE hash=?)", now, h, sessionHash),
      ]);
      if (!result[0].meta.changes) fail(410, "This invitation has expired, was already opened, or was revoked. Continue in your original browser, or request a new invitation.");
      return json({ ok: true }, 200, { "Set-Cookie": `stanaic_member=${raw}; Path=/api/member; HttpOnly; SameSite=Lax; Max-Age=1209600${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` });
    }
    if (path === "member/profile" && request.method === "GET") return json(publicMember(await member(request, env)));
    if (path === "member/submit" && isPost) {
      const row = await member(request, env);
      if (row.status !== "invited") return json({ ok: true, status: row.status });
      const b = await body(request);
      if (b.consent !== true) fail(400, "Please confirm consent to share these details with the onboarding team.");
      const profile = { name: text(b.name, "Full name", 120), affiliation: text(b.affiliation, "Affiliation", 200, false), country: text(b.country, "Country", 100), expertise: text(b.expertise, "Research interests or expertise", 600), bio: text(b.bio, "Short introduction", 1500, false), portfolio: text(b.portfolio, "Portfolio link", 500, false), consent: true, consentVersion: "2026-10-30" };
      if (profile.portfolio) { let url; try { url = new URL(profile.portfolio); } catch { fail(400, "Portfolio link must be a full https:// URL."); } if (url.protocol !== "https:" || url.username || url.password) fail(400, "Portfolio link must be a full https:// URL."); }
      const noticeTo = email(env.ADMIN_NOTIFY_EMAIL || env.OWNER_EMAIL), site = new URL(request.url).origin;
      const ids = [`${row.id}-receipt`, `${row.id}-notice`];
      const mails = await Promise.all([
        mailStatement(env, { id: ids[0], to: row.email, kind: "Member receipt", invitationId: row.id, subject: "Your STANAIC details have been received", message: `Hello ${profile.name},\n\nThank you. Your onboarding details have been submitted for review. Submission does not itself confirm an appointment. The team will follow up after reviewing your details.` }),
        mailStatement(env, { id: ids[1], to: noticeTo, kind: "Submission notification", invitationId: row.id, subject: "STANAIC onboarding: new submission", message: `${profile.name} has submitted their ${row.designation} onboarding details. Sign in to review them.`, link: `${site}/admin` }),
      ]);
      await env.DB.batch([stmt(env, "UPDATE invitations SET name=?,profile=?,status='submitted',submitted_at=? WHERE id=? AND status='invited'", profile.name, JSON.stringify(profile), Date.now(), row.id), ...mails, event(env, row.id, "member.submitted", row.id)]);
      await deliver(env, ids); return json({ ok: true, status: "submitted" });
    }
    if (!path.startsWith("admin/")) fail(404, "Not found.");
    if (path === "admin/dashboard" && !isPost) {
      const user = await actor(request, env);
      const members = await all(env, "SELECT id,name,email,designation,status,created_at,submitted_at,token_expires FROM invitations ORDER BY created_at DESC LIMIT 500");
      return json({ user, members, mailMode: env.MAIL_MODE === "resend" ? "resend" : "preview", serverTime: Date.now() });
    }
    if (path === "admin/invite" && isPost) {
      const user = await actor(request, env, "invite"), b = await body(request);
      const name = text(b.name, "Full name", 120), to = email(b.email), designation = text(b.designation, "Membership title", 100);
      if (!DESIGNATIONS.includes(designation)) fail(400, "Select a membership title from the list.");
      const requestKey = text(b.requestKey, "Request key", 100);
      const existing = await first(env, "SELECT id FROM invitations WHERE request_key=?", `${user.id}:${requestKey}`);
      if (existing) return json({ ok: true, id: existing.id, duplicate: true });
      await rate(env, `invite:${user.id}`, 50, 3600000);
      if (await first(env, "SELECT id FROM invitations WHERE email=? AND status NOT IN ('revoked','declined')", to)) fail(409, "This email already has an active record. Open it to renew or revoke the invitation.");
      const id = uuid(), raw = token(), now = Date.now(), link = `${new URL(request.url).origin}/join#token=${raw}`;
      const mail = await mailStatement(env, { id: `${id}-invitation`, to, kind: "Invitation", invitationId: id, subject: "Your STANAIC onboarding invitation", message: `Hello ${name},\n\nYou are invited to complete your details for the ${designation} role. This personal link works once and expires in 7 days. Complete the form in the same browser after opening it.\n\nThis honorary onboarding carries no joining or recurring fees.`, link });
      await env.DB.batch([stmt(env, "INSERT INTO invitations (id,request_key,name,email,designation,status,token_hash,token_expires,created_by,created_at) VALUES (?,?,?,?,?,'invited',?,?,?,?)", id, `${user.id}:${requestKey}`, name, to, designation, await hash(raw), now + 7 * DAY, user.id, now), mail, event(env, user.id, "invitation.created", id)]);
      await deliver(env, [`${id}-invitation`]); return json({ ok: true, id }, 201);
    }
    if (path === "admin/member" && !isPost) {
      await actor(request, env);
      const row = await first(env, "SELECT * FROM invitations WHERE id=?", new URL(request.url).searchParams.get("id") || "");
      if (!row) fail(404, "Member not found.");
      return json({ ...publicMember(row), createdAt: row.created_at, reviewedAt: row.reviewed_at, tokenUsed: !!row.token_used, expiresAt: row.token_expires });
    }
    if (path === "admin/review" && isPost) {
      const user = await actor(request, env, "review"), b = await body(request);
      if (!["approved", "declined"].includes(b.status)) fail(400, "Select an onboarding decision.");
      const id = text(b.id, "Member ID", 100), feedback = text(b.feedback, "Review note", 1000, false), row = await first(env, "SELECT * FROM invitations WHERE id=?", id);
      if (!row || row.status !== "submitted") fail(409, "Only a submitted profile can be reviewed.");
      const mailId = `${id}-decision`, mail = await mailStatement(env, { id: mailId, to: row.email, kind: "Review update", invitationId: id, subject: "Your STANAIC onboarding review", message: `Hello ${row.name},\n\nYour onboarding record has been marked ${b.status} by the team.${feedback ? `\n\n${feedback}` : ""}\n\nAny formal appointment document will be issued separately.` });
      await env.DB.batch([stmt(env, "UPDATE invitations SET status=?,feedback=?,reviewed_at=? WHERE id=? AND status='submitted'", b.status, feedback, Date.now(), id), mail, event(env, user.id, `onboarding.${b.status}`, id)]);
      await deliver(env, [mailId]); return json({ ok: true });
    }
    if (path === "admin/revoke" && isPost) {
      const user = await actor(request, env, "invite"), b = await body(request), id = text(b.id, "Member ID", 100);
      await env.DB.batch([stmt(env, "UPDATE invitations SET status='revoked' WHERE id=? AND status='invited'", id), event(env, user.id, "invitation.revoked", id)]); return json({ ok: true });
    }
    if (path === "admin/renew" && isPost) {
      const user = await actor(request, env, "invite"), b = await body(request), id = text(b.id, "Member ID", 100);
      await rate(env, `renew:${user.id}`, 30, 3600000);
      const row = await first(env, "SELECT * FROM invitations WHERE id=? AND status='invited'", id);
      if (!row) fail(409, "Only an open invitation can be renewed.");
      const raw = token(), mailId = `${id}-renew-${uuid()}`;
      const mail = await mailStatement(env, { id: mailId, to: row.email, kind: "Renewed invitation", invitationId: id, subject: "Your new STANAIC invitation link", message: `Hello ${row.name},\n\nUse this new personal link to complete your onboarding. It replaces your previous link and expires in 7 days.`, link: `${new URL(request.url).origin}/join#token=${raw}` });
      await env.DB.batch([stmt(env, "UPDATE invitations SET token_hash=?,token_expires=?,token_used=NULL WHERE id=? AND status='invited'", await hash(raw), Date.now() + 7 * DAY, id), stmt(env, "DELETE FROM sessions WHERE invitation_id=?", id), mail, event(env, user.id, "invitation.renewed", id)]);
      await deliver(env, [mailId]); return json({ ok: true });
    }
    if (path === "admin/mail" && !isPost) { await actor(request, env, "mail"); return json({ items: await all(env, "SELECT id,recipient,kind,status,attempts,created_at,error,provider_id,attempted_at FROM outbox ORDER BY created_at DESC LIMIT 200"), mode: env.MAIL_MODE === "resend" ? "resend" : "preview" }); }
    if (path === "admin/mail/preview" && !isPost) {
      await actor(request, env, "mail"); const row = await first(env, "SELECT payload,status FROM outbox WHERE id=?", new URL(request.url).searchParams.get("id") || "");
      if (!row || row.status !== "preview") fail(404, "Only test messages can be opened here."); return json(await unseal(env, row.payload));
    }
    if (path === "admin/mail/retry" && isPost) {
      await actor(request, env, "mail"); const b = await body(request), row = await first(env, "SELECT status,attempted_at FROM outbox WHERE id=?", text(b.id, "Mail ID", 150));
      if (!row || !["queued", "failed", "uncertain"].includes(row.status)) fail(409, "This message cannot be retried.");
      if (row.attempted_at && Date.now() - row.attempted_at > 23 * 3600000) fail(409, "Check the provider log before resending: its duplicate-protection window has expired.");
      await deliver(env, [b.id]); return json({ ok: true });
    }
    if (path === "admin/team" && !isPost) { await actor(request, env, "team"); return json({ staff: await all(env, "SELECT id,email,role,user_id,created_at FROM staff ORDER BY created_at DESC") }); }
    if (path === "admin/team" && isPost) {
      const user = await actor(request, env, "team"), b = await body(request), to = email(b.email);
      if (to === user.email) fail(400, "The owner account is managed in deployment settings.");
      if (!["admin", "maintainer", "viewer"].includes(b.role)) fail(400, "Choose an allowed staff role.");
      await env.DB.batch([stmt(env, "INSERT INTO staff (id,email,role,created_at) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role", uuid(), to, b.role, Date.now()), event(env, user.id, `staff.${b.role}`, to)]); return json({ ok: true });
    }
    if (path === "admin/team/remove" && isPost) {
      const user = await actor(request, env, "team"), b = await body(request);
      await env.DB.batch([stmt(env, "DELETE FROM staff WHERE id=?", text(b.id, "Staff ID", 100)), event(env, user.id, "staff.removed", b.id)]); return json({ ok: true });
    }
    if (path === "admin/audit" && !isPost) { await actor(request, env, "team"); return json({ events: await all(env, "SELECT * FROM audit ORDER BY created_at DESC LIMIT 100") }); }
    fail(404, "Not found.");
  } catch (error) {
    if (!error.status) console.error("Onboarding request failed", error.name);
    return json({ error: error.status ? error.message : "The request could not be completed. Please try again." }, error.status || 500);
  }
}
