# Institutional platform extension

The `/workspace` application uses the Next.js route `/api/platform/[...path]`, PostgreSQL persistence and server-enforced role policies. It does not store records or score assessments in browser local storage.

## Existing records and boundaries

- `db/platform.sql` is additive; it creates only `stanaic_platform_*` tables.
- Live membership management remains the existing `/admin` onboarding module. Live platform member references are read from approved `invitations` rows. No parallel live appointment list is created by this extension.
- Existing member data-sharing consent does not imply public LinkedIn announcement permission. An explicit public consent field must be recorded before preparing a platform announcement.
- Demo records, cookies, credential registry entries and role simulation are separate from live records. Demo sessions expire after six hours. Demo role selection never creates a real staff account.
- Roles are software permissions, not institutional titles. One operational platform role is assigned per verified identity in this release; the owner retains all administrative permissions. Independent assessment and editorial decisions prohibit author/learner self-review.

## Runtime configuration

The existing `DATABASE_URL`, Neon authentication and `OWNER_EMAIL` settings remain in use. `OWNER_USER_ID` may pin the owner identity. Live verified users default to learner; owner/admin/maintainer/viewer are mapped to their corresponding operational scope. The owner can assign a specific operational role to a verified email; its stable identity is bound at sign-in.

`CREDENTIAL_SIGNING_SECRET` must be a separate, randomly generated server secret before live credential issuance. It signs immutable issuance facts with HMAC-SHA256. The public registry verifies the signature server-side and returns `signatureVerified`. Public holder names are hidden by default; the learner must explicitly opt in through `publicCredentialNameConsent` before issuance. Current revocation/suspension is read from the authoritative registry; status changes do not alter signed issuance facts. This is issuer registry verification, not an externally verifiable public-key credential or accreditation. External Open Badges export is not represented as implemented.

Original introductory learning material is included in the catalogue. It is distinct from partner-owned programmes at `https://learn.stanaic.com/`. This release does not claim private API access to that platform. Paid courses require the separately configured Stripe commerce adapter; the free original course works without payment integration. Course fees use integer minor units with an explicit currency.

## Endpoints

| Endpoint | Request | Result |
|---|---|---|
| `POST /api/platform/demo/start` | `{}` with same-origin JSON | Create/reuse an isolated, server-stored workspace and opaque HttpOnly cookie |
| `GET /api/platform/state?mode=demo` | Demonstration cookie | Role-filtered demo state |
| `GET /api/platform/state` | Verified Neon session | Role-filtered live institution state and own learner records |
| `POST /api/platform/action` | `{mode:'demo'|'live',action,payload}` | Validated state transition, durable audit event and response envelope |
| `GET /api/platform/catalogue` | Public | Published original courses, approved research resources and published article metadata |
| `GET /api/platform/verify/:id` | Public, unguessable credential ID | Minimal credential scope, status and server signature verification; no learner email |

The envelope contains `{mode,role,permissions,state}`. State exposes `courses`, `profile`, `members`, `orders`, `enrolments`, `attempts`, `credentials`, `submissions`, `resources`, `audit`, `outbox` and `settings`. Ownership and module permission filters are applied server-side. Lesson bodies and question options are visible only to active enrolled learners and authorised education staff; the public catalogue exposes metadata only. Answer keys are always removed from the API projection. Reviewer views exclude author identity and unrelated submissions. Author views exclude reviewer identities. Private manuscript versions are not returned through the ordinary state projection.

POST requests require an exact origin match, JSON content and a bounded body. Sessions use hashed opaque tokens, HttpOnly cookies and SameSite=Strict. A production cookie is Secure; loopback development allows HTTP. Workspace changes run under a PostgreSQL row lock and transaction.

## Actions and ownership

- `switchRole {role}` and `resetDemo {}`: isolated demo only.
- `updateProfile {name,bio,linkedinUrl}`: own profile. Verified identity email is not replaced by an editable contact address.
- `createOrder {courseId}`: own order, authoritative price/version. Zero-fee courses activate enrolment immediately.
- `simulatePayment {orderId,eventId}`: demo finance/superadmin only; never accepted live.
- `completeLesson {courseId,lessonId}`: own active enrolment.
- `submitAssessment {courseId,answers:[integer...]}`: server scoring after all lessons. Maximum five attempts; passing attempts require independent review. Answer keys are server-private.
- `approveAssessment {attemptId,feedback}`: assessor; cannot approve their own learner attempt.
- `issueCredential {attemptId}`: registrar; active enrolment, approved passing assessment and learner full name required. Unique per learner/course version.
- `revokeCredential {credentialId,reason}`: registrar; immediately updates public registry.
- `createCourse {title,summary,price,currency,version,published,lessons,questions}`: course administrator. Lessons contain title/body. Questions contain prompt/options/answerIndex. The answerIndex is persisted privately and never returned to a learner.
- `updateCourse {courseId,title,price,published}`: course administrator before any enrolment. Once learners enrol, create a new version instead of changing their learning contract.
- `submitPaper {title,abstract,manuscript,consent:true,declarations}`: own authorship; anonymised manuscript text and declarations.
- `screenPaper {submissionId}` and `assignReviewer {submissionId,reviewerId}`: independent editor.
- `reviewPaper {submissionId,notes,recommendation,noConflict:true}`: assigned reviewer only. Recommendation is accept/revise/reject.
- `decidePaper {submissionId,decision,note}`: independent editor after review. Decision is accepted/revision_requested/rejected.
- `revisePaper {submissionId,manuscript}`: original author after revision request; retains previous version privately.
- `approveProof {submissionId,consent:true,licence}`: original author after acceptance.
- `publishPaper {submissionId}`: independent editor after acceptance and author proof/licence approval.
- `publishResource {title,url,type,summary}`: content editor; validates HTTPS URL.
- `grantRole {email,role}`: live superadmin only; cannot grant owner via public API.
- `requestRefund {orderId,reason}`: own paid, non-zero order.
- `approveRefund`: simulation only in the platform action engine. Live finance uses the Stripe refund route so a state change alone never claims money was refunded.
- `createMember`, `reviewMember`, `approveMember`, `updateMember`: isolated demo only. Live versions direct staff to existing onboarding `/admin`.
- `prepareAnnouncement {memberId}`: authorised staff, approved member, explicit public consent. Returns a draft; does not post externally.

The initial journal implementation supports text manuscripts. The demo uses one assigned review; live editorial decisions require at least two independent reviews and every assigned reviewer must finish. `JOURNAL_MIN_REVIEWS` can raise the quorum. `JOURNAL_PUBLICATION_LICENCE` must contain the committee-approved licence before live author proof approval. A committee-approved review quorum, file-upload handling, preservation, identifiers and production publication policies must be configured before representing it as the journal's official submission system. No ISSN, DOI, indexing or regulatory recognition is inferred.

## Commerce adapter contract

`getPlatformOrder(pool,identity,env,orderId)` validates verified account ownership and returns authoritative minor-unit amount, currency, course title, status and checkout-session reference. `setPlatformCheckoutSession` binds a single provider checkout session under row lock. The separate payments adapter creates hosted checkout and verifies raw webhook signatures.

`applyPaymentEvent` accepts only a paid checkout event, exact order owner/amount/currency and bound checkout session. Its transaction deduplicates provider event IDs and activates one enrolment. A second paid event for an already paid matching order records the event but creates no duplicate receipt or entitlement. Browser return URLs are not payment proof.

`getPlatformRefund` checks live finance permission, a learner's pending request and reconciled Stripe payment. Under lock it records finance approval and the stable `stanaic-refund-<orderId>` request key before any provider call. `setPlatformRefundPending` binds the provider refund ID without declaring success. `applyRefundEvent` requires matching approved refund ID, payment intent, full amount and currency; only a signed succeeded event marks refunded, withdraws entitlement and suspends affected credentials pending registrar review. Failed events retain entitlement. Provider timeouts are retried using the same idempotency key. An early webhook before binding returns an error and relies on provider retry; finance must reconcile unresolved events.

## Operational limits

The initial implementation stores bounded institution state in one transactional JSONB row. This is adequate for an initial pilot, with explicit limits of 500 orders, 200 submissions and 1.5 MB state. It is not a replacement for future normalised/high-volume records, file storage or background processing. Audit and outbox history are bounded in this release. Outbox entries are durable queued application records; this extension does not claim email delivery or run an automatic notification worker.

Tests run against embedded PostgreSQL/PGlite using the actual request handler and SQL. They cover session isolation, verified identity boundaries, role grants, assessment gating, signature verification, revocation propagation, anonymised editorial progression, payment exactness, duplicate events, finance refund reconciliation and cross-site write rejection. Live external integrations require their own configured credentials and authorised account testing.
