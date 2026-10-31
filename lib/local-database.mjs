// Explicit development-only adapter. Production always uses the configured Postgres pool.
export function localDatabase() {
  const key = Symbol.for('stanaic.localPostgres');
  if (globalThis[key]) return globalThis[key];
  let db, tail = Promise.resolve();
  const instance = async () => db ??= import('@electric-sql/pglite').then(({ PGlite }) => new PGlite('.local-db'));
  async function connect() {
    const before = tail; let unlock; tail = new Promise(resolve => { unlock = resolve; });
    await before;
    let released = false;
    return { query: async (sql, values) => (await instance()).query(sql, values), release() { if (!released) { released = true; unlock(); } } };
  }
  const pool = { connect, async query(sql, values) { const client = await connect(); try { return await client.query(sql, values); } finally { client.release(); } } };
  globalThis[key] = pool;
  return pool;
}
