import pg from 'pg';
import { readFile } from 'node:fs/promises';
pg.types.setTypeParser(20, value => Number(value));
let pool;
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  const url = new URL(process.env.DATABASE_URL);
  if (['prefer', 'require', 'verify-ca'].includes(url.searchParams.get('sslmode'))) url.searchParams.set('sslmode', 'verify-full');
  return pool ??= new pg.Pool({ connectionString: url.toString(), max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
}
export function postgresSql(sql) {
  let index = 0;
  const ignore = /^INSERT OR IGNORE /i.test(sql);
  return sql.replace(/^INSERT OR IGNORE /i, 'INSERT ')
    .replace(/'(?:''|[^'])*'|\?/g, match => match === '?' ? `$${++index}` : match)
    + (ignore ? ' ON CONFLICT DO NOTHING' : '');
}
export function database(connection = getPool()) {
  const prepare = (sql, values = []) => ({
    sql: postgresSql(sql), values,
    bind(...args) { return prepare(sql, args); },
    async first() { return (await connection.query(this.sql, this.values)).rows[0] || null; },
    async all() { return { results: (await connection.query(this.sql, this.values)).rows }; },
    async run() { const r = await connection.query(this.sql, this.values); return { meta: { changes: r.rowCount ?? r.affectedRows ?? 0 } }; },
  });
  return {
    prepare,
    async batch(statements) {
      const client = await connection.connect();
      try {
        await client.query('BEGIN');
        // Serializes onboarding writes across instances, including single-use links.
        await client.query('SELECT pg_advisory_xact_lock(73104001)');
        const results = [];
        for (const statement of statements) {
          const result = await client.query(statement.sql, statement.values);
          results.push({ meta: { changes: result.rowCount ?? result.affectedRows ?? 0 } });
        }
        await client.query('COMMIT'); return results;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };
}
let ready;
export async function ensureSchema() {
  // Idempotent initial schema. Never modifies the Neon-managed auth schema.
  ready ??= (async () => {
    const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const client = await getPool().connect();
    try {
      await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(73104002)');
      await client.query(sql); await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
