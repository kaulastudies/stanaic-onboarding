# STANAIC institutional platform — technical architecture
Prepared 31 October 2026 · proposal and interactive prototype · Rama Chandra M

## Decision brief
Build one coherent institutional front door and a permissioned operations workspace. Preserve the existing onboarding application and the partner learning platform; integrate through versioned contracts after access and ownership are confirmed. Start with a modular monolith, a relational database, durable background work and managed infrastructure. Separate software permissions, membership designations and operational assignments.

The redesign prototype is static and uses fictional browser-local records. It demonstrates workflows; it does not implement authentication, real payments, email delivery, secure examinations, digital signatures or production integrations. Neither the official site nor existing onboarding source was modified. The learning partner's proprietary content was not copied.

## 1. Observed baseline and migration inventory
The audit inspected representative pages and navigation, not a complete CMS/database export. Every page, file, attachment and SEO redirect must still be inventoried from the source CMS before migration.

| Source | Observed behaviour | Migration decision |
|---|---|---|
| stanaic.org | Query-string CMS navigation; governance, certification, research, partnerships, news and membership | Preserve original source URL and metadata, create canonical paths and permanent redirects after route validation |
| Membership information / training-agent/59.html | Individual Professional and Institutional membership; charter and review-board process; legacy aiinter.org links | Confirm approved charter, fees, legal identity and ownership of legacy links; no appointment by purchase |
| AI certifications | Enterprise assessment, individual skill tiers/fellowships and authorised training partners | Separate programme types; approve evidence, renewal, appeal and eligibility rules before automation |
| Journal CFP / society-publications/548.html, 25 Oct 2026 | Journal of AI Governance and Assurance; inaugural issue upcoming; double-blind review; CC Attribution stated without a version; templates/submissions requested by email | Preserve correspondence and manuscript history; approve exact licence and editorial policy; online editorial portal is proposed |
| Editorial announcement / official-announcements/537.html, 3 Oct 2026 | Proposed editorial roles differ from later CFP leadership | Secretariat confirms authoritative roster and effective dates; never merge conflicting appointments automatically |
| learn.stanaic.com | AIG $99, AAC $119, EAA $139 observed for India Tier C; version 1.0; completion credentials; AIG shows 8 modules and 80% pass threshold | Retain partner-owned programmes and pricing; use deep links initially, then approved catalogue/enrolment/progress APIs |
| stanaic-onboarding.vercel.app/demo and kaulastudies/stanaic-onboarding | Existing Next.js/Postgres invitation/profile/review/staff module; demo isolated from live data | Preserve as-is; no schema or identity changes without a versioned adapter and regression checks |
| Research library | Computing-power, competency, education transparency and membership white papers; research articles and standards resources | Import original records/files with checksum, copyright permission, taxonomy, author, dates and accessibility metadata |

Visible presentation issues include mixed-language empty states, inconsistent navigation labels, placeholder social links, fragmented identity across IAIC/STANAIC, and inconsistent editorial records. The redesign resolves presentation and information hierarchy. It cannot resolve governance facts without an authorised source.

## 2. Product boundaries
Public: institution, leadership with consent, governance documents, research library, journal issues/articles, programme catalogue, membership/partner information, events, inquiry and credential verification.
Member/learner: own invitation/profile and consent, orders, enrolments, progress, assessment attempts, submissions, invoices and credentials. Public registration never grants staff privileges.
Staff-only: invitation management, appointments, staff access, programme administration, editorial assignments, payment reconciliation, credential issue/revocation, content approvals and operational reporting.
Onboarding management is staff-only; an invitee still needs access to their own single-use invited form. A software permission is never inferred from an advisory or committee title.

## 3. Proposed system topology
Public site + staff/member workspace → application API and policy enforcement → isolated module boundaries → Postgres, private object storage, job queue/outbox → approved external adapters.

Keep independent applications behind explicit adapters:
- Existing onboarding: invitation status and approved member reference, minimal fields only. Its Owner/Admin/Maintainer/Viewer roles remain unchanged. New operational permissions are not added to that database by assumption.
- Existing learning partner: catalogue deep links first. Then agreed SSO, enrolment, progress and completion-evidence contracts if the partner supports them.
- Payment provider: hosted checkout; server verifies signed webhook and amount/currency/order. Merchant setup is separate from website content.
- Publishing: maintain the current email intake during transition. Evaluate PKP OJS with the editorial team for mature editorial workflow; choose one system of record, never competing manuscript queues. Prototype editorial workflow is a design proposal, not an OJS integration.
- Email delivery: transactional provider, verified sending domain, templates and delivery status. No personal mailbox credentials stored in code.
- Credentials: server registry and signed issuance; Open Badges 3.0 compatibility as a later implementation target, subject to specification and conformance review.

Suggested implementation: supported Next.js/TypeScript version selected at implementation, PostgreSQL/Neon consistent with existing module, object storage with short-lived signed URLs, managed durable jobs, error/uptime monitoring and structured audit events. Use separate development/staging/production environments. Pin dependencies and review updates. Start in one region chosen for data-residency obligations; add regions only when demand and policy require them.

## 4. Departments, ownership and roles
These are responsibilities, not a proposal to hire a department for every row. At startup, approved people can hold multiple assignments. Avoid self-review for high-impact actions; use an independent second approver where feasible.

| Department | Software role | Owns | Cannot do by default |
|---|---|---|---|
| Platform stewardship | Super administrator / owner | Staff grants, identity policy, integrations, emergency recovery | Bypass evidence without a recorded emergency process |
| Secretariat & membership | Administrator | Invitations, appointments, member approval, charter records | Change assessment results or accept manuscripts |
| Member operations | Maintainer | Completeness checks, evidence notes and review recommendations | Grant staff access or approve appointments |
| Education operations | Course administrator | Course versions, lessons, prices, cohorts, question-bank policy | Approve own assessment or issue credentials |
| Academic assessment | Instructor / assessor | Applied-work marking, moderation, accommodations, appeals recommendations | Reconcile payments or edit paid status |
| Credential office | Registrar | Eligible issue, renewal, suspension/revocation, registry corrections | Treat purchase as completion |
| Research & publications | Managing editor | Scope, conflict checks, reviewer assignment, decisions, publication/corrections | Allow sponsorship to determine acceptance |
| Peer review | Assigned reviewer | Anonymised assigned manuscript and confidential report | See author identity or unrelated submissions |
| Finance & compliance | Finance officer | Orders, settlement reconciliation, invoices, approved refunds | Edit competencies or issue credentials |
| Communications | Content editor + authorised approver | Drafts, research metadata, news, public claim checks | Publish unverified accreditation/leadership claims |
| Support & quality | Support agent / restricted auditor | Purpose-limited support and read-only oversight | Browse all manuscripts or change outcomes |
| Members & learners | Member / learner | Own data, lessons, orders, assessment and credentials | Create invitations or edit institutional titles |
| Authors | Author | Own submission, revisions, declarations and proofs | Choose editorial outcomes or see reviewer identity |

Production authorisation is permission + resource ownership/assignment + state + environment. Deny by default. Apply policies to every server request and file URL. Staff invitation acceptance is distinct from member onboarding. Require staff MFA, expiring invitations, session rotation, access reviews and immediate revocation. Owner changes and large refunds need a second approver under an approved threshold policy.

## 5. State machines and automation
### Membership
Draft invitation → sent → accepted → profile submitted → maintainer review → secretariat decision → active / rejected / expired. Approved invitation creates no new software permission. Email changes require re-verification and invalidate outstanding links; membership title changes require secretariat approval. Store consent text version and timestamp. Expiring reminders and resends use idempotent jobs; no reminders after withdrawal.
### Learning and payment
Draft order → hosted checkout → verified provider event → paid ledger entry → enrolment activated → lesson evidence → submitted assessment → server-scored knowledge check → assessor moderation where required → eligible for credential. Declined/expired/pending payments cannot unlock paid access. Late or out-of-order events reconcile against provider state. Refunds/chargebacks withdraw entitlement and trigger policy-based credential review; retain evidence, never silently delete history. Course edits create a new immutable version for future cohorts.
### Credentials
Eligibility computed from versioned programme rules → registrar review/authorised automated issue for approved low-risk completion programmes → signed credential + registry record + queued email. Unique (learner, programme version, award type) prevents duplicate issuance. Public verification returns current valid/expired/suspended/revoked status and minimal consented identity. Revocation stores reason privately and public status, issuer and dates. Expiry is policy-specific; no invented validity period. Certificates of Completion are separate from professional certification, fellowship and enterprise assurance opinions.
### Journal
Author account → metadata/declarations + identity file separated from anonymised manuscript → scope/plagiarism/ethics screening → conflict-aware reviewer invitations → double-blind review → revise/reject/accept decision → author proof approval + exact licence + accessibility checks → issue scheduling/publication → corrections/retraction if required. Approve reviewer quorum and timelines as editorial policy. Reminders and assignment deadlines automate; editorial judgement does not. Revisions retain immutable versions. Sponsored content is labelled and separated from peer review. DOI/ISSN/indexing are not claimed until actually registered and approved.
### Content, events and partnerships
Draft → factual/licence review → authorised publication → versioned revision/archive. Conference/event RSVP can reuse identity and notification services; paid events reuse finance without granting appointments. Partnership intake → due diligence → agreement approval → authorised status with dates and renewal evidence. Enterprise assurance uses separate case management and technical evidence, never the course completion engine.

## 6. Data model and integration contracts
Logical modules and principal entities:
- identity: User, ExternalIdentity, StaffGrant, Assignment, Session, Consent, Organisation;
- membership: Invitation, MemberProfile, Appointment, Review, Programme;
- education: Course, CourseVersion, LessonVersion, Enrolment, Progress, QuestionVersion, Attempt, Evidence, AssessmentDecision;
- finance: Order, OrderItem, PaymentEvent, Transaction, RefundRequest, Invoice, Reconciliation;
- publishing: Journal, Issue, Submission, ManuscriptVersion, IdentityFile, ConflictDeclaration, ReviewerAssignment, Review, EditorialDecision, ProofApproval, Publication, Correction;
- credentials: Credential, EligibilityEvidence, IssuanceEvent, StatusEvent, KeyReference;
- content: Resource, AuthorReference, Taxonomy, SourceURL, Asset, ContentVersion, Redirect;
- platform: AuditEvent, OutboxEvent, Job, DeliveryAttempt, IntegrationCursor.

Use UUIDs, UTC timestamps, foreign keys, tenant/organisation scope only where required, immutable state histories and transactional state transitions. Money is integer minor units + explicit ISO currency. Private manuscript/identity objects have separate access policies. Secrets live in the managed secret store; reference signing keys by ID, never store private keys in the database. Files require MIME/content validation, malware scanning, limits and safe download headers.

Proposed APIs (contracts to negotiate, not endpoints claimed to exist):
- POST /api/invitations; POST /api/invitations/:token/accept; POST /api/member-reviews; POST /api/members/:id/decision;
- GET /api/catalogue; POST /api/orders; POST /api/webhooks/payments/:provider;
- POST /api/enrolments; POST /api/attempts; POST /api/assessments/:id/decision;
- POST /api/credentials; GET /api/verify/:opaqueId; POST /api/credentials/:id/status;
- POST /api/submissions; POST /api/submissions/:id/versions; POST /api/reviews; POST /api/editorial-decisions;
- POST /api/content/:id/approval; GET /api/audit (restricted).

Internal events: member.approved.v1, payment.confirmed.v1, enrolment.activated.v1, assessment.approved.v1, credential.issued.v1, credential.revoked.v1, submission.review_requested.v1, publication.released.v1. Envelope: event_id, event_type, schema_version, occurred_at, actor_id, aggregate_id, correlation_id, data. No secrets or manuscript bodies in events. Use idempotency keys, durable inbox/outbox, retry with backoff and dead-letter review. One DB transaction changes state and writes its outbox event; a worker delivers side effects at least once. Consumers deduplicate; never promise exactly-once network delivery.

## 7. Security, reliability and operations
Server-side RBAC/record policies, staff MFA, CSRF/origin checks, rate limiting, secure HTTP-only cookies, input validation, signed short-lived file links and least-privilege service identities. Assessment answers remain server-side; randomised versioned banks, attempt limits and moderation policy prevent browser scoring in production. Never log secrets or sensitive manuscript content. Audit actor, role, resource, transition, timestamp and correlation ID; production audit records cannot be edited by ordinary admins.

Daily managed backups + point-in-time recovery where supported; separate object versioning and restore drills. Proposed launch targets, not current guarantees: RPO 24h or better, RTO 8h, 99.5% monthly availability. Validate these against budget and provider plan. Monitor failed webhooks, outbox age, delivery failures, assessment errors, credential signing, storage, spend and suspicious access. Named operational owner handles alerts; registrar/editor/finance owns domain exceptions. Document secret rotation, staff departure, outage and signing-key compromise runbooks. Define retention, access/deletion requests, jurisdiction, privacy notices and research consent before production; approved research/audit retention may constrain deletion and needs policy review.

## 8. Launch phases and acceptance gates
1. Foundation: confirm identity/brand/roster and content rights, crawl/export full CMS and assets, approve information architecture, sitemap and redirects, accessibility review. Publish public redesign only after review. Retain official service URLs.
2. Integration: get existing onboarding and learning technical contracts, stage adapters, validate identity mapping and consent. No forced rewrite or direct writes to partner tables. Keep current flows available during pilot.
3. Learning commerce: merchant readiness, hosted checkout, signed webhooks, reconciliation, server assessments, assessor workflow, credential policy and verification. End-to-end pilot with sandbox funds, then a small approved production cohort.
4. Publishing: approve editorial governance, evaluate OJS vs owned workflow, import consented records and email history, secure file handling, revision/review/proof lifecycle, preservation policy and correction process.
5. Growth: optional SSO, corporate cohorts, analytics with consent, Open Badges export, events, multilingual publishing and partner reporting. Add services only for measured scaling/isolation needs.

Operational cost should be split into hosting/database/storage/email/monitoring, payment-provider fees, identity/signing services, and ongoing maintenance. Exact costs require traffic/storage estimates and merchant/jurisdiction choices. Prefer existing infrastructure and managed entry tiers, but include restore testing, security updates and support in the operating plan. No recurring cost estimate or delivery date is implied by this prototype.

Acceptance: member cannot read another profile; maintainer cannot grant access; staff removal ends sessions; reviewer cannot see author identity; duplicate/out-of-order webhook cannot grant duplicate access; amount/currency mismatch rejected; payment alone cannot issue a credential; question scoring is server-side; certificate revocation immediately visible; manuscript cannot publish without independent reviews, acceptance and proof/licence approval; old URLs redirect with no lost files; backups restore successfully; mobile/keyboard/screen-reader flows pass; partner integrations and current onboarding regressions verified. Demo tests cover selected state/access/idempotency rules, not these complete production guarantees.

## 9. Open decisions for the committee
Confirm legal/brand identity and signatory, leadership roster, membership charter and designation policy, programme ownership and integration access, exact course completion/certification rules, merchant/settlement country/currencies/tax/refunds, editorial quorum and exact CC licence, journal ownership and identifier plans, data residency/retention, support owners, launch budget and maintenance responsibility. These are approval gates for deployment of operational services, not blockers for reviewing this prototype.

## 10. Sources
Primary pages inspected 31 October 2026:
- https://stanaic.org/
- https://stanaic.org/?ai-certifications/
- https://stanaic.org/?training-agent/59.html
- https://stanaic.org/?society-publications/548.html
- https://stanaic.org/?official-announcements/537.html
- https://stanaic.org/?research-reports/
- https://learn.stanaic.com/
- https://stanaic-onboarding.vercel.app/demo
- https://github.com/kaulastudies/stanaic-onboarding (README and docs/CONTENT.md)
- https://github.com/pkp/pkp-docs/blob/main/learning-ojs/editorial-workflow/en/review.md — PKP primary documentation for editorial review workflows.
- https://docs.stripe.com/webhooks — reference for signature-verified webhook processing; provider choice remains open.
- https://www.1edtech.org/standards/open-badges — reference for interoperable credential format; compatibility is proposed, not implemented.

No accreditation, governmental recognition, journal indexing, identifier registration or production payment capability has been independently verified in this audit. Claims are not promoted into verified institutional facts.
