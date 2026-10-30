import { ensureSchema, getPool } from '../lib/database.mjs';
await ensureSchema();
console.log('Onboarding schema is ready.');
await getPool().end();
