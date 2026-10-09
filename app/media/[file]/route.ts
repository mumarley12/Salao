import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Imagens do salão de demonstração e das prévias de link. Servidas por aqui para não depender da pasta public no deploy.
const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const type = TYPES[file.split('.').pop() || '']
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(file) || !type) return new Response('Não encontrado', { status: 404 })
  try {
    const data = await readFile(join(process.cwd(), 'assets/media', file))
    return new Response(new Uint8Array(data), { headers: { 'content-type': type, 'cache-control': 'public, max-age=86400' } })
  } catch {
    return new Response('Não encontrado', { status: 404 })
  }
}
