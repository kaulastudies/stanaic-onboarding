# Pilot operations

## Owner's first onboarding

Use the owner's real name and email for the first invitation only after signing into the private pilot. The code contains no seeded personal profile. In test mode, open the invitation through Test inbox; complete your own information and leave the record at Ready for review for the designated STANAIC reviewer. Do not approve your own formal appointment by treating a test as an official decision.

## Before external invitations

- Verify owner sign-in and the trusted hosting authentication boundary.
- Set the intended Site audience. Private owner-only access blocks other people before the application loads.
- Configure a verified sender, restricted provider key, and notification recipient. Send one test to an address you control and verify receipt and provider logs.
- Add staff deliberately. Team access changes take effect on the next request; formal membership titles grant no staff access.
- Agree a retention period, privacy contact, and backup/recovery responsibilities with the organisation. Do not collect government identifiers, financial records, or signatures through this basic form.

## Daily review

Use To review to open submissions. Inspect the details, record the decision and optional note, and check Email activity. An approved onboarding row is not a signed appointment agreement. Formal documentation is a separate process.

## Common recovery

| Situation | Action |
|---|---|
| Link expired, used elsewhere, or member lost browser session | Open the invited record and create a replacement link. Previous link and sessions become invalid. |
| Wrong recipient | Revoke the still-pending invitation, then create a new invitation for the correct address. |
| Email configuration missing | Fix runtime secrets, redeploy, and retry eligible failed messages. |
| Uncertain provider response | Check provider logs. Retry within the UI's 23-hour window with the original idempotency key. |
| Sending stuck after worker interruption | Check provider logs using the outbox ID/idempotency key. An operator may change the row to uncertain in the database after verifying no worker is still sending; retry within 23 hours. Older rows require manual reconciliation. Do not blindly resend. |
| Member asks to correct a submitted profile | Contact the onboarding team. Self-editing after submission is deferred; do not invent replacement data. |
| Data export or deletion request | Authorised operator handles it using the D1 console, following agreed retention policy and foreign-key ordering. No public export/delete endpoint exists. |

The audit table records staff and onboarding actions. Protect database backups and the encryption key separately. Losing the key makes existing outbox payloads unreadable; replacing it without a migration is not key rotation.

## Limits of this release

Dashboard lists the most recent 500 records and email activity the latest 200 messages. Counts describe the loaded dashboard records. No files, digital signatures, payments, automated certificates, AI processing, email open tracking, scheduled retries, or delivery webhooks are included. Browser sessions expire after 14 days. Link tokens expire after seven days and can be redeemed once.

## Validation completed

Run `npm test` for executable evidence; tests use synthetic identities and addresses. Browser checks should cover desktop and narrow screens, keyboard operation, an invitation and member submission, dashboard refresh, and review status. Do not claim live external delivery until a configured provider test has reached its recipient.
