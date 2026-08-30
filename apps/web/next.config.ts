import type { NextConfig } from 'next';

const config: NextConfig = {
  // O Next 16 gera AGENTS.md/CLAUDE.md por padrão; este repo já tem os seus.
  agentRules: false,
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  typedRoutes: false,
};

export default config;
