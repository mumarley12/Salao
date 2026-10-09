'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, errorMessage } from '@/lib/supabase'
import type { Professional, Interval, Service, Shop } from '@/lib/types'
import { addDays, brl, buildSlots, formatPhone, relativeDay, scheduleLabels, todayKey, WEEKDAYS, weekdayOf } from '@/lib/time'

const DAYS_AHEAD = 14

type Props = { shop: Shop; professionals: Professional[]; services: Service[] }

export default function ShopSite({ shop, professionals, services }: Props) {
  const tz = shop.timezone
  const [busy, setBusy] = useState<Interval[]>([])
  const [now, setNow] = useState<Date | null>(null)
  const [w, setW] = useState(1200)

  const loadBusy = useCallback(async () => {
    const from = new Date()
    const to = new Date(from.getTime() + (DAYS_AHEAD + 1) * 86400000)
    const { data } = await supabase.rpc('get_busy', { p_shop_slug: shop.slug, p_from: from.toISOString(), p_to: to.toISOString() })
    setBusy((data as Interval[]) || [])
    setNow(new Date())
  }, [shop.slug])

  useEffect(() => {
    loadBusy()
    const onR = () => setW(window.innerWidth)
    onR()
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [loadBusy])

  // Animação de entrada das seções
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]')
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('revealed'); io.unobserve(e.target) }
    }), { threshold: 0.1 })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const days = useMemo(() => {
    const t = todayKey(tz)
    return Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(t, i))
  }, [tz])

  const minDur = Math.min(...services.map((s) => s.duration_min), 30)

  const nextFree = useCallback((b: Professional) => {
    if (!now) return ''
    for (const d of days) {
      const s = buildSlots(b, d, tz, minDur, busy, now)?.find((x) => !x.busy)
      if (s) return `${relativeDay(d, tz)} ${s.label}`
    }
    return 'Sem horários'
  }, [busy, days, minDur, now, tz])

  const freeToday = now ? professionals.reduce((n, b) => n + (buildSlots(b, days[0], tz, minDur, busy, now) || []).filter((x) => !x.busy).length, 0) : 0

  const waLink = shop.whatsapp ? `https://wa.me/${shop.whatsapp}?text=${encodeURIComponent(`Olá! Vim pelo site do ${shop.name}.`)}` : null
  const igLink = shop.instagram ? `https://instagram.com/${shop.instagram}` : null

  const [booking, setBooking] = useState<{ professionalId?: string } | null>(null)
  const openBooking = (professionalId?: string) => { loadBusy(); setBooking({ professionalId }) }

  const isMobile = w < 760
  const gallery = shop.gallery?.length ? shop.gallery
    : ['unhas em gel', 'nail art', 'pé e mão', 'escova', 'sobrancelha', 'francesinha'].map((label) => ({ url: '', label }))

  return (
    <div className="site">
      <header className="s-header">
        <div className="s-header-in">
          <a href="#topo" className="s-brand">
            {shop.logo_url && <img src={shop.logo_url} alt={shop.name} />}
            <span>{shop.name}</span>
          </a>
          {!isMobile && (
            <nav className="s-nav">
              <a href="#topo">Início</a>
              <a href="#profissionais">Profissionais</a>
              <a href="#como-funciona">Como funciona</a>
              <a href="#trabalhos">Trabalhos</a>
              <a href="#servicos">Serviços</a>
              <a href="#funcionamento">Funcionamento</a>
              <a href="#duvidas">Dúvidas</a>
            </nav>
          )}
          <div className="s-icons">
            {igLink && <a href={igLink} target="_blank" rel="noopener" aria-label="Instagram" title="Instagram" className="s-icon"><IconInstagram /></a>}
            {waLink && <a href={waLink} target="_blank" rel="noopener" aria-label="WhatsApp" title="WhatsApp" className="s-icon"><IconWhatsApp /></a>}
          </div>
        </div>
      </header>

      <Hero videos={shop.hero_videos} freeLabel={freeToday > 0 ? `${freeToday} horários livres hoje` : `Agenda aberta pros próximos ${DAYS_AHEAD} dias`} onBook={() => openBooking()} />

      <section data-reveal id="profissionais" className="s-section s-professionals">
        <h2 className="s-h2">Nossas profissionais</h2>
        <div className="s-professional-grid">
          {professionals.map((b) => {
            const { daysLabel, hoursLabel } = scheduleLabels(b.hours)
            const first = b.name.split(' ')[0]
            return (
              <article key={b.id} className="s-professional">
                <div className="s-professional-photo">
                  {b.photo_url ? <img src={b.photo_url} alt={b.name} /> : <span className="s-tag">foto · {first}</span>}
                </div>
                <div className="s-professional-body">
                  <h3>{b.name}</h3>
                  <p className="s-professional-hours">{daysLabel}{hoursLabel && `, ${hoursLabel}`}</p>
                  <div className="s-professional-foot">
                    <span className="s-next">{nextFree(b)}</span>
                    <button className="s-btn-outline" onClick={() => openBooking(b.id)}>Agendar<span className="s-hide-m"> com {first}</span></button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section data-reveal className="s-section s-two">
        <div>
          <p className="s-eyebrow">Você conhece essa história</p>
          <h2 className="s-h2">Cuidar de você devia ser simples.</h2>
        </div>
        <div className="s-pains">
          {['Você manda mensagem e a resposta só chega horas depois', 'Chega no salão e tem que esperar a profissional terminar outra cliente', 'Sua manicure de sempre está de folga e você não sabia', 'Você esquece o horário marcado e perde a vez', 'Precisa remarcar e não sabe com quem falar'].map((t, i) => (
            <div key={i}><span>{String(i + 1).padStart(2, '0')}</span><span>{t}</span></div>
          ))}
        </div>
      </section>

      <section data-reveal id="como-funciona" className="s-section s-how-wrap">
        <div className="s-how">
          <div>
            <h2 className="s-h2">Agenda por Profissional</h2>
            <p className="s-how-p1">Cada profissional tem a própria agenda aberta aqui no site.</p>
            <p className="s-how-p2">Nada é cobrado no site. Você paga no salão, depois do atendimento.</p>
          </div>
          <div className="s-how-steps">
            {['Escolhe a profissional', 'Escolhe o serviço', 'Pega o horário livre'].map((t, i) => (
              <div key={i}><span>{i + 1}</span><span>{t}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section data-reveal id="trabalhos" className="s-gallery">
        <div className="s-section">
          <h3 className="s-h3">Trabalhos</h3>
          <div className="s-gallery-mask">
            <div className="s-gallery-track">
              {[0, 1].flatMap((k) => gallery.map((g) => (
                <div key={k + g.label} className="s-gallery-tile">
                  {g.url && <img src={g.url} alt={k ? '' : g.label} loading="lazy" />}
                  <span>{g.label}{shop.instagram ? ` · @${shop.instagram}` : ''}</span>
                </div>
              )))}
            </div>
          </div>
        </div>
      </section>

      <section data-reveal id="servicos" className="s-section s-two">
        <div>
          <h2 className="s-h2" style={{ marginBottom: 28 }}>Serviços</h2>
          <div>
            {services.map((s) => (
              <div key={s.id} className="s-service-row">
                <span className="s-service-name">{s.name}</span>
                <span className="s-dots" />
                <span className="s-muted">{s.duration_min} min</span>
                <span className="s-price">{brl(s.price_cents)}</span>
              </div>
            ))}
          </div>
        </div>
        <div id="funcionamento" className="s-info">
          <h3 className="s-h3">O salão</h3>
          {(shop.address || shop.city) && <div><div className="s-label">Endereço</div><div>{shop.address}{shop.city && <><br />{shop.city}</>}</div></div>}
          {shop.hours_text.length > 0 && <div><div className="s-label">Funcionamento</div><div>{shop.hours_text.map((l, i) => <div key={i}>{l}</div>)}</div></div>}
          <div>
            <div className="s-label">Contato</div>
            <div className="s-contact">
              {shop.phone && <a href={`tel:+55${shop.phone.replace(/\D/g, '')}`} className="s-link-plain">Telefone: {shop.phone}</a>}
              {waLink && <a href={waLink} target="_blank" rel="noopener">WhatsApp: {shop.whatsapp ? formatPhone(shop.whatsapp.replace(/^55/, '')) : ''}</a>}
              {igLink && <a href={igLink} target="_blank" rel="noopener">Instagram: @{shop.instagram}</a>}
            </div>
          </div>
          <div><div className="s-label">Pagamento</div><div>No salão, depois do atendimento: dinheiro, Pix ou cartão</div></div>
          <button className="s-btn" onClick={() => openBooking()}>Agendar meu horário</button>
        </div>
      </section>

      <section data-reveal id="duvidas" className="s-section">
        <h2 className="s-h2" style={{ marginBottom: 32 }}>Ainda na dúvida?</h2>
        <div className="s-faq">
          {[
            ['"Mas eu prefiro marcar pelo WhatsApp…"', 'Pode continuar. O site só garante o horário na hora, e o lembrete chega lá.'],
            ['"Mas preciso pagar antes pelo site?"', 'Não. Você paga no salão, depois do atendimento.'],
            ['"Mas e se eu não puder ir?"', `Remarque ou cancele até ${shop.cancel_hours} horas antes.`],
            ['"Mas é complicado de usar?"', 'São três passos: profissional, serviço, horário. Pronto.'],
          ].map(([q, a]) => (
            <div key={q}><h3>{q}</h3><p>{a}</p></div>
          ))}
        </div>
      </section>

      <section data-reveal className="s-section">
        <div className="s-final">
          <h2>Seu próximo horário está a três cliques de distância.</h2>
          <p>Profissional, serviço, horário. Paga depois do atendimento.</p>
          <button className="s-btn s-btn-lg" onClick={() => openBooking()}>Agendar agora</button>
          <p className="s-final-note">A agenda da sua profissional é limitada. Garanta o seu horário.</p>
        </div>
      </section>

      <footer className="s-footer">
        <div className="s-section"><span>{shop.name}{shop.address ? ` · ${shop.address.split('·')[0].trim()}` : ''}{shop.city ? ` · ${shop.city.replace(' / ', '/')}` : ''}</span></div>
      </footer>

      {isMobile && (
        <>
          <div style={{ height: 84 }} />
          <div className="s-sticky-cta"><button className="s-btn" onClick={() => openBooking()}>Agendar meu horário</button></div>
        </>
      )}

      {booking && (
        <Booking
          shop={shop} professionals={professionals} services={services} days={days} busy={busy} now={now || new Date()}
          initialProfessional={booking.professionalId} nextFree={nextFree}
          onClose={() => setBooking(null)} onBooked={loadBusy}
        />
      )}
    </div>
  )
}

// O fundo do topo aceita vídeos e imagens.
const IMAGE = /\.(jpe?g|png|webp)(\?|$)/i

function Hero({ videos, freeLabel, onBook }: { videos: string[]; freeLabel: string; onBook: () => void }) {
  const refs = useRef<(HTMLVideoElement | null)[]>([])
  const [vid, setVid] = useState(0)

  useEffect(() => {
    if (videos.length === 0) return
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const play = (n: number) => {
      refs.current.forEach((v, k) => {
        if (!v) return
        v.muted = true
        if (k === n) { try { v.currentTime = 0 } catch {} v.play().catch(() => {}) } else v.pause()
      })
      setVid(n)
      timer = setTimeout(() => { i = (n + 1) % videos.length; play(i) }, 6000)
    }
    play(0)
    return () => clearTimeout(timer)
  }, [videos])

  return (
    <section id="topo" className="s-hero">
      <div className="s-hero-bg">
        {videos.map((src, i) => IMAGE.test(src)
          ? <img key={src} src={src} alt="" style={{ opacity: vid === i ? 1 : 0 }} />
          : <video key={src} ref={(el) => { refs.current[i] = el }} src={src} playsInline muted preload="auto" style={{ opacity: vid === i ? 1 : 0 }} />)}
      </div>
      <div className="s-hero-shade" />
      <div className="s-hero-fade" />
      <div className="s-hero-content">
        <div data-reveal className="s-hero-text">
          <div className="s-pill"><span className="s-dot" /><span>{freeLabel}</span></div>
          <h1>Agende seu horário sem mandar mensagem.</h1>
          <p>Escolha a profissional, pegue o horário e receba o lembrete no WhatsApp.</p>
          <div className="s-hero-ctas">
            <button className="s-btn s-btn-lg" onClick={onBook}>Agendar meu horário</button>
            <a href="#profissionais" className="s-btn-ghost">Ver horários livres</a>
          </div>
        </div>
      </div>
    </section>
  )
}

type BookingProps = {
  shop: Shop; professionals: Professional[]; services: Service[]; days: string[]; busy: Interval[]; now: Date
  initialProfessional?: string; nextFree: (b: Professional) => string; onClose: () => void; onBooked: () => void
}

function Booking({ shop, professionals, services, days, busy, now, initialProfessional, nextFree, onClose, onBooked }: BookingProps) {
  const tz = shop.timezone
  const [step, setStep] = useState(initialProfessional ? 2 : 1)
  const [professionalId, setProfessionalId] = useState<string | undefined>(initialProfessional)
  const [serviceId, setServiceId] = useState<string>()
  const [day, setDay] = useState(0)
  const [week, setWeek] = useState(0)
  const [slot, setSlot] = useState<{ label: string; start: Date }>()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  const professional = professionals.find((b) => b.id === professionalId)
  const service = services.find((s) => s.id === serviceId)
  const dayKey = days[day]
  const slots = professional && service ? buildSlots(professional, dayKey, tz, service.duration_min, busy, now) : null
  const isOff = professional && slots === null
  const allBusy = slots && slots.length > 0 && slots.every((s) => s.busy)
  const noneLeft = slots && slots.length === 0

  // Situação de cada dia para o seletor: folga, lotado ou com horário livre
  const dayState = (i: number) => {
    if (!professional || !service) return 'free'
    const sl = buildSlots(professional, days[i], tz, service.duration_min, busy, now)
    if (sl === null) return 'off'
    return sl.some((x) => !x.busy) ? 'free' : 'full'
  }
  const pickService = (id: string) => {
    const svc = services.find((x) => x.id === id)
    const first = professional && svc ? days.findIndex((d) => buildSlots(professional, d, tz, svc.duration_min, busy, now)?.some((x) => !x.busy)) : -1
    const i = first < 0 ? 0 : first
    setServiceId(id); setSlot(undefined); setDay(i); setWeek(Math.floor(i / 7)); setStep(3)
  }
  const weekDays = days.slice(week * 7, week * 7 + 7)
  const weeks = Math.ceil(days.length / 7)
  const monthOf = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long' })
  const weekTitle = (() => {
    const a = monthOf(weekDays[0]), b = monthOf(weekDays[weekDays.length - 1])
    const t = a === b ? a : `${a} / ${b}`
    return t.charAt(0).toUpperCase() + t.slice(1)
  })()

  const digits = phone.replace(/\D/g, '')
  const cant = !(name.trim().length > 1 && digits.length >= 10 && consent) || sending

  const labels = ['Passo 1 de 4 · Profissional', 'Passo 2 de 4 · Serviço', 'Passo 3 de 4 · Horário', 'Passo 4 de 4 · Seus dados', 'Confirmado']
  const summaryTitle = `${service?.name || ''} com ${professional?.name.split(' ')[0] || ''}`
  const summaryWhen = slot ? `${relativeDay(dayKey, tz)}, ${dayKey.slice(8)}/${dayKey.slice(5, 7)} às ${slot.label}` : ''

  const confirm = async () => {
    if (cant || !professional || !service || !slot) return
    setSending(true)
    setError('')
    const { data, error } = await supabase.rpc('book_appointment', {
      p_shop_slug: shop.slug, p_professional_id: professional.id, p_service_id: service.id, p_starts_at: slot.start.toISOString(),
      p_client_name: name, p_client_phone: digits, p_consent: consent,
    })
    setSending(false)
    if (error) {
      setError(errorMessage(error))
      onBooked()
      return
    }
    const row = Array.isArray(data) ? data[0] : data
    setToken(row?.cancel_token || '')
    setStep(5)
    onBooked()
  }

  return (
    <div className="s-modal-bg" onClick={onClose}>
      <div className="s-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="s-modal-head">
          <div className="s-modal-top">
            {step > 1 && step < 5 ? <button className="s-back" onClick={() => { setError(''); setStep(step - 1) }}>← Voltar</button> : <span />}
            <span className="s-step">{labels[step - 1]}</span>
            <button className="s-close" aria-label="Fechar" onClick={onClose}>×</button>
          </div>
          <div className="s-progress">
            {[1, 2, 3, 4].map((n) => <div key={n} className={n <= Math.min(step, 4) ? 'on' : ''} />)}
          </div>
        </div>

        <div className="s-modal-body">
          {step === 1 && (
            <>
              <h3 className="s-h3">Quem vai te atender?</h3>
              {professionals.map((b) => {
                const { daysLabel, hoursLabel } = scheduleLabels(b.hours)
                return (
                  <button key={b.id} className={'s-opt' + (professionalId === b.id ? ' sel' : '')} onClick={() => { setProfessionalId(b.id); setSlot(undefined); setStep(2) }}>
                    {b.photo_url ? <img className="s-avatar" src={b.photo_url} alt="" /> : <span className="s-avatar" />}
                    <span className="s-opt-main"><b>{b.name}</b><small>{daysLabel}{hoursLabel && `, ${hoursLabel}`}</small></span>
                    <span className="s-next s-opt-next">{nextFree(b)}</span>
                  </button>
                )
              })}
            </>
          )}

          {step === 2 && (
            <>
              <h3 className="s-h3">Qual serviço?</h3>
              {services.map((s) => (
                <button key={s.id} className={'s-opt' + (serviceId === s.id ? ' sel' : '')} onClick={() => pickService(s.id)}>
                  <span className="s-opt-main"><b>{s.name}</b><small>{s.duration_min} min</small></span>
                  <span className="s-price">{brl(s.price_cents)}</span>
                </button>
              ))}
            </>
          )}

          {step === 3 && professional && service && (
            <>
              <h3 className="s-h3" style={{ marginBottom: 2 }}>Escolha o horário</h3>
              <p className="s-muted" style={{ margin: '0 0 6px' }}>{professional.name} · {service.name} ({service.duration_min} min)</p>
              <div className="s-week-head">
                <button className="s-week-nav" aria-label="Semana anterior" disabled={week === 0} onClick={() => setWeek(week - 1)}>‹</button>
                <span>{weekTitle}</span>
                <button className="s-week-nav" aria-label="Próxima semana" disabled={week >= weeks - 1} onClick={() => setWeek(week + 1)}>›</button>
              </div>
              <div className="s-days">
                {weekDays.map((d, k) => {
                  const i = week * 7 + k
                  const st = dayState(i)
                  return (
                    <button key={d} disabled={st === 'off'} className={'s-day ' + st + (i === day ? ' sel' : '')} onClick={() => { setDay(i); setSlot(undefined) }}>
                      <span>{i === 0 ? 'Hoje' : WEEKDAYS[weekdayOf(d)]}</span><b>{Number(d.slice(8))}</b>
                      <small>{st === 'off' ? 'folga' : st === 'full' ? 'lotado' : ''}</small>
                    </button>
                  )
                })}
              </div>
              {(isOff || allBusy || noneLeft) && (
                <div className="s-empty">
                  {isOff ? `${professional.name.split(' ')[0]} está de folga neste dia.` : allBusy ? 'Dia lotado. Tenta outro dia.' : 'Sem horários restantes neste dia. Tenta o próximo.'}
                </div>
              )}
              <div className="s-slots">
                {(slots || []).map((t) => (
                  <button key={t.label} disabled={t.busy} className={'s-slot' + (t.busy ? ' busy' : '') + (slot?.label === t.label ? ' sel' : '')}
                    onClick={() => { setSlot(t); setError(''); setStep(4) }}>{t.label}</button>
                ))}
              </div>
              <div className="s-hint">Riscado = ocupado</div>
            </>
          )}

          {step === 4 && (
            <>
              <h3 className="s-h3">Seus dados</h3>
              <div className="s-summary">
                <b>{summaryTitle}</b>
                <span>{summaryWhen}</span>
                <span className="s-price">{service && brl(service.price_cents)} · paga no salão</span>
              </div>
              <label className="s-field">Nome
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Como te chamamos?" autoComplete="name" />
              </label>
              <label className="s-field">WhatsApp
                <input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} inputMode="tel" placeholder="(11) 90000-0000" autoComplete="tel" />
              </label>
              <label className="s-check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>Aceito receber lembretes pelo WhatsApp. Usamos seu número só pra falar deste agendamento.</span>
              </label>
              {error && <div className="s-error">{error}</div>}
              <button className="s-btn s-confirm" disabled={cant} onClick={confirm}>{sending ? 'Reservando…' : 'Confirmar agendamento'}</button>
              <p className="s-hint" style={{ textAlign: 'center' }}>Nada é cobrado no site.</p>
            </>
          )}

          {step === 5 && (
            <div className="s-done">
              <div className="s-check-big">✓</div>
              <h3 className="s-h3" style={{ fontSize: 32 }}>Horário reservado, {name.trim().split(' ')[0]}.</h3>
              <div className="s-summary" style={{ width: '100%' }}>
                <b>{summaryTitle}</b>
                <span>{summaryWhen}</span>
                <span className="s-price">{service && brl(service.price_cents)} · paga no salão, depois do atendimento</span>
              </div>
              <p>Antes do horário o salão te manda um lembrete no WhatsApp ({phone}). Tolerância de atraso: {shop.late_tolerance_min} min.</p>
              {token && <a href={`/agendamento/${token}`} className="s-manage">Ver ou cancelar este agendamento</a>}
              {shop.address && <p className="s-hint">{shop.address}</p>}
              <button className="s-btn" onClick={onClose}>Fechar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function IconInstagram() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
}

export function IconWhatsApp() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M4 20l1.3-3.9A8.5 8.5 0 1 1 8 19z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8c-1-.4-1.8-1.2-2.2-2.2l.8-1-1-2z" fill="currentColor" stroke="none" /></svg>
}

