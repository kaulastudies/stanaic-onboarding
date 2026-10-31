# STANAIC live audit — 31 October 2026

Production: https://stanaic-onboarding.vercel.app/ . Tested application commit: `79f0d51822354b81f4150ce7b3915b52cb9e4c06`. Release: [PR5](https://github.com/kaulastudies/stanaic-onboarding/pull/5). The official stanaic.org domain was not changed.

## Clean URLs are deployed

Public pages use `/`, `/institution`, `/research`, `/journal`, `/learning`, `/membership`, `/governance`, `/partnerships` and `/architecture`. No HTML suffix appears in their navigation. All27 legacy forms redirect permanently with308, preserving query strings. Original external source URLs remain unchanged. File downloads keep their legitimate file extensions.

## Defects found and corrected

| ID | Severity | Reproduction / original behavior | Correction and verification |
|---|---|---|---|
|B01|Medium|Fill30 attachment slots, reset sandbox, create manuscript, upload:413 despite reset|Reset removes only its own private files transactionally. Regression37/37 passed in preview and production; another workspace's files preserved by automated test.|
|B02|Medium|Approved sandbox member's welcome button passed mode=demo; studio queried staff-only live records|Explicit fictional/export-only studio link uses demo=1. It no longer claims to transfer a canonical live member.|
|B03|Medium|Author, learning and staff onboarding CTAs all opened generic overview|Module-specific view plus isolated demo role; author CTA browser verified to open author publishing. Live roles stay server-controlled.|
|B04|Low|Every AIG/AAC/EAA card said Try AAC learning pathway, but demo contains a different original course|Cards now say Try sample learning workflow; original partner links retained.|
|B05|Low|Journal architecture link used #publishing, which did not exist|Points to #flows; all10 same-site fragments exist.|
|B06|Low|Assistant staff/payment citations used tab=roles/payments, ignored by workspace|Use view=roles/finance.|

The clean URL change also updates root-relative assets, internal application links and dynamic journal/course catalogue pathname detection. Switching workspace modules returns the viewport to the top.

## Evidence and coverage

| Check | Result | Evidence |
|---|---|---|
|Production canonical pages and legacy redirects|36/36 passed:9pages200,27legacy308|[Route ledger](audit-clean-routes-production.json)|
|Public/source link inventory|319anchor instances,27HTML asset references,46literal app links;69unique HTTP targets|[Link report](audit-links-postfix.md)|
|Internal destination availability|29/29 passed;10/10 fragments exist|[Link evidence](audit-links-postfix.json)|
|Baseline hosted APIs|202requests/assertions:201pass,1reproduced reset bug|[Workflow report](audit-workflows.md)|
|Post-fix hosted preview APIs|141/141 passed, including reset regression|[Post-fix workflow ledger](audit-workflows-postfix.json)|
|Final production reset regression|37/37 passed|[Production ledger](audit-reset-attachments-production.json)|
|Automated tests|63/63 passed; typecheck and production build passed locally and GitHub Actions|[Release checks](https://github.com/kaulastudies/stanaic-onboarding/actions/runs/41224552603)|
|Browser UI|Research filters/search,10workspace modules, builder add/remove, announcements edit/regenerate/download/copy, source assistant, invalid verification, mobile menu, author/editor/reviewer journey|[Browser ledger](audit-browser.md)|

Request totals include repeated setup and expected-denial assertions. They are not unique feature counts. HTTP availability does not prove that every button or authenticated workflow works. Browser coverage and API coverage are separate.

## Remaining findings and limits

- **Proof approval UX, source-reviewed:** the author button submits consent=true without displaying the configured publication licence. Live backend requires a configured licence but the current author UI does not present those terms before approval. The synthetic proof journey worked; real licence acceptance needs a visible terms/confirmation step before production editorial use.
- LinkedIn returned999 automated-access denial.17 official STANAIC source destinations timed out with504 after one retry in the later pass, although those destinations had succeeded in the baseline. They remain unverified, not established broken links.10 Google Fonts binary requests timed out; font CSS succeeded and fallback fonts remain available.
- Real sign-in/OTP, merchant charges/webhooks/refunds, external email delivery, LinkedIn posting/image/tagging, live signed credentials and model generation were not executed. These require the relevant verified accounts, service configuration and production policies. Public source-guide mode works; model mode was visibly disabled.
- Browser image upload, print/save dialog, every input-validation combination, all role-action permutations, concurrency, expiry timing and every editorial decision branch were not exhaustively exercised. File-size/content rejection and other controls have separate automated coverage. This is a substantial live audit with an explicit coverage ledger, not a claim that every possible outcome passed.
- One separate preview redirect script was interrupted by network-approval cancellation and recorded as blocked. The independent production36-case route run completed successfully.

All API writes used isolated synthetic workspaces. No real charges, emails, institutional announcements or member-role grants were made. The browser audit used its own created tab and did not edit existing user tabs. API scenarios were reset after testing; browser-only synthetic records expire with their six-hour sandbox.
