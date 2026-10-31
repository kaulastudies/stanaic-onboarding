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
| Verification | Blank form and invalid identifier | Correct Credential not found message; issue/revoke/status outcomes separately tested through hosted API |
| Mobile home |390×844 navigation open/close|aria-expanded and display toggle correctly; no horizontal overflow|
| Clean preview CTA |Click Try author workflow on home|Entered Journal & peer review as Research author|
| Editorial browser journey |Submit synthetic manuscript; editor screening; reviewer recommendation options and review; editor acceptance; author proof; editor publication|Server persisted each step; approval controls appeared only at expected stages|

Browser automation encountered transient navigation/selector timeouts. A failed automation action is not classified as an application defect without reproduction. Image upload, print dialog, every form validation variant, every role-action permutation and live external-service outcomes are not yet exhaustively browser verified. The live API evidence provides broader workflow coverage but cannot replace browser interaction coverage. Do not label this report “every option passed.”
