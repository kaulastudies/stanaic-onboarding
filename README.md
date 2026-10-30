# STANAIC onboarding module

[Open the Vercel portal](https://stanaic-onboarding.vercel.app) · [Administrator sign in](https://stanaic-onboarding.vercel.app/sign-in) · [Try the demo](https://stanaic-onboarding.vercel.app/demo)

An open-source onboarding contribution by Rama Chandra, offered in gratitude for STANAIC's support. This module manages invitations, profile submission, team review, and restricted staff access. STANAIC controls the roles, programmes, eligibility, fees, agreements, and appointment decisions.

Application and backend source are in this repository. **Vercel runs the Next.js application and API; Neon stores the records and authenticates staff.** GitHub is the source host, not the runtime database.

## Workflow

1. An approved staff member signs in using an emailed one-time code.
2. An administrator enters the invitee's name, email, and STANAIC-approved role or programme. Previously used titles appear as suggestions.
3. The invitee opens a single-use link and submits their details and data-sharing consent.
4. The database records the submission and prepares a member receipt and administrator notification together in a transaction.
5. The team dashboard updates every eight seconds while visible. An administrator or maintainer reviews the record and prepares a review notification.

The module does not prescribe membership pricing, issue qualifications, collect payments, or sign agreements. An onboarding decision is distinct from STANAIC's formal appointment or certification process.

## Public demo

Open [the demo sign-in page](https://stanaic-onboarding.vercel.app/demo). These credentials are intentionally public and work **only in the isolated demo**:

| Account | Username | Password |
|---|---|---|
| Administrator | `demo-admin` | `AdminDemo2026!` |
| Member | `demo-member` | `MemberDemo2026!` |

1. Sign in as the member and submit the seeded Demo Member form using fictional details.
2. Sign in as the administrator in the **same browser**, open Demo Member, and save a review.
3. Return to the member portal to see the result. Both demo roles can stay signed in across tabs.
4. To try invitations, create a sample member using an `@example.org`, `@example.com`, or `@example.net` address. Open its invitation from the test inbox.

Each browser receives its own database-backed demo workspace. Sessions and access expire after six hours; expired rows are cleaned up on a subsequent demo login. The administrator can reset their sample workspace at any time. Demo cookies are opaque, hashed in separate session tables, HttpOnly, Secure, and scoped to `/api/demo`. All mutations check the request origin. Login attempts and workspace sizes are bounded.

Demo operations never access live member/staff tables, call the email provider, or create real staff accounts. Team & access demonstrates sample permission records; it does not create additional working demo logins. The public credentials do not authorize the live `/api/admin` routes. Use fictional information only. Formal appointment documents and signatures are outside this demo.

## Run locally

Node.js 24 is required.

```bash
npm ci
cp .env.example .env.local
# Fill the values using your own Neon project and auth configuration.
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. Staff use `/sign-in`; invitees use the personal `/join#token=...` link. Never put real invitation links in issues, screenshots, public repositories, or logs.

```bash
npm test
npm run typecheck
npm run build
```

Tests exercise the onboarding handlers, roles, invitation consumption/revocation, consent, transaction rollback, email failure/retry, Postgres SQL, rejection of spoofed identity headers, demo role and workspace isolation, and the complete demo submission/review cycle.

## Deploy to Vercel

1. Import this repository into Vercel as a Next.js project, using Node.js 24, `npm ci`, and `npm run build`.
2. Add a Neon database from Vercel Storage and enable Neon Auth. Connect it to this project. Use a separate database branch for preview deployments.
3. Enable email sign-up/sign-in in Neon Auth. Email OTP is the portal's only exposed sign-in method. Register your deployment origin as a trusted auth domain if it was not added by the integration.
4. Set server environment values from `.env.example`. `DATABASE_URL` and `NEON_AUTH_BASE_URL` come from Neon. Generate independent random 32-byte secrets for `NEON_AUTH_COOKIE_SECRET` and `MAIL_ENCRYPTION_KEY`.
5. Set `OWNER_EMAIL` to the initial administrator's email. The user must verify that email to get owner access. Optionally pin `OWNER_USER_ID` after the first verified sign-in.
6. Deploy. The first API request initializes the idempotent application schema under a database lock. `npm run db:migrate` can also apply it before deployment. Neon manages its own authentication schema.
7. Open `/sign-in`, verify your email, create your own pilot invitation, open it from the test inbox, submit details, and check the dashboard.

Keep `MAIL_MODE=preview` while evaluating the workflow. The test inbox is private to owners and admins and lets them open prepared invitation links. It does **not** send onboarding emails externally. Neon sign-in codes are separate and are delivered by Neon Auth.

To send onboarding emails, configure `RESEND_API_KEY`, a verified `MAIL_FROM` address, and `ADMIN_NOTIFY_EMAIL`, then change `MAIL_MODE=resend` and redeploy. Only newly prepared messages use the new mode. Test one invitation to your own address before general use. A provider acceptance is recorded as **Provider accepted**, not a promise of inbox delivery. See [operations](docs/OPERATIONS.md).

## Access

| Role | Permissions |
|---|---|
| Owner | All portal actions and staff management |
| Admin | Invitations, member details, reviews, email activity |
| Maintainer | Member details and reviews |
| Viewer | Read member details |
| Invitee | Only their own onboarding form and progress |

Owner/admin/maintainer/viewer are software permissions. They are not STANAIC membership designations. Owner access is configured by the deployment owner; public account creation cannot grant it. Staff permissions are checked in the database on every API call.

## Content and ownership

See [content sources and scope](docs/CONTENT.md). This is a contributed module for STANAIC's review, not a substitute for its official website or published business terms. The code does not generalize any individual invitation's concessions to other people.

MIT-licensed application code. STANAIC's name and marks remain with their respective owners.
