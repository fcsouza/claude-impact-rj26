import type { NextConfig } from 'next';

const API = process.env.API_URL ?? 'http://localhost:3333';

const config: NextConfig = {
  // O Next 16 gera AGENTS.md/CLAUDE.md por padrão; este repo já tem os seus.
  agentRules: false,
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  // O navegador fala com o Next; o Next repassa para a API. Cookie de sessão fica same-origin.
  async rewrites() {
    return [{ destination: `${API}/api/:path*`, source: '/api/:path*' }];
  },
  typedRoutes: false,
};

export default config;
