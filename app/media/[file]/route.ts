import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Imagens e vídeos dos salões e das prévias de link. Servidos por aqui para não depender da pasta public no deploy.
const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4' }

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const type = TYPES[file.split('.').pop() || '']
  if (!/^[a-z0-9-]+\.(jpg|png|webp|mp4)$/.test(file) || !type) return new Response('Não encontrado', { status: 404 })
  let data: Buffer
  try {
    data = await readFile(join(process.cwd(), 'assets/media', file))
  } catch {
    return new Response('Não encontrado', { status: 404 })
  }
  const headers = { 'content-type': type, 'cache-control': 'public, max-age=86400', 'accept-ranges': 'bytes' }

  // O Safari do iPhone só toca vídeo se o servidor responder a pedidos por partes (Range).
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '')
  if (range && (range[1] || range[2])) {
    const size = data.length
    let start = range[1] ? Number(range[1]) : size - Number(range[2])
    let end = range[1] && range[2] ? Number(range[2]) : size - 1
    start = Math.max(0, start)
    end = Math.min(end, size - 1)
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
    return new Response(new Uint8Array(data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) },
    })
  }
  return new Response(new Uint8Array(data), { headers: { ...headers, 'content-length': String(data.length) } })
}
