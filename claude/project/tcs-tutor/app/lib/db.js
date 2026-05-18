import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

export const pool = new Pool({ connectionString });

/**
 * Run a parameterized SQL query.
 * @example
 *   const rows = await query('SELECT * FROM users WHERE id = $1', [userId]);
 */
export async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Run a function inside a transaction. Auto-rollback on throw.
 * @example
 *   await tx(async (client) => {
 *     await client.query('INSERT INTO ...', [...]);
 *     await client.query('UPDATE ...', [...]);
 *   });
 */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function close() {
  await pool.end();
}
