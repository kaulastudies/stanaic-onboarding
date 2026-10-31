# STANAIC live workflow audit — 31 October 2026

Target: https://stanaic-onboarding.vercel.app. Baseline production source: `466222c8a6f166012e6d3ad0a59648449555af85`.

These are HTTP API workflow checks against the hosted application, using newly created isolated demonstration sessions and synthetic records. They are separate from browser UI coverage. No real payment, email, LinkedIn post, account role grant, or production member change was triggered. Synthetic records were reset after each scenario; sandbox expiry remains six hours.

## Results

| Evidence ledger | Requests / assertions | Passed | Failed |
|---|---:|---:|---:|
| `audit-workflows.json` | 104 | 104 | 0 |
| `audit-onboarding.json` | 26 | 26 | 0 |
| `audit-platform-options.json` | 24 | 24 | 0 |
| `audit-notifications.json` | 11 | 11 | 0 |
| `audit-reset-attachments.json` | 37 | 36 | 1 |
| Total | 202 | 201 | 1 |

A passing expected denial means the protection behaved correctly, not that the action succeeded. Correctly rejected actions include unauthenticated access, role violations, missing prerequisites, duplicate submissions, reused invitation links, cross-origin mutations, and unauthorised attachment access. Repeated role switches and prerequisite steps are counted as requests; these totals are not counts of unique features.

## Confirmed defect

**Medium — Reset demonstration retains attachment quota.** Upload 30 tiny text attachments to an author submission, reset the isolated workspace, submit a new paper, and upload its first attachment. Expected: reset restores the workspace's attachment capacity. Actual: `413`, “This initial workspace supports 30 attachments totalling 10 MB.” Old attachment rows remain associated with the workspace even though their submissions were reset. This blocks further manuscript attachment work until the six-hour workspace expires. The regression uploaded fewer than 1 KB of anonymous synthetic text in total.

Reproduction: `python scripts/audit-reset-attachments.py`. Evidence: `audit-reset-attachments.json`, test `Attachment capacity should recover after reset`. This report records the baseline failure; a post-fix deployment rerun is required before calling it resolved.

## Exercised workflows

- All 13 demonstration role selector values: super administrator, secretariat administrator, maintainer, course administrator, assessor, registrar, editor, reviewer, finance, content editor, auditor, learner and author. Invalid role rejected. Representative permission denials verified; this is not every role-action pair.
- Learner profile, free enrolment, prerequisite lessons, failed assessment, passing assessment, duplicate passing attempt rejection, independent assessor approval, registrar issuance, public credential verification with identity withheld, duplicate issuance rejection, revocation and reset removing the public registry record.
- Course authoring with a new paid course, pre-enrolment configuration changes, enrolled-course edit protection, pending order, content lock, simulated payment activation, manual invoice reconciliation in the isolated demo, refund request, finance approval and withdrawal of learning entitlement.
- Manuscript submission, private text attachment, duplicate upload idempotency, author list, unassigned reviewer denial, editorial screening, anonymised reviewer list and private download, conflict declaration, revision request, author revision, second screening/review, acceptance, publication blocked until proof approval, author proof/licence consent and isolated publication.
- Additional reviewer assignment and rejection of author-as-reviewer. This does not prove live verified-reviewer account onboarding.
- Membership creation, maintainer review, secretariat approval, designation update, announcement draft preparation and announcement blocked before approval. No external announcement was published.
- Research-resource creation and read-only auditor mutation rejection.
- Original onboarding sandbox: administrator sign-in; dashboard; protected inbox and invitation preview; single-use exchange; profile; required consent; submission; duplicate prevention; review; approved designation update; member status; invitation idempotency; renewal; revocation; restriction to sample email domains; sample staff add/list/remove; reset; invalidated member session and administrator logout.
- Hosted notification worker with a nonempty synthetic receipt: preview captured the item, transport remained `preview`, provider attempts remained zero, and no provider acceptance was claimed. Second processing considered zero items and preserved the preview. Learner processing denied.
- Public catalogue, unauthenticated live/demo state denials and same-origin mutation protection.

## Limits and remaining integrations

Live identity sign-in/OTP, real merchant checkout/webhook/refund/settlement, external email delivery, LinkedIn image publishing/tag resolution, dedicated live credential signing, configured model generation, production reviewer quorum and actual member onboarding were not executed. These require the appropriate connected services, production policies and verified accounts. Their demonstration equivalents must not be represented as proof that those external integrations work.

PDF validation, attachment size ceilings, every malformed payload, concurrency, expiration timing, rate-limit exhaustion, the five-attempt limit and every editorial decline/decision branch were not exhaustively tested live. Existing automated tests provide separate coverage; this document does not substitute source tests for live execution.

The source-guide links using `?tab=roles` and `?tab=payments` were also identified as inconsistent with workspace's `view` parameter and reported to the implementation owner. Browser verification and link/anchor inventory are reported separately.

## Repeatability

Run from the repository root with Python 3 and HTTPS network access:

- `python scripts/audit-workflows.py`
- `python scripts/audit-onboarding.py`
- `python scripts/audit-platform-options.py`
- `python scripts/audit-notification-preview.py`
- `python scripts/audit-reset-attachments.py`

Each script creates its own sandbox and emits a JSON ledger without session cookies or secrets. The HTTP client uses the configured `HTTPS_PROXY` and persistent connections. The reset regression intentionally fills only its own 30-file quota with tiny synthetic text. Do not run these against a different environment without checking its isolation semantics.
