/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pacotes do monorepo consumidos como fonte TS (sem build próprio) — o Next
  // precisa transpilá-los como se fossem parte do app. Ver CLAUDE.md §Estrutura.
  transpilePackages: ['@lotopro/core', '@lotopro/db', '@lotopro/ui', '@lotopro/integrations'],
}

export default nextConfig
