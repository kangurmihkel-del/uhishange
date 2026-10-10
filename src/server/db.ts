import { Pool, type PoolClient } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://uhishange:uhishange@localhost:54329/uhishange',
  max: 16,
});
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function migrate(): Promise<void> {
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('uhishange:migrations'))");
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())',
    );
    const directory = path.resolve(process.cwd(), 'migrations');
    for (const name of (await readdir(directory)).filter((item) => item.endsWith('.sql')).sort()) {
      if ((await client.query('SELECT name FROM schema_migrations WHERE name=$1', [name])).rowCount)
        continue;
      await client.query(await readFile(path.join(directory, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    }
  });
}
