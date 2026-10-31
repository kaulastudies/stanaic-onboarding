# Payment integration

The package contains a Stripe hosted Checkout adapter and a signature-verified webhook, separate from learning and credential decisions. No card information is collected by this application.

## Working paths

- `GET /api/payments/status`: setup status and missing setting names; never returns values. “Configured” means settings are present, not that the merchant account has been validated.
- `POST /api/payments/checkout` with `{ "orderId": "…" }`: authenticated verified account; the platform reads the authoritative live order and checks record ownership/role. Browser amounts, prices, currencies and paid flags are ignored. The provider session uses a stable order-specific idempotency key. Existing open sessions are reused. To renew an expired session, the server first retrieves it from Stripe and verifies the order, owner, amount, currency and provider mode. Only a provider-confirmed expired session can reserve a new locked generation and idempotency key. Completed sessions wait for signed reconciliation. A prior session cannot settle an order after a replacement is bound.
- `POST /api/payments/webhook`: accepts the provider's original snapshot payload, verifies HMAC-SHA256 signature against the raw bytes and a five-minute past/future tolerance, then interprets relevant events.

Supported settlement events are `checkout.session.completed` and `checkout.session.async_payment_succeeded`. A completed but unpaid session never activates enrolment. The platform transaction must match order, owner, stored checkout session, integer minor-unit amount, currency and payment status; it records the event ID durably and activates the enrolment once. Duplicate events are acknowledged without duplicate access. Events in the wrong test/live mode are rejected.

Returning from Checkout is a navigation event only. The learning application does not treat it as proof of payment. If the webhook arrives before its checkout-session binding commits, it can be retried after the binding exists. Investigate persistent mismatches in provider logs instead of manually setting an order paid.

## Full refund requests

The learner requests a refund on their own paid order. A finance officer or super administrator then explicitly approves it through `POST /api/payments/refund` with the order ID. The backend records the approver, time and stable request key before contacting Stripe. The provider receives the stored payment intent and full stored minor-unit amount with a stable idempotency key. No browser amount or destination is accepted.

The API returns **Awaiting provider confirmation**, even when Stripe immediately reports `succeeded`. Only signed `refund.created`, `refund.updated` or `refund.failed` events reconcile the bound refund reference, payment intent, amount, currency and finance approval. Successful confirmation withdraws the enrolment and flags issued credentials for registrar review; pending and failed refunds do not claim money was returned. `charge.refunded` alone is ignored because it can describe partial refunds. Enable the canonical refund events on the webhook.

Timeouts have uncertain outcomes and must be retried using the same request key or reconciled in Stripe. The full-refund adapter does not support partial refunds or a different refund destination.

## Configure before accepting payments

1. STANAIC selects the legal merchant entity, settlement country, supported currencies, approved prices, tax treatment, terms and refund policy. Do not substitute an individual's payment details or reuse personal accounts from chat history.
2. Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the hosting secret manager. Start with a Stripe sandbox/test account. `APP_ORIGIN` can pin the canonical HTTPS application origin for Checkout return URLs.
3. Optionally set `STRIPE_API_VERSION` to the provider version tested by the integration. Otherwise Stripe uses the merchant account's configured version. Use a matching snapshot webhook version.
4. Register the HTTPS webhook URL above for the two supported checkout events and `refund.created`, `refund.updated`, `refund.failed`. Never paste secrets into code, issue comments, screenshots or frontend variables.
5. Validate a test order using hosted test Checkout, verify successful signed webhook settlement, failed/delayed payment, repeated events and amount/currency mismatches. Confirm receipts and accounting policy separately.
6. Connect live merchant credentials only after the test pilot and institutional approval. No live transactions were made while building or testing this package.

Without those external settings, live Checkout fails closed with a setup message. Isolated platform-demo payments remain simulations and cannot update live orders. This implementation does not charge a card merely because an administrator changes a demo role.

Provider settlement, tax invoices, reconciliation and dispute handling require the named finance operator. A confirmed provider refund is not a promise of when the bank credits the learner's account.

## Validation

`node --test tests/payments.test.mjs` (14 tests) covers original-body signatures, tampering, stale and future events, unpaid-completion gating, authoritative minor-unit construction, provider idempotency keys, anonymous access rejection, missing configuration, and malicious checkout destination rejection. Platform integration tests cover durable order matching/deduplication. Provider calls in these tests are mocked. End-to-end merchant testing remains a setup gate.

Primary references inspected 31 October 2026:
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/checkout/fulfillment

- https://docs.stripe.com/api/refunds/create
- https://docs.stripe.com/refunds

- https://docs.stripe.com/api/checkout/sessions/retrieve
