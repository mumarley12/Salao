import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { supabase } from '@/lib/supabase'

// Prévia que aparece quando o link do site é colado no WhatsApp, Instagram etc.
export const alt = 'Agende seu horário online'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const font = (file: string) => readFile(join(process.cwd(), 'assets/fonts', file))
const fonts = Promise.all([font('DMSerifDisplay-Regular.ttf'), font('AlbertSans-Medium.ttf'), font('AlbertSans-Bold.ttf')])

// Busca o logo antes de desenhar: se falhar, a prévia sai com a inicial no lugar.
// Endereço do próprio site, para resolver logos salvos como caminho relativo (/media/logo.jpg).
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://agenda-por-profissional.vercel.app'

async function loadLogo(url: string | null | undefined) {
  if (!url) return null
  try {
    const res = await fetch(new URL(url, SITE))
    if (!res.ok) return null
    const type = res.headers.get('content-type') || 'image/jpeg'
    if (!/jpe?g|png/.test(type)) return null
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
  } catch {
    return null
  }
}

const ROSE = '#E7A3B7'
const INK = '#18111A'
const CREAM = '#F3EFE7'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data: shop } = await supabase.from('shops').select('name, logo_url, address, city').eq('slug', slug).maybeSingle<{ name: string; logo_url: string | null; address: string | null; city: string | null }>()
  const [[serif, albert, albertBold], logo] = await Promise.all([fonts, loadLogo(shop?.logo_url)])
  const name = shop?.name || 'Seu salão'
  const place = shop?.city || ''

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: INK, color: CREAM, fontFamily: 'Albert Sans', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', background: 'radial-gradient(circle at 80% 40%, rgba(231,163,183,0.2), rgba(231,163,183,0) 45%)', display: 'flex' }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 0 0 72px', width: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 24, fontWeight: 700, color: ROSE, border: '2px solid rgba(231,163,183,0.35)', borderRadius: 999, padding: '8px 22px', alignSelf: 'flex-start' }}>
            <div style={{ width: 12, height: 12, borderRadius: 12, background: '#5BD38A', display: 'flex' }} />
            Agenda online · 24 horas
          </div>
          <div style={{ fontFamily: 'DM Serif Display', fontSize: 64, lineHeight: 1.04, letterSpacing: -1.5, marginTop: 28, display: 'flex' }}>Agende seu horário sem mandar mensagem.</div>
          <div style={{ fontSize: 28, color: '#CFC8BC', marginTop: 22, display: 'flex' }}>Escolha a profissional, o serviço e o horário em poucos toques.</div>
          <div style={{ display: 'flex', marginTop: 36, alignSelf: 'flex-start', background: ROSE, color: INK, fontWeight: 700, fontSize: 28, borderRadius: 999, padding: '16px 36px' }}>Agendar meu horário</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, paddingRight: 48 }}>
          {logo
            ? <img src={logo} width={280} height={280} style={{ borderRadius: 280, border: `6px solid ${ROSE}`, objectFit: 'cover' }} />
            : <div style={{ width: 280, height: 280, borderRadius: 280, border: `6px solid ${ROSE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Serif Display', fontSize: 120, color: ROSE }}>{name.slice(0, 1)}</div>}
          <div style={{ fontFamily: 'DM Serif Display', fontSize: 42, marginTop: 26, textAlign: 'center', display: 'flex' }}>{name}</div>
          {place && <div style={{ fontSize: 22, color: '#A8A196', marginTop: 8, textAlign: 'center', display: 'flex', maxWidth: 400 }}>{place}</div>}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'DM Serif Display', data: serif, weight: 400, style: 'normal' },
        { name: 'Albert Sans', data: albert, weight: 500, style: 'normal' },
        { name: 'Albert Sans', data: albertBold, weight: 700, style: 'normal' },
      ],
    },
  )
}
