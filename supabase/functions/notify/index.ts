// Notificações push do painel (Web Push). Chamada pelo pg_cron de 15 em 15 minutos (ver 0008_notify_cron.sql).
// Chaves no Vault do banco (vapid_public_key, vapid_private_key, vapid_subject, notify_secret), lidas por
// public.notify_config() (só service_role). Os segredos da função com os mesmos nomes em maiúsculas têm prioridade.
// O WhatsApp nunca é enviado daqui: o aviso leva ao painel e o envio continua manual.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const { data: cfg } = await db.rpc('notify_config')
const conf = (k: string) => Deno.env.get(k.toUpperCase()) || (cfg as Record<string, string> | null)?.[k] || ''
webpush.setVapidDetails(conf('vapid_subject') || 'mailto:admin@example.com', conf('vapid_public_key'), conf('vapid_private_key'))

type Shop = { id: string; name: string; timezone: string; panel_token: string; logo_url: string | null; confirm_until: string }
type Appt = { id: string; client_name: string; service_name: string; starts_at: string; created_at: string; source: string; status: string; deposit_status: string; reminder_sent_at: string | null; client_confirmed_at: string | null }

// Data/hora "de parede" no fuso do salão.
function local(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, h: Number(p.hour), min: Number(p.minute) }
}
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const when = (iso: string, tz: string) => {
  const l = local(new Date(iso), tz)
  const wd = WD[new Date(l.day + 'T12:00:00Z').getUTCDay()]
  return `${wd} ${Number(l.day.slice(8))}/${Number(l.day.slice(5, 7))} às ${l.h}h${l.min ? String(l.min).padStart(2, '0') : ''}`
}
// Uuid estável para "salão + dia" (avisos diários) a partir de texto.
async function dayRef(text: string) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).slice(0, 16)
  h[6] = (h[6] & 0x0f) | 0x40; h[8] = (h[8] & 0x3f) | 0x80
  const x = [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

async function once(shop: Shop, kind: string, ref: string) {
  const { error } = await db.from('notification_log').insert({ shop_id: shop.id, kind, ref_id: ref })
  return !error // já enviado = violação do unique
}

async function send(shop: Shop, title: string, body: string, tab: string) {
  const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('shop_id', shop.id).is('disabled_at', null)
  const payload = JSON.stringify({ title, body, icon: shop.logo_url || undefined, url: `/painel/${shop.panel_token}?tab=${tab}`, tag: `${tab}-${Date.now()}` })
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.from('push_subscriptions').update({ disabled_at: new Date().toISOString() }).eq('endpoint', s.endpoint)
    }
  }
}

async function tick() {
  const { data: subs } = await db.from('push_subscriptions').select('shop_id').is('disabled_at', null)
  const ids = [...new Set((subs || []).map((s) => s.shop_id))]
  if (!ids.length) return 0
  const { data: shops } = await db.from('shops').select('id, name, timezone, panel_token, logo_url, confirm_until').in('id', ids)
  const now = new Date()
  for (const shop of (shops || []) as Shop[]) {
    const { data: pr } = await db.from('notification_prefs').select('*').eq('shop_id', shop.id).maybeSingle()
    const p = pr || { new_booking: true, before_appt: true, before_min: 60, reminders_due: true, reminders_hour: 10, not_confirmed: true, deposit_missing: true }
    const tz = shop.timezone
    const L = local(now, tz)
    const { data: rows } = await db.from('appointments').select('id, client_name, service_name, starts_at, created_at, source, status, deposit_status, reminder_sent_at, client_confirmed_at')
      .eq('shop_id', shop.id).eq('status', 'pending').gte('starts_at', new Date(now.getTime() - 86400000).toISOString()).lte('starts_at', new Date(now.getTime() + 366 * 86400000).toISOString()) // marcações feitas hoje podem ser para daqui a semanas
    const appts = (rows || []) as Appt[]

    if (p.new_booking) for (const a of appts.filter((a) => a.source === 'site' && now.getTime() - Date.parse(a.created_at) < 86400000))
      if (await once(shop, 'new_booking', a.id)) await send(shop, 'Nova marcação', `${a.client_name} marcou ${a.service_name} · ${when(a.starts_at, tz)}`, 'hoje')

    if (p.before_appt) for (const a of appts.filter((a) => { const d = Date.parse(a.starts_at) - now.getTime(); return d > 0 && d <= p.before_min * 60000 }))
      if (await once(shop, 'before_appt', a.id)) await send(shop, `Daqui a ${p.before_min >= 60 ? p.before_min / 60 + 'h' : p.before_min + ' min'}`, `${a.client_name} · ${a.service_name} · ${when(a.starts_at, tz)}`, 'hoje')

    const tomorrow = local(new Date(now.getTime() + 86400000), tz).day
    if (p.reminders_due && L.h >= p.reminders_hour) {
      const due = appts.filter((a) => !a.reminder_sent_at && local(new Date(a.starts_at), tz).day === tomorrow)
      if (due.length && await once(shop, 'reminders_due', await dayRef(shop.id + L.day)))
        await send(shop, 'Lembretes por enviar', `Tem ${due.length} lembrete${due.length > 1 ? 's' : ''} para enviar hoje. Toque para abrir.`, 'lemb')
    }

    const [ch, cm] = (shop.confirm_until || '22:00').split(':').map(Number)
    if (p.not_confirmed && L.h * 60 + L.min >= ch * 60 + cm) for (const a of appts.filter((a) => a.reminder_sent_at && !a.client_confirmed_at && local(new Date(a.reminder_sent_at), tz).day === L.day))
      if (await once(shop, 'not_confirmed', a.id)) await send(shop, 'Sem confirmação', `${a.client_name} não confirmou a marcação de ${when(a.starts_at, tz)}.`, 'lemb')

    if (p.deposit_missing) for (const a of appts.filter((a) => a.deposit_status === 'pending' && now.getTime() - Date.parse(a.created_at) > 2 * 3600000 && Date.parse(a.starts_at) > now.getTime()))
      if (await once(shop, 'deposit_missing', a.id)) await send(shop, 'Sinal por pedir', `${a.client_name} marcou ${a.service_name} e ainda não tem sinal.`, 'cal')
  }
  return ids.length
}

Deno.serve(async (req) => {
  if (!conf('notify_secret') || req.headers.get('x-notify-secret') !== conf('notify_secret')) return new Response('forbidden', { status: 403 })
  const n = await tick()
  return Response.json({ ok: true, shops: n })
})
