# STANAIC institutional platform

[Open the application](https://stanaic-onboarding.vercel.app) · [Operations sandbox](https://stanaic-onboarding.vercel.app/workspace) · [Member onboarding](https://stanaic-onboarding.vercel.app/demo) · [Announcement studio](https://stanaic-onboarding.vercel.app/announcements?demo=1)

An open-source contribution by Rama Chandra M. GitHub hosts the source; Vercel runs the Next.js application and APIs; PostgreSQL/Neon stores live and isolated demonstration records. The official stanaic.org website and partner learn.stanaic.com remain independent.

## Implemented flows

- Institutional public website, source-indexed research/governance library, partner programme links and live released catalogue.
- Single-use member invitations, editable contact email and requested designation, approved-designation administration, consent, profile submission, review and protected test inbox. Membership titles never grant staff permissions.
- Server-owned operational roles, per-record permissions, isolated opaque-cookie demo workspaces, and verified live learner accounts.
- Original course authoring, immutable enrolled versions, entitlement-protected lessons, server grading, independent assessor review, completion-credential registry and revocation. Public holder name is withheld unless the learner opts in.
- Separate order/finance workflow, hosted Stripe Checkout, raw-body signed payment reconciliation, duplicate protection, safe expired-checkout renewal, approved refunds and signed refund confirmation.
- Anonymised text-manuscript submission, reviewer assignment, multiple independent reviews, revisions, editorial decisions, author proof/licence approval, and public released articles.
- Branded 1200×627 PNG member-announcement editor, photo upload, reusable corporate/personal copy, member-specific approval, separately attested publicity consent, public announcement package and LinkedIn Images/Posts API adapter. Stale membership details block publication; duplicate/uncertain requests cannot silently post twice.
- Public-source knowledge guide and optional staff-only, consented LLM assistance through the AI SDK and AI Gateway. No private records are used for training or model context.

## Run and verify

Node.js 24:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

See [local development](docs/LOCAL-DEVELOPMENT.md) for a working synthetic database-backed workspace without external credentials. For live operation, configure `.env.example` through Vercel's server-side environment settings and use a dedicated preview database before testing changes.

Existing demo credentials remain intentionally public and only access isolated onboarding demo tables:

| Demo account | Username | Password |
|---|---|---|
| Administrator | demo-admin | AdminDemo2026! |
| Member | demo-member | MemberDemo2026! |

`/workspace` has a separate isolated server sandbox and role simulator. It never grants live permissions. No real personal information, money or qualifications should be entered or inferred in either sandbox.

## Connections and operational gates

| Capability | Works without external account setup | Live requirement |
|---|---|---|
| Public site, source guide, synthetic workflows | Yes | Existing application/database hosting |
| Member form and staff dashboard | Yes in sandbox | Verified Neon Auth and staff grants, already configured on the existing deployment |
| Onboarding emails | Protected preview inbox | Verified sender and Resend credentials; provider acceptance is not inbox delivery |
| Paid learning and refunds | Isolated simulations; provider adapters tested with mocks | Institutional merchant keys and webhook registration; never mark paid from a browser redirect |
| Credential registry | Sample issue/verify/revoke | Independent server signing key and approved programme policy; HMAC validation is issuer-server verification, not an externally certified signature |
| Journal publication | Complete text workflow in sandbox | Approved licence/quorum; file uploads, archival preservation, DOI/ISSN registration remain outside this initial release |
| LinkedIn images/text | PNG download, copy and approved URL sharing | GuoMing/Page OAuth authorisation, eligible API permissions and verified person mention URN; a share URL cannot auto-attach an image or tag a person |
| LLM generation | Public-source retrieval guide | Explicit enablement, a verified current model ID and gateway authentication/budget; no model training is claimed |

No provider credentials are stored in GitHub. The app fails closed when required connections are unavailable. No real payment, refund, LinkedIn publication or paid model request was performed during package tests.

## Ownership and maintenance

The existing onboarding `invitations` table remains the canonical member source. The operations platform reads approved references; it does not invent live appointments. The deployment owner grants operational assignments separately. Live journal decisions require at least two independent reports (or a higher configured quorum); the author approves proofs before release. Payment does not confer a credential or advisory role.

This initial operational release uses bounded transactional JSONB state with row locking: 1.5 MB per workspace, up to 500 orders and 200 manuscripts, bounded audit and notification history. Normalised archival tables, document uploads, partner-LMS API access and a scheduled notification-delivery worker are future work. In-app notifications are durable records; they are not a claim of external delivery. Keep backups, configure restore tests, assign maintainers and review access before expanding beyond an initial cohort.

## Technical documentation

- [Platform APIs, roles and state transitions](docs/PLATFORM-API.md)
- [Membership corrections](docs/MEMBERSHIP-FIXES.md)
- [Payment setup and reconciliation](docs/PAYMENTS.md)
- [LinkedIn permissions and publication workflow](docs/LINKEDIN.md)
- [Knowledge guide and optional LLM](docs/ASSISTANT.md)
- [Original source audit and proposed architecture](docs/REVIEW-ARCHITECTURE.md)
- [Onboarding operations](docs/OPERATIONS.md)

MIT-licensed code. STANAIC's name, appointments, programme policies and marks remain subject to its authority. No government recognition, accreditation, journal indexing or identifier registration is implied.
