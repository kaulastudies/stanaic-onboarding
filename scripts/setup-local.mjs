import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.openai/hosting.json')) { mkdirSync('.openai', { recursive: true }); writeFileSync('.openai/hosting.json', JSON.stringify({ d1: 'DB', r2: null }, null, 2) + '\n'); }
if (!existsSync('.dev.vars')) {
  writeFileSync('.dev.vars', `OWNER_USER_ID="local_seedy"\nOWNER_EMAIL="seedy@sites.test"\nADMIN_NOTIFY_EMAIL="seedy@sites.test"\nMAIL_MODE="preview"\nMAIL_ENCRYPTION_KEY="${randomBytes(32).toString('base64')}"\n`, { mode: 0o600 });
  console.log('Local test settings created. No external email will be sent.');
} else console.log('Existing local settings preserved.');
console.log('Next: npm run build, npm run db:migrate:local, npm run dev. Open the printed loopback URL and choose Administrator sign in.');
