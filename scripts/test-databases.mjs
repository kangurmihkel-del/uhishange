import pg from 'pg';
const url = new URL(
  process.env.DATABASE_URL || 'postgres://uhishange:uhishange@localhost:54329/uhishange',
);
url.pathname = '/postgres';
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
try {
  for (const name of ['uhishange_test', 'uhishange_e2e']) {
    const existing = await db.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
    if (!existing.rowCount) await db.query('CREATE DATABASE "' + name + '"');
  }
  console.log('Isolated test databases ready.');
} finally {
  await db.end();
}
