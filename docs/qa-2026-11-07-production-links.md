# STANAIC read-only link audit

Target: https://stanaic-onboarding.vercel.app
Captured: 2026-11-07T08:22:53.830221+00:00

## Coverage

- public_pages: 9
- served_pages: 11
- unique_fragment_targets: 10
- source_anchor_instances: 320
- live_anchor_instances: 339
- app_link_instances: 75
- http_targets: 42
- http_results: {'passed': 42}
- internal_http_results: {'passed': 42}
- fragment_checks: 22
- broken_fragments: 0
- legacy_redirects_passed: 27
- legacy_redirects_total: 27

## HTTP targets

| Result | HTTP | Target |
|---|---:|---|
| passed | 200 | https://stanaic-onboarding.vercel.app/ |
| passed | 200 | https://stanaic-onboarding.vercel.app/_next/static/immutable/chunks/04bsozhjiv9xj.css |
| passed | 200 | https://stanaic-onboarding.vercel.app/_next/static/immutable/chunks/05evy_zsxloid.js |
| passed | 200 | https://stanaic-onboarding.vercel.app/_next/static/immutable/chunks/0c0hxoamwjsbw.js |
| passed | 200 | https://stanaic-onboarding.vercel.app/_next/static/immutable/chunks/1kbt14nefgsiq.js |
| passed | 200 | https://stanaic-onboarding.vercel.app/_next/static/immutable/chunks/2corl6wyj4669.js |
| passed | 200 | https://stanaic-onboarding.vercel.app/_next/static/immutable/chunks/3y4cp6p0bheui.js |
| passed | 200 | https://stanaic-onboarding.vercel.app/_next/static/immutable/chunks/42w0h79y41tha.js |
| passed | 200 | https://stanaic-onboarding.vercel.app/_next/static/immutable/chunks/turbopack-1nbyka7ho7_bp.js |
| passed | 200 | https://stanaic-onboarding.vercel.app/access |
| passed | 200 | https://stanaic-onboarding.vercel.app/admin |
| passed | 200 | https://stanaic-onboarding.vercel.app/announcements |
| passed | 200 | https://stanaic-onboarding.vercel.app/announcements?demo=1 |
| passed | 200 | https://stanaic-onboarding.vercel.app/architecture |
| passed | 200 | https://stanaic-onboarding.vercel.app/assistant |
| passed | 200 | https://stanaic-onboarding.vercel.app/demo |
| passed | 200 | https://stanaic-onboarding.vercel.app/demo/admin |
| passed | 200 | https://stanaic-onboarding.vercel.app/demo/member |
| passed | 200 | https://stanaic-onboarding.vercel.app/favicon.svg |
| passed | 200 | https://stanaic-onboarding.vercel.app/governance |
| passed | 200 | https://stanaic-onboarding.vercel.app/institution |
| passed | 200 | https://stanaic-onboarding.vercel.app/institutional/architecture.md |
| passed | 200 | https://stanaic-onboarding.vercel.app/institutional/assets/extra.css |
| passed | 200 | https://stanaic-onboarding.vercel.app/institutional/assets/public.js |
| passed | 200 | https://stanaic-onboarding.vercel.app/institutional/assets/site.css |
| passed | 200 | https://stanaic-onboarding.vercel.app/join |
| passed | 200 | https://stanaic-onboarding.vercel.app/journal |
| passed | 200 | https://stanaic-onboarding.vercel.app/learning |
| passed | 200 | https://stanaic-onboarding.vercel.app/membership |
| passed | 200 | https://stanaic-onboarding.vercel.app/partnerships |
| passed | 200 | https://stanaic-onboarding.vercel.app/research |
| passed | 200 | https://stanaic-onboarding.vercel.app/review-guide |
| passed | 200 | https://stanaic-onboarding.vercel.app/sign-in |
| passed | 200 | https://stanaic-onboarding.vercel.app/verify |
| passed | 200 | https://stanaic-onboarding.vercel.app/workspace |
| passed | 200 | https://stanaic-onboarding.vercel.app/workspace?mode=demo |
| passed | 200 | https://stanaic-onboarding.vercel.app/workspace?mode=demo&role=superadmin |
| passed | 200 | https://stanaic-onboarding.vercel.app/workspace?mode=demo&view=finance&role=finance |
| passed | 200 | https://stanaic-onboarding.vercel.app/workspace?mode=demo&view=learning&role=learner |
| passed | 200 | https://stanaic-onboarding.vercel.app/workspace?mode=demo&view=membership&role=admin |
| passed | 200 | https://stanaic-onboarding.vercel.app/workspace?mode=demo&view=publishing&role=author |
| passed | 200 | https://stanaic-onboarding.vercel.app/workspace?view=credentials |

## Public controls and options

- /: Open navigation
- /institution: Open navigation
- /research: Open navigation, Search research library, resource-type
  - Options: All resources; White paper; Research; Governance; Announcement
- /journal: Open navigation
- /learning: Open navigation
- /membership: Open navigation
- /governance: Open navigation
- /partnerships: Open navigation
- /architecture: Open navigation, Print / save architecture as PDF
- /access: 
- /review-guide: 

## Source privacy/name scan

Only category, count and source location are recorded. Public chair identity is an intentional public institutional reference; personal-name/email/bank categories require review if present.

- public/institutional/institution.html: public_chair_name (2; lines 1)
- app/announcements/announcements.tsx: public_chair_name (2; lines 35)
- lib/assistant.mjs: public_chair_name (1; lines 10)

## Limits

- A successful GET does not prove a link's business workflow or any button works. Controls/options are inventoried for browser coverage by the UI audit.
- Protected pages may return a sign-in shell with HTTP 200; no authentication was attempted.
- Template/generated record URLs and JavaScript-created content require separate workflow/browser evidence.
- No email, payment, LinkedIn posting, credential issuance, or account change was triggered.
- External timeouts and 502/503/504 responses remain unverified; 401/403/429/999 are access blocks, not proof of broken destinations.
- Source privacy scan is pattern-based and does not establish absence of every possible personal value.

Deployment commit: `28edf347e07f3c13ee02357c32a708cd3cbc1739`. External destinations were intentionally skipped in this final production pass; their earlier observations remain in the baseline report.
