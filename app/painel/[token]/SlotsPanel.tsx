'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, errorMessage } from '@/lib/supabase'
import type { Appointment, Block, NotificationPrefs, Professional, Service, Shop, SlotRow } from '@/lib/types'
import {
  addDays, addMonths, atLocal, daysInMonth, displayPhone, formatPhone, hourLabel, initials, monthTitle, shortDay,
  timeLabel, todayKey, toMinutes, waNumber, weekdayOf, zoned,
} from '@/lib/time'

// Painel 2a (celular): Hoje · Lembretes · Calendário · Serviços · Relatório, mais Notificações pelo sino.
// Usado pelos salões com booking_mode = 'slots' (vagas publicadas, sinal e lembretes de véspera).

type Data = {
  shop: Shop; professionals: Professional[]; services: Service[]; appointments: Appointment[]; blocks: Block[]
  slots: SlotRow[]; notification_prefs: NotificationPrefs
}
type Tab = 'hoje' | 'lemb' | 'cal' | 'serv' | 'rel' | 'notif'
type Run = (fn: string, args: Record<string, unknown>, ok?: string) => Promise<boolean>

const CAL_MONTHS_AHEAD = 5

// "12,50 €" / "25 €"
const eur = (cents: number) => (cents / 100).toLocaleString('pt-PT', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }) + ' €'
const firstName = (n: string) => n.trim().split(/\s+/)[0]
// "Danieela_nails" → "Danieela Nails" (nas mensagens para as clientes)
const niceName = (n: string) => n.replace(/_/g, ' ').replace(/(^|\s)(\p{L})/gu, (_, s, c) => s + c.toUpperCase())
const hh = (t: string | undefined) => `${Number((t || '22:00').slice(0, 2))}h`

export default function SlotsPanel({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTabState] = useState<Tab>('hoje')
  const [prevTab, setPrevTab] = useState<Tab>('hoje')
  const [dark, setDark] = useState(false)
  const [toast, setToast] = useState('')
  const [relMonth, setRelMonth] = useState<string>()
  const [calMonth, setCalMonth] = useState<string>()
  const [selDay, setSelDay] = useState<string>()
  const [, setTick] = useState(0)
  const tzRef = useRef('Europe/Lisbon')

  const load = useCallback(async () => {
    const tz = tzRef.current
    const cur = todayKey(tz).slice(0, 7)
    const fromMonth = relMonth && relMonth < cur ? relMonth : cur
    const { data: res, error } = await supabase.rpc('panel_data', {
      p_token: token,
      p_from: atLocal(fromMonth + '-01', 0, tz).toISOString(),
      p_to: atLocal(addMonths(cur, CAL_MONTHS_AHEAD + 1) + '-01', 0, tz).toISOString(),
    })
    if (error) { setLoadError('Link do painel inválido.'); return }
    const d = res as Data
    if (d.shop.timezone !== tzRef.current) { tzRef.current = d.shop.timezone; setTick((n) => n + 1) }
    setData(d)
  }, [token, relMonth])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(() => { load(); setTick((n) => n + 1) }, 30000) // marcações do site aparecem sozinhas
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [load])
  useEffect(() => {
    try { setDark(localStorage.getItem('panel_dark') === '1') } catch {}
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null
    if (t && ['hoje', 'lemb', 'cal', 'serv', 'rel', 'notif'].includes(t)) setTabState(t)
  }, [])

  const setTab = (t: Tab) => { setTabState(t); window.scrollTo({ top: 0 }) }
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2600) }
  const run: Run = async (fn, args, ok) => {
    const { error } = await supabase.rpc(fn, { p_token: token, ...args })
    if (error) { flash(errorMessage(error)); await load(); return false }
    await load()
    if (ok) flash(ok)
    return true
  }
  const toggleDark = () => { const d = !dark; setDark(d); try { localStorage.setItem('panel_dark', d ? '1' : '0') } catch {} }

  const push = usePush(token)

  if (loadError) return <div className="sp"><div className="sp-center"><div className="sp-card"><h3 className="sp-h">Link inválido</h3><p className="sp-sub">{loadError} Confira se copiou o link inteiro.</p></div></div></div>
  if (!data) return <div className="sp"><div className="sp-center"><p className="sp-sub">A carregar painel…</p></div></div>

  const { shop } = data
  const tz = shop.timezone
  const today = todayKey(tz)
  const curMonth = today.slice(0, 7)
  const now = new Date()
  const dayOf = (a: { starts_at: string }) => zoned(new Date(a.starts_at), tz).key
  const appts = data.appointments
  const future = appts.filter((a) => a.status === 'pending' && new Date(a.starts_at) > now)
  const ctx: Ctx = { data, token, tz, today, now, dayOf, run, flash, shopName: niceName(shop.name) }

  // Lembretes: listas e badge.
  const rem = reminderLists(ctx)
  const lembBadge = rem.due.length + rem.wait.length
  const calBadge = future.filter((a) => a.deposit_status !== 'paid').length

  const openCalendarAt = (day: string) => { setCalMonth(day.slice(0, 7)); setSelDay(day); setTab('cal') }

  return (
    <div className={'sp' + (dark ? ' dark' : '')}>
      <div className="sp-shell">
        <div className="sp-card sp-main">
          <header className="sp-header">
            <div className="sp-brand">
              {shop.logo_url ? <img src={shop.logo_url} alt="" /> : <span className="sp-logo-ph">{initials(shop.name)}</span>}
              <div><b>{shop.name}</b><span>Painel do salão</span></div>
            </div>
            <div className="sp-header-actions">
              <button className="sp-round" onClick={toggleDark} aria-label="Modo escuro" title="Modo escuro">{dark ? <IconSun /> : <IconMoon />}</button>
              <button className={'sp-round' + (tab === 'notif' ? ' on' : '')} aria-label="Notificações" title="Notificações"
                onClick={() => { if (tab === 'notif') setTab(prevTab); else { setPrevTab(tab); setTab('notif') } }}>
                <IconBell />{!push.subscribed && <span className="sp-dot-alert" />}
              </button>
              <a className="sp-site-btn" href={`/${shop.slug}`} target="_blank" rel="noopener">Ver site ↗</a>
            </div>
          </header>

          <nav className="sp-tabs-desktop">
            {NAV.map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}
                {k === 'lemb' && lembBadge > 0 && <span className="sp-badge-inline">{lembBadge}</span>}
                {k === 'cal' && calBadge > 0 && <span className="sp-badge-inline">{calBadge}</span>}
              </button>
            ))}
          </nav>

          {tab === 'hoje' && <Today ctx={ctx} openCalendarAt={openCalendarAt} />}
          {tab === 'lemb' && <Reminders ctx={ctx} rem={rem} />}
          {tab === 'cal' && <Calendar ctx={ctx} month={calMonth || curMonth} setMonth={setCalMonth} sel={selDay} setSel={setSelDay} />}
          {tab === 'serv' && <Services ctx={ctx} />}
          {tab === 'rel' && <Report ctx={ctx} month={relMonth || curMonth} setMonth={setRelMonth} />}
          {tab === 'notif' && <Notifications ctx={ctx} push={push} />}
        </div>
      </div>

      {toast && <div className="sp-toast" role="status">{toast}</div>}

      <nav className="sp-nav">
        {NAV.map(([k, l, Icon]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <Icon /><span>{l}</span>
            {k === 'lemb' && lembBadge > 0 && <i className="sp-badge">{lembBadge}</i>}
            {k === 'cal' && calBadge > 0 && <i className="sp-badge">{calBadge}</i>}
          </button>
        ))}
      </nav>
    </div>
  )
}

type Ctx = {
  data: Data; token: string; tz: string; today: string; now: Date; dayOf: (a: { starts_at: string }) => string
  run: Run; flash: (m: string) => void; shopName: string
}

/* ------------------------------ Regras de valores ------------------------------ */

const depositOf = (a: Appointment, shop: Shop) => a.deposit_cents ?? shop.deposit_cents ?? 0
const isPaid = (a: Appointment) => a.deposit_status === 'paid'

// Quanto já entrou por esta marcação (para o relatório).
function received(a: Appointment, shop: Shop) {
  if (a.status === 'done') return a.price_cents
  return isPaid(a) ? depositOf(a, shop) : 0
}

const phoneDigits = (a: Appointment, shop: Shop) => (a.client_phone ? waNumber(a.client_phone, shop.country) : '')
const waLink = (a: Appointment, shop: Shop, text: string) => {
  const d = phoneDigits(a, shop)
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null
}

/* ------------------------------------ Hoje ------------------------------------ */

function Today({ ctx, openCalendarAt }: { ctx: Ctx; openCalendarAt: (day: string) => void }) {
  const { data, tz, today, dayOf, run, now } = ctx
  const { shop } = data
  const [which, setWhich] = useState<0 | 1>(0)
  const [newOpen, setNewOpen] = useState(false)
  const day = which ? addDays(today, 1) : today
  const h = zoned(now, tz).h
  const greeting = h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 19 ? 'Boa tarde' : 'Boa noite'
  const longDate = now.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz })
  const fresh = data.appointments.filter((a) => a.source === 'site' && !a.seen_at)
  const pros = data.professionals.filter((p) => p.active)

  return (
    <>
      <div><h3 className="sp-h">{greeting}, {shop.name}!</h3><p className="sp-sub">{longDate}</p></div>

      {fresh.length > 0 && (
        <div className="sp-new">
          <div className="sp-new-head">
            <b><span className="sp-dot-acc" />{fresh.length === 1 ? 'Nova marcação pelo site' : `${fresh.length} novas marcações pelo site`}</b>
            <button className="sp-link-muted" onClick={() => run('panel_mark_seen', { p_ids: null })}>Marcar como visto</button>
          </div>
          {fresh.slice(0, 3).map((a) => (
            <button key={a.id} className="sp-new-item" onClick={() => { run('panel_mark_seen', { p_ids: [a.id] }); openCalendarAt(dayOf(a)) }}>
              <span><b>{a.client_name}</b><small>{shortDay(dayOf(a))} às {hourLabel(a.starts_at, tz)} · {a.service_name}</small></span>
              <span className="sp-new-go">Ver ›</span>
            </button>
          ))}
          {fresh.length > 3 && <button className="sp-new-more" onClick={() => openCalendarAt(dayOf(fresh[3]))}>+ {fresh.length - 3} mais · ver no Calendário</button>}
        </div>
      )}

      <div className="sp-row-between">
        <div className="sp-seg">
          <button className={which === 0 ? 'on' : ''} onClick={() => setWhich(0)}>Hoje</button>
          <button className={which === 1 ? 'on' : ''} onClick={() => setWhich(1)}>Amanhã</button>
        </div>
        <button className="sp-btn-acc" onClick={() => setNewOpen(true)}>+ Novo</button>
      </div>

      {newOpen && <NewBooking ctx={ctx} onClose={() => setNewOpen(false)} />}

      {pros.map((p) => {
        const items = data.appointments.filter((a) => a.professional_id === p.id && dayOf(a) === day)
        return (
          <div key={p.id} className="sp-box sp-daycard">
            <div className="sp-who"><span className="sp-initials">{initials(p.name)}</span><div><b>{p.name}</b><small>{items.length} {items.length === 1 ? 'horário' : 'horários'} {which ? 'amanhã' : 'hoje'}</small></div></div>
            {items.length === 0 && <p className="sp-sub" style={{ margin: '4px 2px' }}>Nenhuma marcação {which ? 'amanhã' : 'hoje'}.</p>}
            {items.map((a) => <TodayRow key={a.id} a={a} ctx={ctx} />)}
          </div>
        )
      })}
    </>
  )
}

function TodayRow({ a, ctx }: { a: Appointment; ctx: Ctx }) {
  const { data: { shop }, tz, run } = ctx
  const dep = depositOf(a, shop)
  const paid = isPaid(a)
  const rest = Math.max(0, a.price_cents - (paid ? dep : 0))
  const wa = waLink(a, shop, `Olá ${firstName(a.client_name)}!`)
  const depTitle = paid ? 'Sinal pago' : a.deposit_status === 'sent' ? 'Sinal pedido' : 'Sinal por pedir'
  return (
    <div className={'sp-appt ' + a.status}>
      <b className="sp-appt-time">{timeLabel(a.starts_at, tz)}</b>
      <div className="sp-appt-main">
        <span className="sp-appt-name"><span className={'sp-depdot ' + (a.deposit_status || 'pending')} title={depTitle} aria-label={depTitle} /><b>{a.client_name}</b></span>
        <small>{a.service_name}</small>
        {a.status === 'done' && <small className="sp-line ok">{a.price_cents > 0 ? `✓ Recebido ${eur(rest)}` : '✓ Concluído'}</small>}
        {a.status === 'pending' && <small className="sp-line warn">{a.price_cents > 0 ? `Falta pagar: ${eur(rest)}${paid ? '' : ' · sem sinal'}` : 'Falta pagar: serviço sem preço'}</small>}
        {a.status === 'noshow' && <small className="sp-line bad">{paid ? `Faltou · fica o sinal de ${eur(dep)}` : 'Faltou · sem sinal pago'}</small>}
      </div>
      {wa ? <a className="sp-ic wa" href={wa} target="_blank" rel="noopener" aria-label="Contactar no WhatsApp" title="WhatsApp"><IconWa /></a> : <span className="sp-ic ghost" />}
      <button className={'sp-ic' + (a.status === 'noshow' ? ' bad-on' : '')} aria-label="Marcar falta" aria-pressed={a.status === 'noshow'} title="Faltou"
        onClick={() => run('panel_set_status', { p_id: a.id, p_status: a.status === 'noshow' ? 'pending' : 'noshow' })}><IconX /></button>
      <button className={'sp-ic' + (a.status === 'done' ? ' ok-on' : '')} aria-label="Marcar como concluído" aria-pressed={a.status === 'done'} title="Concluído"
        onClick={() => run('panel_set_status', { p_id: a.id, p_status: a.status === 'done' ? 'pending' : 'done' })}><IconCheck /></button>
    </div>
  )
}

function NewBooking({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const { data, tz, today, dayOf, run } = ctx
  const { shop, services } = data
  const pros = data.professionals.filter((p) => p.active)
  const [f, setF] = useState({ name: '', phone: '', service: services.find((s) => s.active)?.id || '', date: addDays(today, 1), pick: '', time: '', pro: pros[0]?.id || '' })
  const [err, setErr] = useState('')
  const [sending, setSending] = useState(false)
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setErr('') }
  const taken = new Set(data.appointments.filter((a) => a.professional_id === f.pro && a.status !== 'cancelled').map((a) => a.starts_at && new Date(a.starts_at).getTime()))
  const free = data.slots.filter((s) => s.professional_id === f.pro && s.in_draft && dayOf(s) === f.date && !taken.has(new Date(s.starts_at).getTime()) && new Date(s.starts_at) > new Date())

  const save = async () => {
    if (f.name.trim().length < 2) return setErr('Escreve o nome da cliente.')
    if (!f.date) return setErr('Escolhe o dia.')
    const start = f.pick ? new Date(f.pick) : f.time ? atLocal(f.date, toMinutes(f.time), tz) : null
    if (!start) return setErr('Escolhe um horário.')
    setSending(true)
    const ok = await run('panel_add_booking', {
      p_professional_id: f.pro, p_service_id: f.service, p_starts_at: start.toISOString(), p_client_name: f.name, p_client_phone: f.phone.replace(/\D/g, ''),
    }, 'Marcação criada')
    setSending(false)
    if (ok) onClose()
  }

  return (
    <div className="sp-box sp-form">
      <div className="sp-row-between"><b style={{ fontSize: 16 }}>Nova marcação</b><button className="sp-x" aria-label="Fechar" onClick={onClose}>×</button></div>
      <label className="sp-field">Cliente<input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Nome da cliente" /></label>
      <label className="sp-field">Telemóvel<input value={f.phone} onChange={(e) => set({ phone: formatPhone(e.target.value, shop.country) })} placeholder={shop.country === 'PT' ? '912 345 678' : '(11) 90000-0000'} inputMode="tel" /></label>
      {pros.length > 1 && (
        <label className="sp-field">Profissional<select value={f.pro} onChange={(e) => set({ pro: e.target.value, pick: '' })}>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      )}
      <label className="sp-field">Serviço
        <select value={f.service} onChange={(e) => set({ service: e.target.value })}>
          {services.filter((s) => s.active || s.id === f.service).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.price_cents > 0 ? eur(s.price_cents) : 'sem preço'}</option>)}
        </select>
      </label>
      <label className="sp-field">Dia<input type="date" value={f.date} min={today} onChange={(e) => set({ date: e.target.value, pick: '' })} /></label>
      <div className="sp-field">Horário
        {free.length > 0 && (
          <div className="sp-chips">
            {free.map((s) => (
              <button key={s.id} className={'sp-chip-free' + (f.pick === s.starts_at ? ' on' : '')} onClick={() => set({ pick: f.pick === s.starts_at ? '' : s.starts_at, time: '' })}>{hourLabel(s.starts_at, tz)}</button>
            ))}
          </div>
        )}
        <div className="sp-or">ou outro:<input type="time" step={1800} value={f.time} onChange={(e) => set({ time: e.target.value, pick: '' })} /></div>
      </div>
      {err && <div className="sp-err">{err}</div>}
      <button className="sp-btn-dark" disabled={sending} onClick={save}>{sending ? 'A marcar…' : 'Marcar'}</button>
      <small className="sp-sub" style={{ textAlign: 'center' }}>O horário sai das vagas do site na hora.</small>
    </div>
  )
}

/* ---------------------------------- Lembretes ---------------------------------- */

type RemRow = { a: Appointment; kind: 'due' | 'wait' | 'next' | 'ok'; canSend: boolean; note: string; tone: '' | 'wait' | 'late' | 'soon' | 'later' | 'ok' }

function reminderLists(ctx: Ctx) {
  const { data: { shop, appointments }, tz, today, now, dayOf } = ctx
  const maxDays = shop.remind_max_days ?? 3
  const diff = (day: string) => Math.round((Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8)) - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8))) / 86400000)
  const fut = appointments.filter((a) => a.status === 'pending' && dayOf(a) > today).sort((x, y) => x.starts_at.localeCompare(y.starts_at))
  const confirmUntil = toMinutes((shop.confirm_until || '22:00').slice(0, 5))
  const late = (a: Appointment) => {
    const sentDay = zoned(new Date(a.reminder_sent_at!), tz).key
    return now >= atLocal(sentDay, confirmUntil, tz)
  }
  const due: RemRow[] = fut.filter((a) => !a.reminder_sent_at && diff(dayOf(a)) <= 1).map((a) => ({ a, kind: 'due', canSend: true, note: '', tone: '' }))
  const wait: RemRow[] = fut.filter((a) => a.reminder_sent_at && !a.client_confirmed_at).map((a) => {
    const l = late(a)
    return { a, kind: 'wait', canSend: false, note: l ? `Passou das ${hh(shop.confirm_until)} sem resposta` : `À espera de confirmação até às ${hh(shop.confirm_until)}`, tone: l ? 'late' : 'wait' }
  })
  const next: RemRow[] = fut.filter((a) => !a.reminder_sent_at && diff(dayOf(a)) > 1).map((a) => {
    const d = diff(dayOf(a))
    const ok = d <= maxDays
    const from = addDays(dayOf(a), -maxDays)
    return { a, kind: 'next', canSend: ok, note: ok ? 'Pode enviar já' : `Envio a partir de ${Number(from.slice(8))}/${Number(from.slice(5, 7))}`, tone: ok ? 'soon' : 'later' }
  })
  const ok: RemRow[] = fut.filter((a) => a.reminder_sent_at && a.client_confirmed_at).map((a) => ({ a, kind: 'ok', canSend: false, note: '✓ Confirmou que vem', tone: 'ok' }))
  return { due, wait, next, ok }
}

function Reminders({ ctx, rem }: { ctx: Ctx; rem: ReturnType<typeof reminderLists> }) {
  const { data: { shop }, tz, today, dayOf, run, shopName } = ctx
  const [lt, setLt] = useState<'hoje' | 'prox' | 'ok'>('hoje')
  const need = rem.due.length + rem.wait.length
  const list = lt === 'hoje' ? [...rem.due, ...rem.wait] : lt === 'prox' ? rem.next : rem.ok
  const until = hh(shop.confirm_until)
  const msg = (a: Appointment) => {
    const d = dayOf(a)
    const when = d === addDays(today, 1) ? `amanhã, ${shortDay(d)}` : shortDay(d)
    return `Olá ${firstName(a.client_name)}! Lembrete da sua marcação de ${a.service_name} na ${shopName} ${when} às ${hourLabel(a.starts_at, tz)}. Por favor confirme até às ${until} de hoje respondendo SIM. Obrigada!`
  }
  const tabs: ['hoje' | 'prox' | 'ok', string, number, boolean][] = [['hoje', 'Enviar hoje', need, true], ['prox', 'Próximos', rem.next.length, false], ['ok', 'Confirmados', rem.ok.length, false]]
  const hint = lt === 'hoje' ? `Clientes de amanhã. Depois de enviar, a cliente confirma até às ${until}.`
    : lt === 'prox' ? `Pode enviar mais cedo, até ${shop.remind_max_days ?? 3} dias antes da marcação.` : 'Clientes que já confirmaram que vêm.'

  return (
    <>
      <h3 className="sp-h">Lembretes</h3>
      <div className="sp-seg sp-seg-full">
        {tabs.map(([k, l, n, alert]) => (
          <button key={k} className={lt === k ? 'on' : ''} onClick={() => setLt(k)}>{l}{n > 0 && <span className={'sp-seg-n' + (alert ? ' alert' : '')}>{n}</span>}</button>
        ))}
      </div>
      <p className="sp-hint">{hint}</p>
      {list.length === 0 && <div className="sp-box sp-empty">{lt === 'hoje' ? 'Tudo em dia ✓' : lt === 'prox' ? 'Sem marcações nos próximos dias.' : 'Ainda ninguém confirmou.'}</div>}
      <div className="sp-list">
        {list.map((r) => {
          const wa = waLink(r.a, shop, msg(r.a))
          return (
            <div key={r.a.id} className={'sp-rem ' + r.tone}>
              <div className="sp-rem-main">
                <b>{r.a.client_name}</b>
                <small>{shortDay(dayOf(r.a))} às {hourLabel(r.a.starts_at, tz)} · {r.a.service_name}</small>
                {r.note && <small className={'sp-rem-note ' + r.tone}>{r.note}</small>}
              </div>
              <div className="sp-rem-actions">
                {r.canSend && (wa
                  ? <a className="sp-btn-send" href={wa} target="_blank" rel="noopener" onClick={() => run('panel_mark_reminder', { p_id: r.a.id, p_sent: true })}>Enviar</a>
                  : <span className="sp-sub">Sem telemóvel</span>)}
                {r.kind === 'wait' && <button className="sp-btn-ok" onClick={() => run('panel_mark_client_confirmed', { p_id: r.a.id, p_ok: true })}>Confirmou</button>}
                {(r.kind === 'wait' || r.kind === 'ok') && <button className="sp-link-muted" onClick={() => run('panel_mark_reminder', { p_id: r.a.id, p_sent: false })}>Desfazer</button>}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ---------------------------------- Calendário ---------------------------------- */

function Calendar({ ctx, month, setMonth, sel, setSel }: { ctx: Ctx; month: string; setMonth: (m: string) => void; sel?: string; setSel: (d: string) => void }) {
  const { data, tz, today, dayOf, run } = ctx
  const { shop } = data
  const pros = data.professionals.filter((p) => p.active)
  const [pro, setPro] = useState(pros[0]?.id || '')
  const [newTime, setNewTime] = useState('11:00')
  const [slotErr, setSlotErr] = useState('')
  const [info, setInfo] = useState<string | null>(null)
  const [ask, setAsk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const curMonth = today.slice(0, 7)
  const maxMonth = addMonths(curMonth, CAL_MONTHS_AHEAD)
  const selDay = sel && sel.slice(0, 7) === month ? sel : month === curMonth ? today : `${month}-01`

  const dirty = data.slots.some((s) => s.in_draft !== s.published)

  // Linhas de cada dia: vagas do rascunho + marcações (mesmo sem vaga).
  const byDay = useMemo(() => {
    const m = new Map<string, { t: number; slot?: SlotRow; appt?: Appointment }[]>()
    const key = (iso: string) => new Date(iso).getTime()
    const appts = data.appointments.filter((a) => a.professional_id === pro && a.status !== 'cancelled')
    const apptAt = new Map(appts.map((a) => [key(a.starts_at), a]))
    for (const s of data.slots) {
      if (s.professional_id !== pro || !s.in_draft) continue
      const d = dayOf(s)
      if (!m.has(d)) m.set(d, [])
      m.get(d)!.push({ t: key(s.starts_at), slot: s, appt: apptAt.get(key(s.starts_at)) })
    }
    for (const a of appts) {
      const d = dayOf(a)
      const rows = m.get(d) || []
      if (!rows.some((r) => r.t === key(a.starts_at))) rows.push({ t: key(a.starts_at), appt: a, slot: data.slots.find((s) => s.professional_id === pro && key(s.starts_at) === key(a.starts_at)) })
      m.set(d, rows)
    }
    m.forEach((rows) => rows.sort((x, y) => x.t - y.t))
    return m
  }, [data.slots, data.appointments, pro, dayOf])

  const nDays = daysInMonth(month)
  const lead = (weekdayOf(`${month}-01`) + 6) % 7
  const rows = byDay.get(selDay) || []
  const freeIds = rows.filter((r) => r.slot && !r.appt).map((r) => r.slot!.id)
  const dep = shop.deposit_cents ?? 1000

  const act = async (fn: string, args: Record<string, unknown>, ok?: string) => { setBusy(true); const r = await run(fn, args, ok); setBusy(false); return r }

  const addSlot = async () => {
    if (!newTime) return
    setSlotErr('')
    const start = atLocal(selDay, toMinutes(newTime), tz)
    if (start <= new Date()) return setSlotErr('Esse horário já passou.')
    if (rows.some((r) => r.t === start.getTime())) return setSlotErr('Esse horário já existe neste dia.')
    await act('panel_add_slot', { p_professional_id: pro, p_starts_at: start.toISOString() })
  }

  const depMsg = (a: Appointment) => `Olá ${firstName(a.client_name)}! Para confirmar a sua marcação de ${a.service_name} (${shortDay(dayOf(a))} às ${hourLabel(a.starts_at, tz)}) peço um sinal de ${eur(dep)}, descontado no valor final. Pode enviar por MB WAY. Se faltar sem avisar, o sinal não é devolvido. Obrigada!`

  return (
    <>
      <div className="sp-stack">
        <div className="sp-row-between"><h3 className="sp-h">Calendário</h3><span className={'sp-pub ' + (dirty ? 'draft' : 'ok')}>{dirty ? 'Por publicar' : 'Publicado no site'}</span></div>
        <MonthBar label={monthTitle(month)} prev={month > curMonth ? () => setMonth(addMonths(month, -1)) : undefined} next={month < maxMonth ? () => setMonth(addMonths(month, 1)) : undefined} />
        {pros.length > 1 && (
          <div className="sp-seg">{pros.map((p) => <button key={p.id} className={pro === p.id ? 'on' : ''} onClick={() => setPro(p.id)}>{firstName(p.name)}</button>)}</div>
        )}
      </div>

      <div className="sp-cal-wrap">
        <div className="sp-box sp-cal">
          <div className="sp-cal-grid sp-cal-head">{['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((w, i) => <span key={i}>{w}</span>)}</div>
          <div className="sp-cal-grid">
            {Array.from({ length: lead }, (_, i) => <span key={'l' + i} />)}
            {Array.from({ length: nDays }, (_, i) => {
              const d = `${month}-${String(i + 1).padStart(2, '0')}`
              const past = d < today
              const r = byDay.get(d) || []
              const free = r.filter((x) => x.slot && !x.appt && new Date(x.t) > new Date()).length
              const cl = r.filter((x) => x.appt).map((x) => x.appt!)
              const tone = !cl.length ? '' : cl.some((a) => (a.deposit_status || 'pending') === 'pending') ? ' t-pending' : cl.some((a) => a.deposit_status === 'sent') ? ' t-sent' : ' t-paid'
              const sub = past ? '' : !r.length ? '·' : free ? `${free} livre${free > 1 ? 's' : ''}` : 'lotado'
              const subCls = !r.length ? 'none' : free ? 'free' : 'full'
              return (
                <button key={d} disabled={past} onClick={() => { setSel(d); setSlotErr(''); setInfo(null); setAsk(null) }}
                  className={'sp-cal-day' + tone + (d === today ? ' today' : '') + (d === selDay ? ' sel' : '') + (past ? ' past' : '')}>
                  <span>{i + 1}</span><small className={subCls}>{sub}</small>
                </button>
              )
            })}
          </div>
          <div className="sp-legend">
            <span><i className="dot free" />vagas livres</span><span><i className="dot full" />lotado</span><span><i className="dot none" />sem horário</span>
          </div>
          <div className="sp-legend">
            <span><i className="sq t-pending" />sinal pendente</span><span><i className="sq t-sent" />sinal enviado</span><span><i className="sq t-paid" />sinal pago</span>
          </div>
        </div>

        <div className="sp-box sp-detail">
          <div className="sp-row-between">
            <b style={{ fontSize: 16 }}>{shortDay(selDay)}</b>
            {freeIds.length > 0 && <button className="sp-link-alert" disabled={busy} onClick={() => act('panel_remove_slots', { p_ids: freeIds })}>Tirar vagas livres</button>}
          </div>
          {rows.length === 0 && <p className="sp-sub" style={{ margin: 0, fontSize: 14 }}>Sem horários neste dia. Adicione abaixo.</p>}
          <div className="sp-list sp-list-tight">
            {rows.map((r) => {
              const a = r.appt
              if (!a) return (
                <div key={r.t} className="sp-slot free">
                  <div className="sp-slot-row">
                    <div className="sp-slot-l"><b>{hourLabel(new Date(r.t), tz)}</b><span>Livre</span></div>
                    <button className="sp-x" aria-label="Remover horário" disabled={busy} onClick={() => act('panel_remove_slots', { p_ids: [r.slot!.id] })}>×</button>
                  </div>
                </div>
              )
              const st = a.deposit_status || 'pending'
              const open = info === a.id
              const asking = ask === a.id
              const askWa = waLink(a, shop, depMsg(a))
              return (
                <div key={r.t} className={'sp-slot d-' + st}>
                  <div className="sp-slot-row">
                    <div className="sp-slot-l"><b>{hourLabel(a.starts_at, tz)}</b><span>{a.client_name}</span></div>
                    <button className={'sp-x sp-info' + (open ? ' on' : '')} aria-label="Ver dados da cliente" aria-expanded={open} title="Mais informações" onClick={() => { setInfo(open ? null : a.id); setAsk(null) }}><IconInfo /></button>
                  </div>
                  {open && (
                    <div className="sp-info-box">
                      <div className="sp-kv"><span>Serviço</span><b>{a.service_name}</b></div>
                      <div className="sp-kv"><span>Telemóvel</span>{a.client_phone ? <a href={`tel:+${phoneDigits(a, shop)}`}>{displayPhone(a.client_phone, shop.country)}</a> : <b>—</b>}</div>
                      <div className="sp-kv"><span>Marcado em</span><b>{(() => { const z = zoned(new Date(a.created_at), tz); return `${z.d}/${z.m} às ${timeLabel(a.created_at, tz)}` })()}{a.source === 'site' ? ' · site' : ''}</b></div>
                      <div className="sp-kv"><span>Estado</span><b className={st === 'paid' ? 'c-ok' : 'c-warn'}>{a.status === 'done' ? 'Concluída' : a.status === 'noshow' ? 'Faltou' : st === 'paid' ? 'Confirmada' : 'Por confirmar'}</b></div>
                      <div className="sp-dep">
                        <div className="sp-row-between"><span className="sp-sub" style={{ fontSize: 13 }}>Sinal · {eur(isPaid(a) ? depositOf(a, shop) : dep)}</span>
                          <span className={'sp-dep-chip ' + st}>{st === 'paid' ? '✓ Pago' : st === 'sent' ? '● Pedido enviado' : '● Pendente'}</span></div>
                        {st !== 'paid' && (
                          <div className="sp-grid2">
                            {askWa
                              ? <a className="sp-btn-line" href={askWa} target="_blank" rel="noopener" onClick={() => { if (st === 'pending') run('panel_set_deposit', { p_id: a.id, p_status: 'sent' }) }}>{st === 'sent' ? 'Reenviar pedido' : 'Pedir sinal'}</a>
                              : <button className="sp-btn-line" disabled={busy} onClick={() => act('panel_set_deposit', { p_id: a.id, p_status: 'sent' })}>Pedido enviado</button>}
                            <button className="sp-btn-dark sp-btn-40" disabled={busy} onClick={() => act('panel_set_deposit', { p_id: a.id, p_status: 'paid' }, 'Sinal pago · marcação confirmada')}>Sinal pago</button>
                          </div>
                        )}
                        {st === 'sent' && <button className="sp-link-muted" onClick={() => act('panel_set_deposit', { p_id: a.id, p_status: 'pending' })}>Desfazer pedido enviado</button>}
                        {st === 'paid' && <button className="sp-link-muted" onClick={() => act('panel_set_deposit', { p_id: a.id, p_status: 'sent' })}>Desfazer</button>}
                      </div>
                      <div className="sp-cancel">
                        {!asking ? <button className="sp-btn-cancel" onClick={() => setAsk(a.id)}>Cancelar marcação</button> : (
                          <div className="sp-stack-6">
                            <b style={{ fontSize: 13 }}>Cancelar a marcação de {firstName(a.client_name)}?</b>
                            <button className="sp-opt dark" disabled={busy} onClick={async () => { if (await act('panel_cancel_appointment', { p_id: a.id, p_keep_slot: true }, 'Marcação cancelada · a vaga voltou ao site')) { setAsk(null); setInfo(null) } }}>
                              <span>Manter horário</span><small>Remove a cliente e a vaga volta a ficar livre no site</small></button>
                            <button className="sp-opt" disabled={busy} onClick={async () => { if (await act('panel_cancel_appointment', { p_id: a.id, p_keep_slot: false }, 'Marcação e horário removidos')) { setAsk(null); setInfo(null) } }}>
                              <span>Remover horário e cliente</span><small>O horário deixa de existir neste dia</small></button>
                            <button className="sp-link-muted sp-back" onClick={() => setAsk(null)}>Voltar</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {selDay >= today && (
            <div className="sp-add">
              <input type="time" step={1800} value={newTime} onChange={(e) => { setNewTime(e.target.value); setSlotErr('') }} aria-label="Hora da nova vaga" />
              <button className="sp-btn-soft" disabled={busy} onClick={addSlot}>+ Adicionar</button>
            </div>
          )}
          {slotErr && <div className="sp-err">{slotErr}</div>}
        </div>
      </div>

      <button className={'sp-publish' + (dirty ? ' dirty' : '')} disabled={!dirty || busy} onClick={() => act('panel_publish_slots', {}, 'Horários publicados no site')}>{dirty ? 'Publicar horários no site' : 'Tudo publicado'}</button>
      {dirty && <button className="sp-discard" disabled={busy} onClick={() => act('panel_discard_slots', {}, 'Alterações canceladas')}>Cancelar alterações</button>}
    </>
  )
}

function MonthBar({ label, prev, next }: { label: string; prev?: () => void; next?: () => void }) {
  return (
    <div className="sp-monthbar">
      <button className="sp-round" aria-label="Mês anterior" disabled={!prev} onClick={prev}><IconLeft /></button>
      <span>{label}</span>
      <button className="sp-round" aria-label="Próximo mês" disabled={!next} onClick={next}><IconRight /></button>
    </div>
  )
}

/* ----------------------------------- Serviços ----------------------------------- */

const centsToInput = (c: number) => (c % 100 ? (c / 100).toFixed(2).replace('.', ',') : String(c / 100))
const inputToCents = (v: string) => Math.round(Number(v.replace(/\./g, '').replace(',', '.') || 0) * 100)

function Services({ ctx }: { ctx: Ctx }) {
  const { data: { shop, services }, run, token } = ctx
  const [dep, setDep] = useState(centsToInput(shop.deposit_cents ?? 1000))
  useEffect(() => setDep(centsToInput(shop.deposit_cents ?? 1000)), [shop.deposit_cents])
  const saveDep = () => { const c = inputToCents(dep); if (c !== shop.deposit_cents) run('panel_save_deposit', { p_cents: c }, 'Sinal salvo') }

  return (
    <>
      <div><h3 className="sp-h">Serviços</h3><p className="sp-sub">O que muda aqui aparece no site na hora.</p></div>
      <div className="sp-box sp-svc">
        <div className="sp-svc-row sp-svc-head"><span>Serviço</span><span>Preço €</span><span>Min</span><span /></div>
        {services.map((s) => <ServiceRow key={s.id} s={s} run={run} />)}
        <button className="sp-btn-soft" onClick={() => run('panel_save_service', { p_id: null, p_name: 'Novo serviço', p_price_cents: 0, p_duration_min: 30, p_active: true })}>+ Adicionar serviço</button>
      </div>
      <div className="sp-box sp-row-between sp-deposit">
        <div><b>Sinal</b><small>Descontado no pagamento final</small></div>
        <div className="sp-dep-input"><input value={dep} onChange={(e) => setDep(e.target.value.replace(/[^\d,]/g, ''))} onBlur={saveDep} inputMode="decimal" aria-label="Valor do sinal" /><b>€</b></div>
      </div>
      <ShopData shop={shop} run={run} token={token} />
    </>
  )
}

function ServiceRow({ s, run }: { s: Service; run: Run }) {
  const [name, setName] = useState(s.name)
  const [price, setPrice] = useState(centsToInput(s.price_cents))
  const [dur, setDur] = useState(String(s.duration_min))
  const [ask, setAsk] = useState(false)
  useEffect(() => { setName(s.name); setPrice(centsToInput(s.price_cents)); setDur(String(s.duration_min)) }, [s])
  const save = () => {
    const cents = inputToCents(price)
    const d = Math.min(480, Math.max(5, Number(dur) || 30))
    if (name.trim() === s.name && cents === s.price_cents && d === s.duration_min) return
    run('panel_save_service', { p_id: s.id, p_name: name, p_price_cents: cents, p_duration_min: d, p_active: s.active }, 'Salvo')
  }
  return (
    <>
      <div className="sp-svc-row">
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} aria-label="Nome do serviço" />
        <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d,]/g, ''))} onBlur={save} inputMode="decimal" aria-label="Preço" />
        <input value={dur} onChange={(e) => setDur(e.target.value.replace(/\D/g, ''))} onBlur={save} inputMode="numeric" aria-label="Duração" />
        <button className="sp-x sp-x-32" aria-label="Remover serviço" onClick={() => setAsk(!ask)}>×</button>
      </div>
      {ask && (
        <div className="sp-confirm-inline">
          <span>Remover “{s.name}” do site?</span>
          <button className="sp-link-muted" onClick={() => setAsk(false)}>Manter</button>
          <button className="sp-link-alert" onClick={() => run('panel_delete_service', { p_id: s.id }, 'Serviço removido')}>Remover</button>
        </div>
      )}
    </>
  )
}

function ShopData({ shop, run, token }: { shop: Shop; run: Run; token: string }) {
  const init = () => ({
    whatsapp: shop.whatsapp ? displayPhone(shop.whatsapp, shop.country) : '', instagram: shop.instagram || '', tiktok: shop.tiktok || '',
    address: shop.address || '', city: shop.city || '',
  })
  const [f, setF] = useState(init)
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState('')
  useEffect(() => setF(init()), [shop]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setOrigin(window.location.origin), [])
  const field = (k: keyof ReturnType<typeof init>, label: string, ph = '') => (
    <label className="sp-field">{label}<input value={f[k]} placeholder={ph} inputMode={k === 'whatsapp' ? 'tel' : undefined}
      onChange={(e) => setF({ ...f, [k]: k === 'whatsapp' ? formatPhone(e.target.value, shop.country) : e.target.value })} /></label>
  )
  const save = async () => {
    const wa = f.whatsapp.replace(/\D/g, '')
    if (await run('panel_save_shop', { p_data: {
      whatsapp: wa ? waNumber(wa, shop.country) : '', instagram: f.instagram.replace('@', ''), tiktok: f.tiktok.replace('@', ''),
      address: f.address, city: f.city,
    } }, 'Dados do salão salvos')) setOpen(false)
  }
  return (
    <div className="sp-box sp-form">
      <button className="sp-acc-btn" aria-expanded={open} onClick={() => setOpen(!open)}><span><b>Dados do salão e links</b><small>WhatsApp, redes sociais e morada que aparecem no site</small></span><span className="sp-sign">{open ? '−' : '+'}</span></button>
      {open && (
        <>
          {field('whatsapp', 'WhatsApp do salão', shop.country === 'PT' ? '912 345 678' : '')}
          {field('instagram', 'Instagram', '@')}
          {field('tiktok', 'TikTok', '@')}
          {field('address', 'Morada')}
          {field('city', 'Cidade')}
          <button className="sp-btn-dark" onClick={save}>Salvar dados</button>
          <CopyLine label="Site de marcação (divulgue no Instagram)" value={`${origin}/${shop.slug}`} />
          <CopyLine label="Painel (não partilhe: quem tem o link mexe na agenda)" value={`${origin}/painel/${token}`} />
        </>
      )}
    </div>
  )
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="sp-field">{label}
      <div className="sp-copy">
        <input readOnly value={value} onFocus={(e) => e.target.select()} />
        <button className="sp-btn-soft" onClick={() => { navigator.clipboard?.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500) }}>{ok ? 'Copiado' : 'Copiar'}</button>
      </div>
    </div>
  )
}

/* ---------------------------------- Relatório ---------------------------------- */

function Report({ ctx, month, setMonth }: { ctx: Ctx; month: string; setMonth: (m: string) => void }) {
  const { data: { shop, appointments }, tz, today, now, dayOf } = ctx
  const [mode, setMode] = useState<'dia' | 'mes'>('dia')
  const isMonth = mode === 'mes'
  const curMonth = today.slice(0, 7)
  const firstMonth = zoned(new Date(shop.created_at), tz).key.slice(0, 7)
  const rows = appointments
    .filter((a) => (isMonth ? dayOf(a).slice(0, 7) === month : dayOf(a) === today))
    .map((a) => {
      const amt = received(a, shop)
      const dep = depositOf(a, shop)
      const paid = isPaid(a)
      const future = a.status === 'pending' && new Date(a.starts_at) > now
      const detail = a.status === 'done'
        ? (paid ? `${a.service_name} · ${eur(dep)} sinal + ${eur(Math.max(0, a.price_cents - dep))} no final` : `${a.service_name} · pago no final`)
        : a.status === 'noshow' ? (paid ? 'Faltou · só o sinal' : 'Faltou · sem sinal')
        : `${a.service_name} · ${paid ? (future ? 'sinal pago · por concluir' : 'por concluir · sinal recebido') : 'sinal por pagar'}`
      const z = zoned(new Date(a.starts_at), tz)
      return { a, amt, detail, time: isMonth ? `${z.d}/${z.m} ${timeLabel(a.starts_at, tz)}` : timeLabel(a.starts_at, tz) }
    })
  const done = rows.filter((r) => r.a.status === 'done')
  const ns = rows.filter((r) => r.a.status === 'noshow')
  const pend = rows.filter((r) => r.a.status === 'pending')
  const total = rows.reduce((n, r) => n + r.amt, 0)
  const toCome = pend.reduce((n, r) => n + Math.max(0, r.a.price_cents - r.amt), 0)
  const longDate = now.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz })
  const when = isMonth ? 'no mês' : 'hoje'

  return (
    <>
      <div className="sp-stack">
        <div className="sp-row-between">
          <h3 className="sp-h">Relatório</h3>
          <div className="sp-seg"><button className={!isMonth ? 'on' : ''} onClick={() => setMode('dia')}>Hoje</button><button className={isMonth ? 'on' : ''} onClick={() => setMode('mes')}>Mês</button></div>
        </div>
        {isMonth
          ? <MonthBar label={monthTitle(month)} prev={month > firstMonth ? () => setMonth(addMonths(month, -1)) : undefined} next={month < curMonth ? () => setMonth(addMonths(month, 1)) : undefined} />
          : <p className="sp-sub">{longDate}</p>}
      </div>
      <div className="sp-total">
        <span>Total recebido</span><b>{eur(total)}</b>
        <small>{toCome ? `ainda por receber ${when}: ${eur(toCome)}` : `nada por receber ${when}`}</small>
      </div>
      <div className="sp-grid2 sp-grid-10">
        <div className="sp-box sp-kpi"><div>Concluídos</div><b className="c-ok">{eur(done.reduce((n, r) => n + r.amt, 0))}</b><small>{done.length} atendimento{done.length === 1 ? '' : 's'}</small></div>
        <div className="sp-box sp-kpi"><div>Faltas</div><b className="c-bad">{eur(ns.reduce((n, r) => n + r.amt, 0))}</b><small>{ns.length} falta{ns.length === 1 ? '' : 's'} · só sinal</small></div>
      </div>
      <div className="sp-box sp-lines">
        {rows.length === 0 && <p className="sp-sub" style={{ margin: '12px 0', fontSize: 14 }}>{isMonth ? 'Sem atendimentos neste mês.' : 'Sem atendimentos hoje.'}</p>}
        {rows.map((r) => (
          <div key={r.a.id} className="sp-line-row">
            <div><b>{r.time} · {r.a.client_name}</b><small>{r.detail}</small></div>
            <b className={r.a.status === 'done' ? 'c-ok' : r.a.status === 'noshow' ? 'c-bad' : r.amt ? 'c-muted' : 'c-faint'}>{eur(r.amt)}</b>
          </div>
        ))}
      </div>
    </>
  )
}

/* --------------------------------- Notificações --------------------------------- */

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function b64ToBytes(s: string) {
  const raw = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

type Push = ReturnType<typeof usePush>

// Inscrição deste aparelho nas notificações push.
function usePush(token: string) {
  const [supported, setSupported] = useState(false)
  const [sub, setSub] = useState<PushSubscription | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setReady(true); return }
    setSupported(true)
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((r) => r.pushManager.getSubscription())
      .then((s) => { setSub(s); setReady(true) })
      .catch(() => setReady(true))
  }, [])

  const enable = async (): Promise<string | null> => {
    if (!supported) return 'Este navegador não recebe notificações. No iPhone, adicione o painel ao ecrã principal e abra-o pelo ícone.'
    if (!VAPID) return 'As notificações ainda não estão configuradas no servidor.'
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return 'Permissão negada. Ative as notificações nas definições do telemóvel.'
    try {
      const reg = await navigator.serviceWorker.ready
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) })
      const { error } = await supabase.rpc('panel_save_push_subscription', { p_token: token, p_sub: s.toJSON() })
      if (error) return errorMessage(error)
      setSub(s)
      return null
    } catch (e) {
      return errorMessage(e)
    }
  }
  const disable = async () => {
    if (!sub) return
    await supabase.rpc('panel_disable_push_subscription', { p_token: token, p_endpoint: sub.endpoint })
    await sub.unsubscribe().catch(() => {})
    setSub(null)
  }
  const test = async () => {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification('Notificação de teste', { body: 'Assim vai ver os avisos do painel.', icon: '/media/danieela-logo.png' })
  }
  return { supported, subscribed: !!sub, ready, enable, disable, test }
}

function Notifications({ ctx, push }: { ctx: Ctx; push: Push }) {
  const { data, run, flash } = ctx
  const [p, setP] = useState<NotificationPrefs>(data.notification_prefs)
  const [busy, setBusy] = useState(false)
  useEffect(() => setP(data.notification_prefs), [data.notification_prefs])
  const save = (patch: Partial<NotificationPrefs>) => { setP({ ...p, ...patch }); run('panel_save_notification_prefs', { p_data: patch }) }
  const device = typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent) ? 'Neste iPhone' : 'Neste aparelho'
  const aLbl = p.before_min >= 60 ? `${p.before_min / 60}h` : `${p.before_min} min`
  const opts = <T extends number>(cur: T, list: [T, string][], k: keyof NotificationPrefs) => (
    <div className="sp-chips">{list.map(([v, l]) => <button key={v} className={'sp-opt-chip' + (cur === v ? ' on' : '')} onClick={() => save({ [k]: v } as Partial<NotificationPrefs>)}>{l}</button>)}</div>
  )
  const types: { k: keyof NotificationPrefs; ic: string; tone: string; title: string; desc: string; extra?: React.ReactNode }[] = [
    { k: 'new_booking', ic: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0', tone: 'rose', title: 'Nova marcação', desc: 'Quando alguém marca pelo site' },
    { k: 'before_appt', ic: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M5 3L2 6M19 3l3 3', tone: 'blue', title: 'Antes do atendimento', desc: `Aviso ${aLbl} antes de cada cliente`,
      extra: opts(p.before_min, [[30, '30 min'], [60, '1h'], [120, '2h']], 'before_min') },
    { k: 'reminders_due', ic: 'M22 2L11 13M22 2l-7 20-4-9-9-4z', tone: 'yellow', title: 'Lembretes por enviar', desc: `Todos os dias às ${p.reminders_hour}h`,
      extra: opts(p.reminders_hour, [[9, '9h'], [10, '10h'], [12, '12h'], [18, '18h']], 'reminders_hour') },
    { k: 'not_confirmed', ic: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01', tone: 'red', title: 'Cliente não confirmou', desc: `Às ${hh(data.shop.confirm_until)}, se alguém não respondeu ao lembrete` },
    { k: 'deposit_missing', ic: 'M17 6.5A7 7 0 1 0 17 17.5M4 10h9M4 14h9', tone: 'green', title: 'Sinal por pedir', desc: 'Quando uma marcação nova ainda não tem sinal' },
  ]

  return (
    <>
      <div><h3 className="sp-h">Notificações</h3><p className="sp-sub">Receba avisos no telemóvel sem abrir o painel.</p></div>
      {push.ready && !push.subscribed && (
        <div className="sp-dark-card">
          <b style={{ fontSize: 16 }}>Ativar em 2 passos</b>
          <div className="sp-step"><span>1</span><div>No Safari, toque em <b>Partilhar</b> <IconShare /> e depois em <b>Adicionar ao ecrã principal</b>.</div></div>
          <div className="sp-step"><span>2</span><div>Abra o painel pelo ícone no ecrã e toque no botão abaixo.</div></div>
          <button className="sp-btn-acc sp-btn-50" disabled={busy} onClick={async () => { setBusy(true); const e = await push.enable(); setBusy(false); flash(e || 'Notificações ativas') }}>{busy ? 'A ativar…' : 'Ativar notificações'}</button>
        </div>
      )}
      {push.subscribed && (
        <div className="sp-on-card">
          <div><b>✓ Notificações ativas</b><small>{device}</small></div>
          <div className="sp-on-actions">
            <button className="sp-btn-okline" onClick={() => push.test().catch(() => flash('Não foi possível mostrar o teste.'))}>Enviar teste</button>
            <button className="sp-link-muted" onClick={() => push.disable()}>Desligar</button>
          </div>
        </div>
      )}
      <div className={'sp-box sp-lines' + (push.subscribed ? '' : ' faded')}>
        {types.map((t) => (
          <div key={t.k} className="sp-notif">
            <div className="sp-notif-l">
              <span className={'sp-notif-ic ' + t.tone}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.ic} /></svg></span>
              <div><b>{t.title}</b><small>{t.desc}</small>{p[t.k] && t.extra}</div>
            </div>
            <button className={'sp-toggle' + (p[t.k] ? ' on' : '')} role="switch" aria-checked={!!p[t.k]} aria-label={t.title} onClick={() => save({ [t.k]: !p[t.k] } as Partial<NotificationPrefs>)}><span /></button>
          </div>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------ Ícones ------------------------------------ */

const ic = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const s18 = { ...ic, width: 18, height: 18 }
const s16 = { ...ic, width: 16, height: 16 }
const IconToday = () => <svg {...ic}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
const IconBell = () => <svg {...s18}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
const IconBellNav = () => <svg {...ic}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
const IconGrid = () => <svg {...ic}><rect x="3.5" y="4.5" width="17" height="16" rx="3" /><path d="M3.5 9.5h17M9 9.5v11M15 9.5v11M3.5 15h17" /></svg>
const IconList = () => <svg {...ic}><path d="M4 7h16M4 12h16M4 17h10" /></svg>
const IconChart = () => <svg {...ic}><path d="M5 20V11M12 20V5M19 20v-6" /></svg>
const IconMoon = () => <svg {...s18}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
const IconSun = () => <svg {...s18}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
const IconWa = () => <svg {...s16}><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.6z" /><path d="M9 9.5c.3 1.8 1.7 3.9 4.2 5 .6.2 1.1-.1 1.4-.6l.4-.7-1.8-1-.7.6c-.8-.4-1.5-1.1-1.9-1.9l.6-.7-1-1.8-.7.4c-.4.2-.6.6-.5.7z" /></svg>
const IconX = () => <svg {...s16} strokeWidth={2.4}><path d="M7 7l10 10M17 7L7 17" /></svg>
const IconCheck = () => <svg {...s16} strokeWidth={2.4}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
const IconInfo = () => <svg {...s18}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
const IconLeft = () => <svg {...s18} strokeWidth={2.2}><path d="M15 6l-6 6 6 6" /></svg>
const IconRight = () => <svg {...s18} strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></svg>
const IconShare = () => <svg {...s16} style={{ display: 'inline', verticalAlign: -3 }}><path d="M12 3v12M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>

const NAV: [Exclude<Tab, 'notif'>, string, () => React.JSX.Element][] = [
  ['hoje', 'Hoje', IconToday], ['lemb', 'Lembretes', IconBellNav], ['cal', 'Calendário', IconGrid], ['serv', 'Serviços', IconList], ['rel', 'Relatório', IconChart],
]
