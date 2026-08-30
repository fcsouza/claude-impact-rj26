import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://filaviva:filaviva@localhost:5432/filaviva',
  },
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/schema.ts',
});
