# Operations

## Hosting and data

The repository contains frontend, backend, database schema, tests, and deployment instructions. Vercel runs the server. Neon Postgres is persistent storage; neither browser localStorage nor a serverless filesystem holds membership records. The Neon-managed authentication tables are separate from the application tables.

Keep production and preview on distinct Neon branches. Do not add secrets to source control. All credentials belong in Vercel environment settings or an ignored `.env.local` for development. Use the committed lockfile with `npm ci`.

## First owner and staff

Set `OWNER_EMAIL` before inviting anyone. Sign in using its emailed one-time code; the API requires a verified email. Optionally pin `OWNER_USER_ID` from `/api/session` afterward. Only the owner can grant or remove staff roles. Staff revocation takes effect on their next API call even if they still hold a valid authentication session.

Neon provides development authentication email delivery. Configure an organization-controlled sender before a public production rollout, following Neon's current documentation. Do not store or log sign-in codes. The app exposes only OTP sign-in, session lookup, and sign-out routes through its auth proxy; upstream authentication alone never grants application access.

## Invitation and email lifecycle

Invitation tokens contain 256 random bits. Only hashes are stored in invitation records. A link expires after seven days and is consumed atomically once. A fourteen-day HttpOnly member cookie only grants access to that invitation. Renewing an invitation invalidates prior links and sessions; revoking prevents further access.

Prepared email bodies, including invitation links, are AES-GCM encrypted in the outbox. `MAIL_MODE=preview` stores private test messages and never sends onboarding email. Switching to `resend` affects new messages only. Do not expose preview message bodies in public demos.

Configure a Resend sending domain/address, `RESEND_API_KEY`, `MAIL_FROM`, and `ADMIN_NOTIFY_EMAIL`. Retry queued, failed, or uncertain messages from Email activity. Retries reuse the same idempotency key within 23 hours of the first attempt. After that, first inspect the provider log to avoid duplicate delivery. An interrupted attempt may leave a message in `sending`; check the provider log before an operator changes that row to `uncertain` for a controlled retry. There is no automatic retry schedule or delivery webhook in this initial module.

Database submission and notification creation are one transaction. Email provider failures do not lose submitted profiles. The dashboard reports actual local/provider status; `accepted` means the provider accepted the request, not that the recipient read or received it.

## Review and handover

Start with the contributor's own onboarding trial. Do not use another person's details without authorization. STANAIC should confirm its role titles, approved documents, controller contact, retention/deletion policy, and email sender before general use. Nothing here signs an agreement or issues a certificate.

For handover, transfer the repository, Vercel project, and Neon resources to the designated organization's accounts through their normal transfer procedures; then rotate secrets and update `OWNER_EMAIL`. Back up the database and check restoration before handling production records.

## References

- https://neon.com/docs/auth/quick-start/nextjs-api-only
- https://neon.com/docs/auth/guides/plugins/email-otp
- https://resend.com/docs/dashboard/domains/introduction
- https://resend.com/docs/dashboard/emails/idempotency-keys
