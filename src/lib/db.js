import { Pool } from 'pg';

const globalForPg = globalThis;

const pool =
  globalForPg.__munirixPgPool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.__munirixPgPool = pool;
}

export const query = (text, params) => pool.query(text, params);

/**
 * Ejecuta una función dentro de una transacción PostgreSQL (BEGIN / COMMIT / ROLLBACK).
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default pool;

