# Local development

Use Node.js 24 and `npm ci`. A full production build needs no real credentials.

For a synthetic database-backed workspace without an external Postgres account:
1. Create an ignored `.env.local` containing `STANAIC_LOCAL_DB=1`, `OWNER_EMAIL=owner@example.org`, and `MAIL_MODE=preview`.
2. Run `npm run dev` and open `/workspace` in the local browser. It starts an isolated six-hour sandbox stored in `.local-db` through PGlite, not localStorage.
3. For the old onboarding `/demo`, set an independently generated base64 32-byte `MAIL_ENCRYPTION_KEY` if needed; it remains test-only and must never be committed.
4. The local adapter is explicitly disabled for production builds and whenever VERCEL is set. Production requires the configured PostgreSQL connection and verified Neon Auth identity. The local flag cannot create a live owner login.

`npm test` uses fresh in-memory PostgreSQL/PGlite and SQLite fixtures. It never contacts LinkedIn, Stripe or a model provider. `npm run typecheck` and `npm run build` complete the package checks. Synthetic sample records, cookie secrets, builds, and database files are ignored by Git.
