# Browser review - 7 November 2026

The review used agent-created browser tabs. Existing user drafting tabs were not claimed. No message was sent to LinkedIn.

## Verified observations

- The four-person STANAIC group contains the 1 November report that the member invitation email could not be entered; the preceding request also concerned member email and role assignment. This report drove the access changes. Private conversation content and contact/payment details are not part of the release evidence.
- Preview access page displayed four explicit paths: no-login sandbox, sample invitation email, public demo administrator and verified live email/OTP. The matching review guide is linked.
- New demo entry accepted an editable sample invitation email. An unknown example.org address produced the scoped no-active-invitation error.
- member@example.org opened the member form without OTP. The original invitation appeared as a reference; contact email and requested designation were editable.
- The synthetic contact email and requested role were submitted and appeared in the member summary. The original invitation address and existing approved designation stayed distinct.
- One-click administrator entry opened the same sandbox. The member record showed the supplied contact email/requested designation, and the approved designation could be edited through the administrator form.

API request ledgers and link inventory are separate evidence. Real sign-in/OTP delivery, payments, email, LinkedIn posting and model inference were not performed. Further UI checks are recorded in the final release note.

- Administrator review saved the approved designation and decision. Returning to the member portal showed approved status, original invitation email, edited contact email, requested designation and the distinct administrator-approved designation.
- At 390x844, the new access page rendered without horizontal overflow; the temporary viewport was reset.

- Clean preview journal journey submitted a synthetic manuscript, screened/assigned a reviewer, recorded an independent review and editorial acceptance. The author saw the exact demo licence; the required unchecked consent blocked submission until checked. The author then approved the displayed licence.

- After author proof approval, the independent editor published the synthetic article successfully.
- The sandbox member review/approval journey opened the welcome studio with the approved fictional member prefilled. The studio explicitly remained export-only and public-package approval was disabled.

- A final visual review caught missing portal-specific layout styles in the served global CSS despite current source rules and a successful build. A dedicated root stylesheet was added in the styling follow-up; final computed-style and screenshot checks must verify the deployed result. The earlier mobile overflow check alone did not establish correct styling.

- The first style-only preview and its one redeploy failed before any build log with Vercel Resource provisioning failed. No source/build failure was indicated. Reusing the existing review branch avoids requesting another branch-specific resource environment; the final result is recorded below.

- Final production commit a57fff941601abd4a11824f1da183edd1fc964f9: desktop access grid is two columns (547px each); at 390x844 it is one column (335.2px). Both have no horizontal overflow. Vercel marks the production deployment READY.
