'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, errorMessage } from '@/lib/supabase'
import { DEMO_PANEL_TOKEN } from '@/lib/demo'
import SlotsPanel from './SlotsPanel'
import type { Appointment, Professional, ProfessionalHours, Block, Service, Shop } from '@/lib/types'
import {
  addDays, atLocal, dayLabel, displayPhone, formatPhone, money, initials, monthName, scheduleLabels,
  timeLabel, todayKey, toMinutes, waNumber, WEEKDAYS, weekdayOf, zoned,
} from '@/lib/time'

type Data = { shop: Shop; professionals: Professional[]; services: Service[]; appointments: Appointment[]; blocks: Block[] }
type Tab = 'hoje' | 'folgas' | 'servicos' | 'relatorio'

const STATUS_LABEL = { pending: 'Agendado', done: 'Concluído', noshow: 'Faltou', cancelled: 'Cancelado' }

export default function Panel({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<Tab>('hoje')
  const [filter, setFilter] = useState('all')
  const [reg, setReg] = useState<RegState | null>(null)
  const [toast, setToast] = useState('')
  const [ask, setAsk] = useState<Ask | null>(null)
  const [monthKey, setMonthKey] = useState<string>()
  const [w, setW] = useState(1200)

  const tz = data?.shop.timezone || 'America/Sao_Paulo'
  const today = todayKey(tz)
  const curMonth = today.slice(0, 7)
  const selMonth = monthKey || curMonth

  const tzRef = useRef('America/Sao_Paulo')
  const load = useCallback(async () => {
    const shopTz = tzRef.current
    const t = todayKey(shopTz)
    const monthStart = (monthKey || t.slice(0, 7)) + '-01'
    const fromKey = monthStart < addDays(t, -6) ? monthStart : addDays(t, -6)
    const { data: res, error } = await supabase.rpc('panel_data', {
      p_token: token,
      p_from: atLocal(fromKey, 0, shopTz).toISOString(),
      p_to: atLocal(addDays(t, 45), 0, shopTz).toISOString(),
    })
    if (error) { setLoadError('Link do painel inválido.'); return }
    tzRef.current = (res as Data).shop.timezone
    setData(res as Data)
  }, [token, monthKey])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(load, 60000) // novos agendamentos do site aparecem sozinhos
    return () => clearInterval(id)
  }, [load])
  useEffect(() => {
    const onR = () => setW(window.innerWidth)
    onR()
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  // Executa uma função do painel, recarrega e avisa.
  const run = async (fn: string, args: Record<string, unknown>, ok?: string) => {
    const { error } = await supabase.rpc(fn, { p_token: token, ...args })
    if (error) { flash(errorMessage(error)); return false }
    await load()
    if (ok) flash(ok)
    return true
  }

  if (loadError) return <div className="panel p-center"><div className="p-card"><h1 className="p-h1">Link inválido</h1><p className="p-sub">{loadError} Confira se copiou o link inteiro.</p></div></div>
  if (!data) return <div className="panel p-center"><p className="p-sub">Carregando painel…</p></div>
  // Salão com vagas publicadas (Danieela_nails): painel 2a.
  if (data.shop.booking_mode === 'slots') return <SlotsPanel token={token} />

  const { shop, professionals, services, appointments, blocks } = data
  const activeProfessionals = professionals.filter((b) => b.active)
  const professionalName = (id: string) => professionals.find((b) => b.id === id)?.name || '—'
  const isMobile = w < 760
  const tabs: [Tab, string][] = [['hoje', 'Agenda de hoje'], ['folgas', 'Folgas e bloqueios'], ['servicos', 'Serviços'], ['relatorio', 'Relatório']]

  const remind = (a: Appointment) => {
    if (!a.client_phone) return null
    const start = new Date(a.starts_at)
    const key = zoned(start, tz).key
    const when = key === today ? 'hoje' : key === addDays(today, 1) ? 'amanhã' : dayLabel(key)
    const msg = `Olá, ${a.client_name.split(' ')[0]}! Lembrete do seu horário no ${shop.name}: ${a.service_name} com ${professionalName(a.professional_id).split(' ')[0]}, ${when} às ${timeLabel(start, tz)}.` +
      (a.source === 'site' ? ` Pra cancelar ou remarcar: ${window.location.origin}/agendamento/${a.cancel_token}` : '')
    return `https://wa.me/${waNumber(a.client_phone, shop.country)}?text=${encodeURIComponent(msg)}`
  }

  return (
    <div className="panel">
      <div className="p-shell">
        <header className="p-header">
          <div className="p-brand">
            {shop.logo_url && <img src={shop.logo_url} alt="" />}
            <div><b>{shop.name}</b><span>Painel do salão</span></div>
          </div>
          {!isMobile && (
            <nav className="p-tabs">
              {tabs.map(([k, l]) => <button key={k} className={'p-pill' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}
            </nav>
          )}
          <a className="p-link-btn" href={`/${shop.slug}`} target="_blank" rel="noopener">Ver site</a>
        </header>

        {token === DEMO_PANEL_TOKEN && (
          <div className="p-demo">Painel de demonstração: nome, profissionais, clientes e valores são fictícios. Pode mexer à vontade, tudo volta ao original a cada hora.</div>
        )}

        {tab === 'hoje' && (
          <Today
            shop={shop} tz={tz} today={today} professionals={activeProfessionals} allProfessionals={professionals} appointments={appointments}
            filter={filter} setFilter={setFilter} remind={remind}
            onStatus={(id, status) => run('panel_set_status', { p_id: id, p_status: status })}
            onCancel={(a) => setAsk({
              title: 'Cancelar horário?',
              text: `${a.client_name} · ${a.service_name}, ${dayLabel(zoned(new Date(a.starts_at), tz).key)} às ${timeLabel(a.starts_at, tz)}. O horário volta a ficar livre no site.`,
              yes: 'Cancelar horário', no: 'Manter',
              onYes: () => run('panel_set_status', { p_id: a.id, p_status: 'cancelled' }, 'Agendamento cancelado'),
            })}
            onRegister={(patch) => setReg(newReg(activeProfessionals, services, today, patch))}
          />
        )}
        {tab === 'folgas' && <Blocks tz={tz} today={today} professionals={activeProfessionals} allProfessionals={professionals} blocks={blocks} run={run} />}
        {tab === 'servicos' && <Settings shop={shop} token={token} professionals={professionals} services={services} run={run} setAsk={setAsk} />}
        {tab === 'relatorio' && (
          <Report shop={shop} tz={tz} today={today} professionals={activeProfessionals} appointments={appointments}
            monthKey={selMonth} curMonth={curMonth} setMonthKey={setMonthKey} />
        )}
      </div>

      {reg && (
        <Register
          reg={reg} setReg={setReg} professionals={activeProfessionals} services={services} tz={tz} country={shop.country}
          onDone={async (msg) => { setReg(null); await load(); flash(msg) }}
          token={token}
        />
      )}

      {ask && <ConfirmCard ask={ask} onClose={() => setAsk(null)} />}

      {toast && <div className="p-toast">{toast}</div>}

      {isMobile && (
        <>
          <div style={{ height: 84 }} />
          <nav className="p-mobile-nav">
            {([['hoje', 'Hoje', <IconCal key="i" />], ['folgas', 'Folgas', <IconBlock key="i" />], ['servicos', 'Serviços', <IconList key="i" />], ['relatorio', 'Relatório', <IconChart key="i" />]] as const).map(([k, l, icon]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{icon}<span>{l}</span></button>
            ))}
          </nav>
        </>
      )}
    </div>
  )
}

/* -------------------------- Confirmação -------------------------- */

type Ask = { title: string; text: string; yes: string; no: string; onYes: () => Promise<unknown> | void }

function ConfirmCard({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const yes = async () => {
    setBusy(true)
    await ask.onYes()
    onClose()
  }
  return (
    <div className="p-modal-bg" onClick={onClose}>
      <div className="p-modal p-confirm" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title" className="p-h2" style={{ fontSize: 20 }}>{ask.title}</h2>
        <p className="p-sub" style={{ fontSize: 14, lineHeight: 1.5 }}>{ask.text}</p>
        <div className="p-confirm-actions">
          <button className="p-btn-line p-btn-mid" onClick={onClose} autoFocus>{ask.no}</button>
          <button className="p-btn-danger" disabled={busy} onClick={yes}>{busy ? 'Aguarde…' : ask.yes}</button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ Hoje ------------------------------ */

function Today({ shop, tz, today, professionals, allProfessionals, appointments, filter, setFilter, remind, onStatus, onCancel, onRegister }: {
  shop: Shop; tz: string; today: string; professionals: Professional[]; allProfessionals: Professional[]; appointments: Appointment[]
  filter: string; setFilter: (f: string) => void; remind: (a: Appointment) => string | null
  onStatus: (id: string, s: string) => void; onCancel: (a: Appointment) => void; onRegister: (patch: Partial<RegState>) => void
}) {
  const dayOf = (a: Appointment) => zoned(new Date(a.starts_at), tz).key
  const todays = appointments.filter((a) => dayOf(a) === today)
  const done = todays.filter((a) => a.status === 'done')
  const ns = todays.filter((a) => a.status === 'noshow')
  const sum = (xs: Appointment[]) => xs.reduce((n, a) => n + a.price_cents, 0)
  const upcoming = appointments.filter((a) => dayOf(a) > today && a.status === 'pending')
  const h = zoned(new Date(), tz).h
  const greeting = h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite'
  const longDate = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz })
  const visible = filter === 'all' ? professionals : professionals.filter((b) => b.id === filter)
  const professionalFirst = (id: string) => (allProfessionals.find((b) => b.id === id)?.name || '—').split(' ')[0]

  // Próximo horário já marcado do mesmo cliente (por telefone, ou nome se não tiver telefone)
  const nextOf = (a: Appointment) => upcoming.find((x) => a.client_phone ? x.client_phone === a.client_phone : x.client_name.toLowerCase() === a.client_name.toLowerCase())

  return (
    <>
      <div className="p-top">
        <div><h1 className="p-h1">{greeting}, {shop.name}!</h1><p className="p-sub" style={{ marginTop: 4 }}>{longDate}</p></div>
        <div className="p-top-actions">
          <div className="p-seg">
            {[['all', 'Todos'] as const, ...professionals.map((b) => [b.id, b.name.split(' ')[0]] as const)].map(([k, l]) => (
              <button key={k} className={'p-pill p-pill-sm' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <button className="p-btn-yellow" onClick={() => onRegister({})}>+ Registrar atendimento</button>
        </div>
      </div>

      <div className="p-kpis">
        <div className="p-kpi"><div>Agendados hoje</div><b>{todays.length}</b><small>{todays.length - done.length - ns.length} ainda vêm</small></div>
        <div className="p-kpi"><div>Concluídos</div><b style={{ color: '#2F7A3E' }}>{done.length}</b><small>marcados no painel</small></div>
        <div className="p-kpi"><div>Faltas</div><b style={{ color: '#C2410C' }}>{ns.length}</b><small>não apareceram</small></div>
        <div className="p-kpi dark"><div>Recebido no balcão</div><b>{money(sum(done), shop.country)}</b><small>previsto hoje: {money(sum(todays.filter((a) => a.status !== 'noshow')), shop.country)}</small></div>
      </div>

      <div className="p-columns">
        {visible.map((b) => {
          const items = todays.filter((a) => a.professional_id === b.id)
          const works = b.hours.find((x) => x.weekday === weekdayOf(today))
          return (
            <section key={b.id} className="p-col">
              <div className="p-col-head">
                <div className="p-who"><div className="p-initials">{initials(b.name)}</div><div><b>{b.name}</b><small>{works ? `${works.start_time.slice(0, 5)} às ${works.end_time.slice(0, 5)}` : 'Folga hoje'}</small></div></div>
                <span className="p-count">{items.length} {items.length === 1 ? 'horário' : 'horários'}</span>
              </div>
              {items.length === 0 && <div className="p-empty">{works ? 'Nenhum horário marcado ainda' : 'Folga hoje'}</div>}
              {items.map((a) => {
                const ret = a.status === 'done' ? nextOf(a) : undefined
                const wa = a.status === 'pending' ? remind(a) : null
                return (
                  <div key={a.id} className={'p-appt ' + a.status}>
                    <div className="p-appt-row">
                      <div className="p-appt-main">
                        <span className="p-time">{timeLabel(a.starts_at, tz)}</span>
                        <div><b>{a.client_name}</b><small>{a.service_name} · {money(a.price_cents, shop.country)}{a.source === 'walkin' ? ' · sem horário' : ''}</small></div>
                      </div>
                      <span className={'p-chip ' + a.status}>{STATUS_LABEL[a.status]}</span>
                    </div>
                    {a.status === 'pending' ? (
                      <div className="p-appt-actions">
                        <button className="p-btn-dark" onClick={() => onStatus(a.id, 'done')}>Marcar concluído</button>
                        <button className="p-btn-noshow" onClick={() => onStatus(a.id, 'noshow')}>Faltou</button>
                        {wa && <a className="p-btn-wa" href={wa} target="_blank" rel="noopener" title="Mandar lembrete no WhatsApp">Lembrar</a>}
                      </div>
                    ) : (
                      <div className="p-appt-links">
                        <button className="p-undo" onClick={() => onStatus(a.id, 'pending')}>Desfazer</button>
                        {ret && <span className="p-ret">Retorno: {dayLabel(dayOf(ret)).replace(',', '')} {timeLabel(ret.starts_at, tz)}</span>}
                        {a.status === 'done' && !ret && (
                          <button className="p-rebook" onClick={() => onRegister({ mode: 'schedule', client: a.client_name, phone: a.client_phone ? displayPhone(a.client_phone, shop.country) : '', professional: a.professional_id, service: a.service_id || '' })}>Marcar retorno →</button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })}
        {visible.length === 0 && <div className="p-card"><p className="p-sub">Nenhuma profissional ativa. Cadastre na aba Serviços.</p></div>}
      </div>

      <section className="p-card">
        <div className="p-card-head">
          <div><h2 className="p-h2">Próximos agendamentos</h2><p className="p-sub">Do site e os marcados direto no balcão</p></div>
          <span className="p-count">{upcoming.length} marcados</span>
        </div>
        {upcoming.length === 0 && <p className="p-sub" style={{ marginTop: 12 }}>Nenhum agendamento pros próximos dias.</p>}
        {upcoming.map((u) => {
          const wa = remind(u)
          return (
            <div key={u.id} className="p-row">
              <div className="p-row-main">
                <div style={{ minWidth: 86 }}><b>{dayLabel(dayOf(u))}</b><small>{timeLabel(u.starts_at, tz)}</small></div>
                <div style={{ minWidth: 0 }}><b>{u.client_name}</b><small>{u.service_name} · {professionalFirst(u.professional_id)}</small></div>
              </div>
              <div className="p-row-actions">
                {u.source === 'counter' && <span className="p-chip pending">Marcado no balcão</span>}
                {wa && <a className="p-btn-line" href={wa} target="_blank" rel="noopener">Lembrar</a>}
                <button className="p-btn-line danger" onClick={() => onCancel(u)}>Cancelar</button>
              </div>
            </div>
          )
        })}
      </section>
    </>
  )
}

/* --------------------------- Registrar --------------------------- */

type RegState = {
  mode: 'walkin' | 'schedule'; client: string; phone: string; professional: string; service: string
  retorno: boolean; rDate: string; rTime: string; date: string; time: string; error: string; sending: boolean
}

function newReg(professionals: Professional[], services: Service[], today: string, patch: Partial<RegState>): RegState {
  return {
    mode: 'walkin', client: '', phone: '', professional: professionals[0]?.id || '', service: services.find((s) => s.active)?.id || '',
    retorno: false, rDate: addDays(today, 14), rTime: '10:00', date: addDays(today, 1), time: '10:00', error: '', sending: false,
    ...patch,
  }
}

function Register({ reg: r, setReg, professionals, services, tz, country, token, onDone }: {
  reg: RegState; setReg: (r: RegState | null) => void; professionals: Professional[]; services: Service[]; tz: string; country: Shop['country']; token: string
  onDone: (msg: string) => void
}) {
  const set = (patch: Partial<RegState>) => setReg({ ...r, error: '', ...patch })
  const nowLabel = timeLabel(new Date(), tz)

  const add = (startsAt: Date | null) => supabase.rpc('panel_add_appointment', {
    p_token: token, p_professional_id: r.professional, p_service_id: r.service, p_starts_at: startsAt ? startsAt.toISOString() : null,
    p_client_name: r.client, p_client_phone: r.phone,
  })

  const submit = async () => {
    if (r.client.trim().length < 2) return set({ error: 'Coloca o nome do cliente.' })
    if (!r.professional || !r.service) return set({ error: 'Escolhe a profissional e o serviço.' })
    const at = (d: string, t: string) => atLocal(d, toMinutes(t), tz)
    if (r.mode === 'schedule' && (!r.date || !r.time)) return set({ error: 'Escolhe o dia e o horário.' })
    if (r.mode === 'walkin' && r.retorno && (!r.rDate || !r.rTime)) return set({ error: 'Escolhe o dia e o horário do retorno.' })
    setReg({ ...r, sending: true, error: '' })

    if (r.mode === 'schedule') {
      const { error } = await add(at(r.date, r.time))
      if (error) return setReg({ ...r, sending: false, error: errorMessage(error) })
      return onDone('Agendamento registrado')
    }
    const { error } = await add(null)
    if (error) return setReg({ ...r, sending: false, error: errorMessage(error) })
    if (r.retorno) {
      const { error: e2 } = await add(at(r.rDate, r.rTime))
      if (e2) return setReg({ ...r, mode: 'schedule', date: r.rDate, time: r.rTime, retorno: false, sending: false, error: `Atendimento registrado, mas o retorno não: ${errorMessage(e2)}` })
      return onDone('Atendimento registrado e retorno marcado')
    }
    onDone('Atendimento registrado')
  }

  const label = r.sending ? 'Salvando…' : r.mode === 'walkin' ? (r.retorno ? 'Registrar e marcar retorno' : 'Registrar como concluído') : 'Agendar'

  return (
    <div className="p-modal-bg" onClick={() => setReg(null)}>
      <div className="p-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="p-card-head" style={{ alignItems: 'center' }}>
          <h2 className="p-h2" style={{ fontSize: 20 }}>Registrar atendimento</h2>
          <button className="p-x" aria-label="Fechar" onClick={() => setReg(null)}>×</button>
        </div>
        <div className="p-mode">
          <button className={r.mode === 'walkin' ? 'on' : ''} onClick={() => set({ mode: 'walkin' })}><b>Atendido agora</b><small>Chegou sem horário</small></button>
          <button className={r.mode === 'schedule' ? 'on' : ''} onClick={() => set({ mode: 'schedule' })}><b>Agendar</b><small>Marcar pra outro dia</small></button>
        </div>
        <div className="p-grid2">
          <label className="p-field">Cliente<input value={r.client} onChange={(e) => set({ client: e.target.value })} placeholder="Nome do cliente" /></label>
          <label className="p-field">WhatsApp (opcional)<input value={r.phone} onChange={(e) => set({ phone: formatPhone(e.target.value, country) })} inputMode="tel" placeholder={country === 'PT' ? '912 345 678' : '(11) 90000-0000'} /></label>
          <label className="p-field">Profissional
            <select value={r.professional} onChange={(e) => set({ professional: e.target.value })}>{professionals.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </label>
          <label className="p-field">Serviço
            <select value={r.service} onChange={(e) => set({ service: e.target.value })}>{services.filter((s) => s.active || s.id === r.service).map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.price_cents, country)}</option>)}</select>
          </label>
        </div>
        {r.mode === 'walkin' ? (
          <>
            <div className="p-note">Entra como <strong style={{ color: '#2F7A3E' }}>concluído</strong> hoje às {nowLabel}. O valor soma no recebido do dia.</div>
            <label className="p-checkline"><input type="checkbox" checked={r.retorno} onChange={(e) => set({ retorno: e.target.checked })} />Cliente já quer marcar o próximo</label>
            {r.retorno && (
              <div className="p-grid-fixed2">
                <label className="p-field">Dia do retorno<input type="date" value={r.rDate} onChange={(e) => set({ rDate: e.target.value })} /></label>
                <label className="p-field">Horário<input type="time" step={1800} value={r.rTime} onChange={(e) => set({ rTime: e.target.value })} /></label>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="p-grid-fixed2">
              <label className="p-field">Dia<input type="date" value={r.date} onChange={(e) => set({ date: e.target.value })} /></label>
              <label className="p-field">Horário<input type="time" step={1800} value={r.time} onChange={(e) => set({ time: e.target.value })} /></label>
            </div>
            <div className="p-sub">O horário sai da agenda do site na hora.</div>
          </>
        )}
        {r.error && <div className="p-error">{r.error}</div>}
        <button className="p-btn-dark p-btn-big" disabled={r.sending} onClick={submit}>{label}</button>
      </div>
    </div>
  )
}

/* ---------------------------- Folgas ---------------------------- */

function Blocks({ tz, today, professionals, allProfessionals, blocks, run }: {
  tz: string; today: string; professionals: Professional[]; allProfessionals: Professional[]; blocks: Block[]
  run: (fn: string, args: Record<string, unknown>, ok?: string) => Promise<boolean>
}) {
  const [f, setF] = useState({ professional: professionals[0]?.id || '', date: addDays(today, 1), allDay: false, from: '12:00', to: '13:00', reason: '' })
  const [sending, setSending] = useState(false)
  const professional = (id: string) => allProfessionals.find((b) => b.id === id)?.name || '—'

  const add = async () => {
    if (!f.professional || !f.date) return
    const start = f.allDay ? atLocal(f.date, 0, tz) : atLocal(f.date, toMinutes(f.from), tz)
    const end = f.allDay ? atLocal(addDays(f.date, 1), 0, tz) : atLocal(f.date, toMinutes(f.to), tz)
    setSending(true)
    const ok = await run('panel_add_block', { p_professional_id: f.professional, p_starts_at: start.toISOString(), p_ends_at: end.toISOString(), p_all_day: f.allDay, p_reason: f.reason }, 'Horário bloqueado')
    setSending(false)
    if (ok) setF({ ...f, reason: '' })
  }

  return (
    <>
      <h1 className="p-h1">Folgas e bloqueios</h1>
      <p className="p-sub" style={{ margin: '4px 0 20px' }}>Horário bloqueado some da agenda do site na hora.</p>
      <div className="p-two">
        <section className="p-card p-form" style={{ alignSelf: 'start' }}>
          <h2 className="p-h2" style={{ fontSize: 17 }}>Novo bloqueio</h2>
          <label className="p-field">Profissional
            <select value={f.professional} onChange={(e) => setF({ ...f, professional: e.target.value })}>{professionals.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </label>
          <label className="p-field">Dia<input type="date" value={f.date} min={today} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="p-checkline"><input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} />Dia inteiro (folga)</label>
          {!f.allDay && (
            <div className="p-grid-fixed2">
              <label className="p-field">De<input type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
              <label className="p-field">Até<input type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
            </div>
          )}
          <label className="p-field">Motivo (opcional)<input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Ex: almoço, médico" /></label>
          <button className="p-btn-dark p-btn-big" disabled={sending} onClick={add}>Bloquear</button>
        </section>
        <section className="p-card">
          <h2 className="p-h2" style={{ fontSize: 17, marginBottom: 14 }}>Próximos bloqueios</h2>
          {blocks.length === 0 && <p className="p-sub">Nenhum bloqueio marcado.</p>}
          {blocks.map((b) => {
            const s = new Date(b.starts_at)
            const name = professional(b.professional_id)
            return (
              <div key={b.id} className="p-row">
                <div className="p-row-main">
                  <div className="p-initials">{initials(name)}</div>
                  <div><b>{name.split(' ')[0]} · {dayLabel(zoned(s, tz).key)}</b><small>{b.all_day ? 'Dia inteiro' : `${timeLabel(s, tz)} às ${timeLabel(b.ends_at, tz)}`}{b.reason ? ` · ${b.reason}` : ''}</small></div>
                </div>
                <button className="p-x" aria-label="Remover bloqueio" onClick={() => run('panel_delete_block', { p_id: b.id }, 'Bloqueio removido')}>×</button>
              </div>
            )
          })}
        </section>
      </div>
    </>
  )
}

/* --------------------------- Serviços --------------------------- */

function Settings({ shop, token, professionals, services, run, setAsk }: {
  shop: Shop; token: string; professionals: Professional[]; services: Service[]; setAsk: (a: Ask) => void
  run: (fn: string, args: Record<string, unknown>, ok?: string) => Promise<boolean>
}) {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const siteUrl = `${origin}/${shop.slug}`
  const panelUrl = `${origin}/painel/${token}`

  return (
    <>
      <h1 className="p-h1">Serviços e profissionais</h1>
      <p className="p-sub" style={{ margin: '4px 0 20px' }}>O que muda aqui aparece no site na hora.</p>

      <section className="p-card">
        <div className="p-svc-row p-svc-head"><span>Serviço</span><span>Preço (R$)</span><span>Duração (min)</span><span /></div>
        {services.map((s) => <ServiceRow key={s.id} s={s} run={run} setAsk={setAsk} />)}
        <button className="p-add" onClick={() => run('panel_save_service', { p_id: null, p_name: 'Novo serviço', p_price_cents: 0, p_duration_min: 30, p_active: true })}>+ Adicionar serviço</button>
      </section>

      <section className="p-card" style={{ marginTop: 16 }}>
        <h2 className="p-h2">Profissionais</h2>
        <p className="p-sub" style={{ margin: '4px 0 12px' }}>Desativado some do site e da agenda. Os horários já marcados continuam no painel.</p>
        {professionals.map((b) => <ProfessionalRow key={b.id} b={b} run={run} />)}
      </section>

      <ShopInfo shop={shop} run={run} />

      <section className="p-card" style={{ marginTop: 16 }}>
        <h2 className="p-h2">Seus links</h2>
        <div className="p-links">
          <CopyLine label="Site de agendamento (divulgue no Instagram)" value={siteUrl} />
          <CopyLine label="Painel (não compartilhe: quem tem o link mexe na agenda)" value={panelUrl} />
        </div>
      </section>
    </>
  )
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="p-field">{label}
      <div className="p-copy">
        <input readOnly value={value} onFocus={(e) => e.target.select()} />
        <button className="p-btn-line" onClick={() => { navigator.clipboard?.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500) }}>{ok ? 'Copiado' : 'Copiar'}</button>
      </div>
    </div>
  )
}

const centsToInput = (c: number) => (c % 100 ? (c / 100).toFixed(2).replace('.', ',') : String(c / 100))
const inputToCents = (v: string) => Math.round(Number(v.replace(/\./g, '').replace(',', '.') || 0) * 100)

function ServiceRow({ s, run, setAsk }: { s: Service; run: (fn: string, args: Record<string, unknown>, ok?: string) => Promise<boolean>; setAsk: (a: Ask) => void }) {
  const [name, setName] = useState(s.name)
  const [price, setPrice] = useState(centsToInput(s.price_cents))
  const [dur, setDur] = useState(String(s.duration_min))
  useEffect(() => { setName(s.name); setPrice(centsToInput(s.price_cents)); setDur(String(s.duration_min)) }, [s])

  const save = (active = s.active) => {
    const cents = inputToCents(price)
    const d = Math.min(480, Math.max(5, Number(dur) || 30))
    if (name.trim() === s.name && cents === s.price_cents && d === s.duration_min && active === s.active) return
    run('panel_save_service', { p_id: s.id, p_name: name, p_price_cents: cents, p_duration_min: d, p_active: active }, 'Salvo')
  }

  return (
    <div className={'p-svc-row' + (s.active ? '' : ' off')}>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => save()} aria-label="Nome do serviço" />
      <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d,]/g, ''))} onBlur={() => save()} inputMode="decimal" aria-label="Preço" />
      <input value={dur} onChange={(e) => setDur(e.target.value.replace(/\D/g, ''))} onBlur={() => save()} inputMode="numeric" aria-label="Duração" />
      <button className="p-x" aria-label="Remover serviço" title="Remover" onClick={() => setAsk({
        title: 'Remover serviço?',
        text: `"${s.name}" sai do site. Os horários já marcados com ele continuam no painel.`,
        yes: 'Remover', no: 'Manter',
        onYes: () => run('panel_delete_service', { p_id: s.id }, 'Serviço removido'),
      })}>×</button>
    </div>
  )
}

function ProfessionalRow({ b, run }: { b: Professional; run: (fn: string, args: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const [name, setName] = useState(b.name)
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState<ProfessionalHours[]>(b.hours)
  useEffect(() => { setName(b.name); setHours(b.hours) }, [b])

  const save = (patch: { active?: boolean; hours?: ProfessionalHours[] } = {}, ok = 'Salvo') =>
    run('panel_save_professional', {
      p_id: b.id, p_name: name, p_specialty: b.specialty || '', p_active: patch.active ?? b.active,
      p_hours: (patch.hours || b.hours).map((h) => ({ weekday: h.weekday, start_time: h.start_time.slice(0, 5), end_time: h.end_time.slice(0, 5) })),
    }, ok)

  const blurSave = () => { if (name.trim() !== b.name) save() }
  const toggleDay = (d: number) => setHours(hours.some((h) => h.weekday === d)
    ? hours.filter((h) => h.weekday !== d)
    : [...hours, { weekday: d, start_time: '09:00', end_time: '18:00' }].sort((x, y) => x.weekday - y.weekday))
  const setTime = (d: number, k: 'start_time' | 'end_time', v: string) => setHours(hours.map((h) => h.weekday === d ? { ...h, [k]: v } : h))
  const invalid = hours.some((h) => toMinutes(h.end_time) <= toMinutes(h.start_time))
  const { daysLabel, hoursLabel } = scheduleLabels(b.hours)

  return (
    <div className="p-professional">
      <div className="p-professional-row">
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={blurSave} placeholder="Nome da profissional" style={{ flex: '1 1 200px' }} />
        <button className="p-btn-line" onClick={() => setOpen(!open)} title="Dias e horários">{daysLabel}{hoursLabel ? `, ${hoursLabel}` : ''} ▾</button>
        <button className={'p-toggle' + (b.active ? ' on' : '')} onClick={() => save({ active: !b.active }, b.active ? 'Profissional desativada' : 'Profissional ativada')}>{b.active ? 'Ativo' : 'Desativado'}</button>
      </div>
      {open && (
        <div className="p-hours">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const h = hours.find((x) => x.weekday === d)
            return (
              <div key={d} className="p-hours-row">
                <label className="p-checkline"><input type="checkbox" checked={!!h} onChange={() => toggleDay(d)} />{WEEKDAYS[d]}</label>
                {h ? (
                  <>
                    <input type="time" value={h.start_time.slice(0, 5)} onChange={(e) => setTime(d, 'start_time', e.target.value)} />
                    <span>às</span>
                    <input type="time" value={h.end_time.slice(0, 5)} onChange={(e) => setTime(d, 'end_time', e.target.value)} />
                  </>
                ) : <span className="p-sub">Folga</span>}
              </div>
            )
          })}
          {invalid && <div className="p-error">O fim do expediente precisa ser depois do início.</div>}
          <button className="p-btn-dark" disabled={invalid} onClick={async () => { if (await save({ hours }, 'Horários salvos')) setOpen(false) }}>Salvar horários</button>
        </div>
      )}
    </div>
  )
}

function ShopInfo({ shop, run }: { shop: Shop; run: (fn: string, args: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const init = () => ({
    name: shop.name, address: shop.address || '', city: shop.city || '', phone: shop.phone || '',
    whatsapp: shop.whatsapp ? displayPhone(shop.whatsapp, shop.country) : '', instagram: shop.instagram || '',
    hours: shop.hours_text.join('\n'),
  })
  const [f, setF] = useState(init)
  useEffect(() => setF(init()), [shop]) // eslint-disable-line react-hooks/exhaustive-deps
  const field = (k: keyof ReturnType<typeof init>, label: string, ph = '') => (
    <label className="p-field">{label}<input value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: k === 'whatsapp' || k === 'phone' ? formatPhone(e.target.value, shop.country) : e.target.value })} /></label>
  )
  const save = () => {
    const wa = f.whatsapp.replace(/\D/g, '')
    run('panel_save_shop', {
      p_data: {
        name: f.name, address: f.address, city: f.city, phone: f.phone, instagram: f.instagram.replace('@', ''),
        whatsapp: wa ? waNumber(wa, shop.country) : '', hours_text: f.hours.split('\n').map((l) => l.trim()).filter(Boolean),
      },
    }, 'Dados do salão salvos')
  }
  return (
    <section className="p-card" style={{ marginTop: 16 }}>
      <h2 className="p-h2">Dados do salão</h2>
      <p className="p-sub" style={{ margin: '4px 0 12px' }}>Aparecem no site: endereço, contato e funcionamento.</p>
      <div className="p-grid2">
        {field('name', 'Nome')}
        {field('instagram', 'Instagram', '@seusalao')}
        {field('address', 'Endereço', 'Rua, número · bairro')}
        {field('city', 'Cidade', 'São Paulo / SP')}
        {field('phone', 'Telefone')}
        {field('whatsapp', 'WhatsApp')}
      </div>
      <label className="p-field" style={{ marginTop: 12 }}>Funcionamento (uma linha por item)
        <textarea rows={3} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} placeholder={'Seg a Sáb, 9h às 20h\nDom, 9h às 14h'} />
      </label>
      <button className="p-btn-dark p-btn-big" style={{ marginTop: 14, width: '100%' }} onClick={save}>Salvar dados</button>
    </section>
  )
}

/* --------------------------- Relatório --------------------------- */

function Report({ shop, tz, today, professionals, appointments, monthKey, curMonth, setMonthKey }: {
  shop: Shop; tz: string; today: string; professionals: Professional[]; appointments: Appointment[]
  monthKey: string; curMonth: string; setMonthKey: (k: string) => void
}) {
  const [period, setPeriod] = useState<'semana' | 'mes'>('semana')
  const isMonth = period === 'mes'
  const dayOf = (a: Appointment) => zoned(new Date(a.starts_at), tz).key
  const closed = appointments.filter((a) => a.status === 'done' || a.status === 'noshow')

  const monthOptions = useMemo(() => {
    const out: { key: string; label: string }[] = []
    let [y, m] = zoned(new Date(shop.created_at), tz).key.split('-').map(Number)
    const [cy, cm] = curMonth.split('-').map(Number)
    while (y < cy || (y === cy && m <= cm)) {
      const name = monthName(m)
      out.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${name[0].toUpperCase()}${name.slice(1)} ${y}` })
      m++
      if (m > 12) { m = 1; y++ }
    }
    return out.reverse()
  }, [shop.created_at, tz, curMonth])

  // Grupos do gráfico: últimos 7 dias, ou as semanas do mês escolhido
  const groups = useMemo(() => {
    if (!isMonth) {
      return Array.from({ length: 7 }, (_, i) => {
        const k = addDays(today, i - 6)
        return { label: k === today ? 'Hoje' : WEEKDAYS[weekdayOf(k)], from: k, to: k, today: k === today }
      })
    }
    const [y, m] = monthKey.split('-').map(Number)
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const out = []
    for (let s = 1, i = 1; s <= last; s += 7, i++) {
      const from = `${monthKey}-${String(s).padStart(2, '0')}`
      const to = `${monthKey}-${String(Math.min(s + 6, last)).padStart(2, '0')}`
      out.push({ label: `Sem ${i}`, from, to, today: today >= from && today <= to })
    }
    return out
  }, [isMonth, monthKey, today])

  const rangeFrom = groups[0].from
  const rangeTo = groups[groups.length - 1].to
  const inRange = closed.filter((a) => { const k = dayOf(a); return k >= rangeFrom && k <= rangeTo })
  const bars = groups.map((g) => {
    const xs = inRange.filter((a) => { const k = dayOf(a); return k >= g.from && k <= g.to })
    return { ...g, done: xs.filter((a) => a.status === 'done').length, noshow: xs.filter((a) => a.status === 'noshow').length }
  })
  const max = Math.max(1, ...bars.map((b) => b.done + b.noshow)) * 1.1
  const done = inRange.filter((a) => a.status === 'done')
  const ns = inRange.filter((a) => a.status === 'noshow')
  const rate = (d: number, n: number) => (d + n ? Math.round((d / (d + n)) * 100) : null)
  const total = rate(done.length, ns.length)
  const monthLabel = monthOptions.find((o) => o.key === monthKey)?.label || monthKey
  const cols = { gridTemplateColumns: `repeat(${bars.length},1fr)` }

  return (
    <>
      <h1 className="p-h1">Relatório</h1>
      <p className="p-sub" style={{ margin: '4px 0 20px' }}>Atendidos, faltas e comparecimento.</p>
      <div className="p-two p-two-wide">
        <section className="p-card">
          <div className="p-report-head">
            <div><h2 className="p-h2">{isMonth ? `Resumo de ${monthLabel.toLowerCase()}` : 'Resumo da semana'}</h2><p className="p-sub">{isMonth ? 'Atendidos e faltas por semana' : 'Atendidos e faltas por dia'}</p></div>
            <div className="p-seg">
              {(['semana', 'mes'] as const).map((k) => <button key={k} className={'p-pill p-pill-sm' + (period === k ? ' on' : '')} onClick={() => setPeriod(k)}>{k === 'semana' ? 'Semana' : 'Mês'}</button>)}
            </div>
            {isMonth && (
              <select className="p-month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
                {monthOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            )}
            <div className="p-legend"><span><i style={{ background: '#1A1917' }} />Atendidos</span><span><i style={{ background: '#F08A5D' }} />Faltas</span></div>
          </div>
          <div className="p-stats">
            <div><small>Atendidos</small><b>{done.length}</b></div>
            <div><small>Faltas</small><b style={{ color: '#C2410C' }}>{ns.length}</b></div>
            <div><small>Recebido</small><b>{money(done.reduce((n, a) => n + a.price_cents, 0), shop.country)}</b></div>
          </div>
          <div className="p-bars" style={cols}>
            {bars.map((d) => (
              <div key={d.label} className="p-bar">
                <span>{d.done}</span>
                <div style={{ height: (d.noshow / max) * 140, background: '#F08A5D', borderRadius: 6, minHeight: d.noshow ? 4 : 0 }} />
                <div style={{ height: (d.done / max) * 140, background: d.today ? '#E28FA8' : '#1A1917', borderRadius: 8, minHeight: 4 }} />
              </div>
            ))}
          </div>
          <div className="p-bar-labels" style={cols}>
            {bars.map((d) => <span key={d.label} className={d.today ? 'today' : ''}>{d.label}</span>)}
          </div>
        </section>
        <section className="p-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 className="p-h2">Comparecimento</h2>
          <p className="p-sub" style={{ margin: '4px 0 18px' }}>{isMonth ? `${monthLabel}, por profissional` : 'Últimos 7 dias, por profissional'}</p>
          <div className="p-big">{total === null ? '—' : `${total}%`}</div>
          <p className="p-sub" style={{ margin: '0 0 18px' }}>{total === null ? 'Sem atendimentos fechados no período' : 'dos agendados apareceram'}</p>
          <div className="p-rates">
            {professionals.map((b) => {
              const mine = inRange.filter((a) => a.professional_id === b.id)
              const r = rate(mine.filter((a) => a.status === 'done').length, mine.filter((a) => a.status === 'noshow').length)
              return (
                <div key={b.id}>
                  <div className="p-rate-label"><span>{b.name}</span><span>{r === null ? '—' : `${r}%`}</span></div>
                  <div className="p-rate-track"><div style={{ width: `${r ?? 0}%` }} /></div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
      <section className="p-card" style={{ marginTop: 16 }}>
        <h2 className="p-h2" style={{ marginBottom: 6 }}>Histórico</h2>
        {inRange.length === 0 && <p className="p-sub">Nada no período.</p>}
        {[...inRange].reverse().slice(0, 30).map((a) => (
          <div key={a.id} className="p-row">
            <div className="p-row-main">
              <div style={{ minWidth: 86 }}><b>{dayLabel(dayOf(a))}</b><small>{timeLabel(a.starts_at, tz)}</small></div>
              <div style={{ minWidth: 0 }}><b>{a.client_name}</b><small>{a.service_name} · {(professionals.find((b) => b.id === a.professional_id)?.name || '').split(' ')[0]} · {money(a.price_cents, shop.country)}</small></div>
            </div>
            <span className={'p-chip ' + a.status}>{STATUS_LABEL[a.status]}</span>
          </div>
        ))}
      </section>
    </>
  )
}

/* ----------------------------- Ícones ----------------------------- */

const ic = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const IconCal = () => <svg {...ic}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
const IconBlock = () => <svg {...ic}><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></svg>
const IconList = () => <svg {...ic}><path d="M4 7h16M4 12h16M4 17h10" /></svg>
const IconChart = () => <svg {...ic}><path d="M5 20V11M12 20V5M19 20v-6" /></svg>

