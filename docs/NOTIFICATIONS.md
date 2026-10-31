# Operational notification delivery

The platform's in-app notification queue now has a durable delivery processor. It is separate from the original onboarding module's encrypted outbox. The worker does not modify onboarding invitations or deliver their old messages.

## UI and API

`GET /api/platform/notifications/status?mode=live` returns permission-scoped queue and delivery statuses. Administrators and the owner see the workspace queue; other verified identities see only their own notification records. Recipient addresses are returned only to administrators. A learner cannot dispatch messages.

`POST /api/platform/notifications/process?mode=live` accepts same-origin JSON `{ "limit": 10 }`, with a batch size of 1–20. Only verified platform administrators or the owner can run it. The processor stops claiming additional messages after roughly 35 seconds so bounded provider requests can finish within the route's execution window. The UI can run another batch to continue. No browser-supplied recipient or message body is used.

Use `mode=demo` in the query or JSON body to process only the caller's isolated demonstration workspace. Its opaque cookie remains scoped to `/api/platform`. Demo processing always captures preview records and never calls the email provider, even if live sending credentials are configured.

`GET /api/platform/notifications/cron` is an optional scheduler callback. It requires an exact Bearer token matching the independently configured `NOTIFICATION_CRON_SECRET`, at least 32 characters. It does not fall back to the credential-signing, authentication, mail-encryption or provider keys. No cron schedule is installed by this implementation, and no secret or sending mode was changed. An authorised operator must explicitly configure the secret and scheduler before using unattended delivery.

## Configuration

- `MAIL_MODE=preview` (the default, and forced for demonstrations): records protected previews. No external email is sent.
- `MAIL_MODE=resend`: external sending requires `RESEND_API_KEY` and a `MAIL_FROM` address on the institution's verified sender domain. Missing values fail closed before a send is claimed.
- `NOTIFICATION_CRON_SECRET`: optional dedicated scheduler authorisation; no value is generated or stored by this code.

A preview record is never automatically promoted into an external message when the sending configuration changes. Issue a new intentional notification if the institution wants a new external message. Notifications without a verified profile email are marked `needs_recipient`; an editable onboarding contact email cannot redirect delivery.

## Persistence and retries

An additive `stanaic_notification_deliveries` table stores one immutable provider payload for each `(workspace_id, notification_id)`. The recipient is taken from the platform profile's server-verified identity email; the independently editable contact email is ignored. Sender, subject and body are snapshotted on first preparation. A unique, deterministic idempotency key is derived from the workspace and source notification ID.

A transaction locks the workspace and delivery row, claims a two-minute lease and commits before calling the provider. The network request runs outside the transaction. A second worker skips an active lease. A crash or delayed response can be retried after lease expiry with the same request payload and idempotency key. Lease tokens prevent an old worker from overwriting a newer claim.

Provider outcomes are recorded as:

| Status | Meaning |
|---|---|
| `queued` | Ready for a permitted delivery attempt |
| `sending` | A worker holds a current lease |
| `preview` | Protected capture only; no provider request |
| `accepted` | Provider returned its message ID; this is not proof of inbox delivery or reading |
| `failed` | Provider rejected the request; a permitted retry retains the original request/key |
| `uncertain` | Network response or provider result was ambiguous |
| `needs_recipient` | No verified profile email is available; no send was attempted |
| `needs_reconciliation` | Original attempt is at least 23 hours old; automatic resending is blocked |

Resend retains idempotency keys for 24 hours. The application uses a 23-hour retry window to leave a margin. After that, staff must inspect the provider's records before deciding whether a new notification is needed. Do not clear the delivery table or change notification IDs to bypass an uncertain send. Terminal accepted and preview records remain deduplicated even when the source workspace queue has a stale status.

Delivery state updates also update the in-app queue and audit trail. Tables are scoped to the existing workspace; deleting an expired demo workspace cascades its delivery rows. Live delivery rows retain the deduplication history independently of the bounded in-app queue. An initial deployment with no provider credentials can exercise the complete preview flow immediately.

## Validation and remaining setup

Tests use fresh embedded PostgreSQL and mocked provider requests. They cover verified/role access, own-record privacy, same-origin enforcement, preview isolation, verified recipient binding, accepted-send deduplication, missing-credential failure, immutable retry payloads, expired ambiguity, competing leases and dedicated scheduler authorisation. No real email was sent during development.

External delivery, bounce handling, institution-specific templates and a scheduled production run require approved sender/account configuration and operational ownership. This worker reports provider acceptance only; bounce/delivery webhooks are not yet integrated.

Primary provider references:
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/dashboard/emails/idempotency-keys
