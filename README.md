# STANAIC member onboarding

A working membership onboarding application: an administrator creates an invitation, a member completes their own form, and the team reviews the submission in a shared dashboard.

This is a community-built pilot, not an official certificate issuer or a legal-signature service. No personal records, production secrets, agreement PDFs, or membership decisions are included in this repository.

## The first release

1. **Administrator signs in.** The owner explicitly grants Admin, Maintainer, or Viewer access.
2. **Invite a member.** Enter a name, email, and membership title. The application creates a personal link valid for seven days.
3. **Member completes their details.** The link opens a dedicated form. The member supplies their name, country, research interests, and optional affiliation, introduction, and portfolio URL.
4. **Submission is saved.** A receipt and an administrator notification are written to the outbox in the same transaction as the submission.
5. **The team reviews.** The dashboard refreshes every eight seconds while visible. An authorised reviewer approves or declines onboarding and prepares a member update.

Start the pilot with the owner's own onboarding. Keep formal agreements, e-signatures, certificates, public directories, and AI assistance for a later release.

## Run locally

Use **Node.js 24 LTS**, Git, and pnpm 11.25.0. The lockfile is committed.

```sh
git clone https://github.com/kaulastudies/stanaic-onboarding.git
cd stanaic-onboarding
corepack pnpm install --frozen-lockfile
npm run setup:local
npm run build
npm run db:migrate:local
npm run dev
```

Open the loopback URL printed by the server (usually `http://localhost:5173`). Choose Administrator sign in, then Sign in with ChatGPT. The portable development adapter signs in as the synthetic `seedy@sites.test` identity on loopback only. It is not included in production builds. If Corepack is unavailable, install the pinned pnpm version using your normal Node package manager.

`setup:local` creates an ignored `.dev.vars` file with a random mail-encryption key and test-only identity. It preserves existing settings. Database migrations run independently of application requests and are tracked by Wrangler. Do not commit `.dev.vars`, local database state, or generated builds.

### Try the complete cycle without sending email

1. Select Invite member and use your own name and email, or synthetic test data.
2. Open Test inbox, open the invitation, and select Open member invitation.
3. Complete the member form and submit it.
4. Return to the admin tab. The record appears under To review within eight seconds (or click Refresh).
5. Open the record and save a review. The member tab reflects the decision; the test inbox contains the receipt, administrator notification, and review update.

All application records are stored in SQLite/D1, not browser local storage. Restarting the application preserves them. The single-use invitation becomes an HttpOnly member-session cookie; use the same browser to finish. Administrators can issue a replacement link, invalidating the previous link and session.

## Staff permissions

| Access role | View member records | Invite / renew / revoke | Review | Email activity / retries | Manage staff |
|---|---|---|---|---|---|
| Owner | Yes | Yes | Yes | Yes | Yes |
| Admin | Yes | Yes | Yes | Yes | No |
| Maintainer | Yes | No | Yes | No | No |
| Viewer | Yes | No | No | No | No |
| Member | Own record only | No | No | No | No |

Membership titles such as Research Fellow are separate from staff access roles. New staff emails bind to the verified account's stable user ID on first sign-in. Removing a staff entry revokes subsequent API access. Adding a colleague does not automatically send a staff email; share the admin URL with them.

## Email configuration

The default `MAIL_MODE=preview` captures messages in a protected test inbox. **No external messages are sent in this mode.** Test links are accessible only to the owner and administrators.

To enable real sending, configure these production runtime secrets/settings and redeploy:

| Setting | Purpose |
|---|---|
| `OWNER_USER_ID` | Owner's stable identity ID for this particular Site |
| `OWNER_EMAIL` | Owner contact / default notification recipient |
| `ADMIN_NOTIFY_EMAIL` | Optional alternative address for submission notifications |
| `MAIL_ENCRYPTION_KEY` | Base64-encoded 32-byte random key; retain it to decrypt existing messages |
| `MAIL_MODE` | `preview` or `resend` |
| `RESEND_API_KEY` | Restricted sending key from the email provider |
| `MAIL_FROM` | Sender address on your verified sending domain |

Generate the encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Enter production values in the hosting platform's secret manager, never source code. Existing preview messages are not automatically sent when changing modes; create a new invitation or replacement link deliberately.

The Resend adapter records queued, sending, provider-accepted, failed, and uncertain states. Provider acceptance is not a delivery receipt. It does not imply the recipient received or read the message. Check provider delivery/bounce logs when investigating delivery.

Application changes and outbox rows are committed together. Sends use a stable idempotency key. Failed/uncertain sends can be retried by an administrator within 23 hours of the first attempt; older ambiguous attempts require provider-log reconciliation before another message is issued. A worker interruption after claiming a send can leave it in Sending; see the operations guide before recovery. There is no scheduled retry service in this first release.

Primary references: [Resend sending domains](https://resend.com/docs/dashboard/domains/introduction), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [D1 transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Deployment and identity boundary

The production integration targets **ChatGPT Sites** using Vinext, Cloudflare Workers, and a `DB` D1 binding. Create/open a Site with the Sites workflow, bind its actual project ID in `.openai/hosting.json`, set `d1` to `DB`, configure runtime values, build, push the exact source, and publish. Production publication applies the committed Drizzle migrations.

The Sites dispatcher supplies trusted `oai-authenticated-user-id` and `oai-authenticated-user-email` headers. The application performs its own server-side staff allowlist and permission checks. The owner ID is specific to a Site; use the ID supplied for the intended owner on that Site.

**Do not deploy this Worker directly to a public workers.dev origin or another untrusted proxy using header authentication.** Such a deployment needs a real authentication adapter that verifies signed sessions and strips client-supplied identity headers. The local mock is solely for loopback development.

A private Site's outer access policy also applies to invitees. The current pilot retains its owner's private access. Before inviting external members, the owner must deliberately configure the Site audience for those users or allow the public entry page; the application's staff and member-session checks remain required. A public GitHub repository does not make the live membership database public.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

The tests use the production request handlers and SQL against transactional SQLite. They cover the complete cycle, role restrictions, single-use and expired links, member isolation, revocation, consent, unsafe URLs, invitation idempotency, email failure/retry, and transaction rollback. Live email delivery must be verified separately with a configured sender.

## Files

- `app/portal.tsx`: landing page, admin dashboard, and member form.
- `lib/onboarding.mjs`: authentication, permissions, validation, invitations, encrypted outbox, and review handlers.
- `app/api/[...path]/route.ts`: server routes.
- `db/schema.ts` and `drizzle/`: schema and migrations.
- `tests/onboarding.test.mjs`: integration and access-boundary tests.
- `docs/OPERATIONS.md`: pilot checklist, maintenance, and recovery.
- `scripts/`: local setup and retained Sites/Vinext tooling.

## Next releases

Agreement versioning and legal review; open-source e-signature integration with explicit human consent; certificate issuance; directory publication with opt-in consent; pagination beyond the current 500-record dashboard; configurable notification recipients; scheduled retries and bounce webhooks; optional AI summaries with data-sharing controls. None of these are represented as implemented.

MIT-licensed application code. STANAIC's name and marks are not licensed by this project. Vendored tooling retains its own notices, including `scripts/vite/sites-vite-plugin.LICENSE`.
