import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __tutorPool: Pool | undefined;
}

export const pool: Pool = global.__tutorPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

if (!global.__tutorPool) {
  global.__tutorPool = pool;
}
