# Browser audit — 31 October 2026

All actions used an isolated agent-created browser tab on production, with synthetic data. No existing user tab was edited. This ledger records actual UI observations separately from HTTP API tests.

| Surface | Browser checks | Result |
|---|---|---|
| Public home | Navigation, CTA labels and actual hrefs inspected | Found repeated AAC labels and generic workflow destinations; fixed in this change |
| Research | Each of 5 filter options selected | Counts: All12, White paper5, Research2, Governance3, Announcement2 |
| Research | Nonmatching search | Correct empty-state message |
| Workspace | Learner → superadmin selector | Role and permission-scoped navigation updated |
| Workspace | All10 navigation modules clicked | Correct headings and module controls rendered |
| Programme builder | Expand, add/remove lesson, add/remove question | Returned to3lessons/5questions |
| Assistant | Staff permissions question and cited links | Answer rendered; incorrect tab parameter found and fixed |
| Announcement sample | Name/designation edit, personal destination, regenerate | Canvas label and personal welcome wording updated |
| Announcement sample | Download PNG and copy text | Buttons executed and UI reported success; downloaded file/clipboard contents not independently inspected |
| Announcement sample | Approval and sharing with no canonical member | Correctly disabled |
| Verification | Open blank registry form | Form renders; issue/revoke/status outcomes tested through hosted API |

Browser automation encountered transient navigation/selector timeouts. A failed automation action is not classified as an application defect without reproduction. Responsive navigation, image upload, print dialog, every form validation variant, every role-action permutation and live external-service outcomes are not yet exhaustively browser verified. The live API evidence provides broader workflow coverage but cannot replace browser interaction coverage. Do not label this report “every option passed.”
