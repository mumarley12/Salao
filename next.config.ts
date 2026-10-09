import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Arquivos lidos com readFile pela rota de imagens.
  outputFileTracingIncludes: {
    '/media/[file]': ['./assets/media/**'],
  },
}

export default nextConfig
