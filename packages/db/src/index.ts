import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

export const connectionString =
  process.env.DATABASE_URL ?? 'postgres://filaviva:filaviva@localhost:5432/filaviva';

/** `max: 1` no seed e nas migrações; a API e o worker usam o pool cheio. */
export function criarCliente(max = 10) {
  return postgres(connectionString, { max, prepare: false });
}

export const sql = criarCliente();
export const db = drizzle(sql, { casing: 'snake_case', schema });
export type Database = typeof db;

export * from './ids.ts';
export * from './schema.ts';
export { schema };
