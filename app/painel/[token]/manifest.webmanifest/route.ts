import { supabase } from '@/lib/supabase'

// Manifesto do painel instalado no ecrã principal (precisa disto para as notificações no iPhone).
// Um por salão: o painel abre direto no link secreto.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const now = new Date().toISOString()
  const { data } = await supabase.rpc('panel_data', { p_token: token, p_from: now, p_to: now })
  const shop = (data as { shop?: { name: string; logo_url: string | null } } | null)?.shop
  if (!shop) return new Response('Não encontrado', { status: 404 })
  const name = shop.name.replace(/_/g, ' ')
  const manifest = {
    name: `${name} · Painel`,
    short_name: name,
    start_url: `/painel/${token}`,
    scope: `/painel/${token}`,
    display: 'standalone',
    background_color: '#EEEDEA',
    theme_color: '#FBFAF8',
    icons: shop.logo_url ? [{ src: shop.logo_url, sizes: 'any', type: shop.logo_url.endsWith('.png') ? 'image/png' : 'image/jpeg', purpose: 'any' }] : [],
  }
  return new Response(JSON.stringify(manifest), {
    headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'private, no-store' },
  })
}
