import { account, db, session, user, verification } from '@fila-viva/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

const origens = [
  process.env.WEB_URL ?? 'http://localhost:3000',
  process.env.API_URL ?? 'http://localhost:3333',
];

export const auth = betterAuth({
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
  appName: 'Fila Viva',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { account, session, user, verification },
  }),
  emailAndPassword: {
    // Piloto interno: quem cadastra usuário é a SME, não a família.
    autoSignIn: true,
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
  },
  trustedOrigins: origens,
  user: {
    additionalFields: {
      creId: { input: false, required: false, type: 'number' },
      papel: { defaultValue: 'unidade', input: false, required: false, type: 'string' },
      unidadeId: { input: false, required: false, type: 'string' },
    },
  },
});

export type Sessao = typeof auth.$Infer.Session;
