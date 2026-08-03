import path from 'node:path'
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Deploy em container: empacota só o necessário para rodar (server.js + deps).
  output: 'standalone',
  // Monorepo: a raiz do trace é o repo, não apps/web — senão o standalone
  // perde os pacotes do workspace.
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  reactStrictMode: true,
  // Pacotes do monorepo consumidos como fonte TS (sem build próprio) — o Next
  // precisa transpilá-los como se fossem parte do app. Ver CLAUDE.md §Estrutura.
  transpilePackages: ['@lotopro/core', '@lotopro/db', '@lotopro/ui', '@lotopro/integrations'],
}

export default nextConfig
