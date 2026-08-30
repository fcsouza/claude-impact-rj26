import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { criarCliente } from './index.ts';

const cliente = criarCliente(1);
await migrate(drizzle(cliente), { migrationsFolder: `${import.meta.dir}/../drizzle` });
await cliente.end();
process.stdout.write('migrações aplicadas\n');
