# STANAIC workflow demo - feedback package

Review entry: https://stanaic-onboarding.vercel.app/
Operational sandbox: https://stanaic-onboarding.vercel.app/workspace?mode=demo
Existing onboarding demo: https://stanaic-onboarding.vercel.app/demo
Welcome export studio: https://stanaic-onboarding.vercel.app/announcements?demo=1

This is a workflow demonstration for feedback. Use fictional information. Sandbox payments, notifications, appointments and completion records have no institutional effect. Further automation and changes to the process can follow the committee's feedback. Production services require approved policies, account permissions and configuration.

The public application no longer displays personal contributor attribution. The repository host/account and existing Git history still identify source ownership; this change does not rewrite history or change external original-site records.

## Attachments

- public/review/STANAIC_Workflow_Demo_Review_Brief.pdf - features, review tour, module handoffs and feedback questions.
- public/review/STANAIC_Technical_Architecture_and_Demo_Access.pdf - architecture, 13 roles, demo access and configuration boundaries.

## Demo login inventory

The operational sandbox needs no real account. Original onboarding uses intentionally public sample accounts: `demo-admin` / `AdminDemo2026!` and `demo-member` / `MemberDemo2026!`. Both are restricted to isolated demo records and do not authenticate against live membership records. Workspaces expire after six hours.

## Credential review

A source pattern scan of 122 tracked files found no recognised private-key, GitHub/provider-token or password-bearing database-URL patterns. This bounded scan is not a guarantee about every secret format, historical commit or external account.

Hosting metadata lists encrypted/sensitive server-only database connections/passwords, `NEON_AUTH_COOKIE_SECRET` and `MAIL_ENCRYPTION_KEY`, with authentication endpoint and owner/notification-email settings. No secret values were requested, exported or placed in the review documents. The name-only inventory did not show Stripe keys, LinkedIn access token, Resend key, dedicated signing/cron secret or configured AI Gateway model/key. Live provider operations were not activated.

Sample completion credentials are demonstration records with no professional validity. The source guide does not require model credentials. Model inference, real money, email delivery and LinkedIn publishing remain separate integrations.
