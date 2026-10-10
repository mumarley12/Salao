'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, errorMessage } from '@/lib/supabase'
import type { PublicSlot, Service, Shop } from '@/lib/types'
import { displayPhone, formatPhone, hourLabel, money, monthName, priceLabel, todayKey, waNumber, WD_SHORT, weekdayOf, zoned } from '@/lib/time'
import { IconInstagram, IconWhatsApp } from './ShopSite'

// Site 1c (claro nude/terracota): a cliente escolhe uma das vagas publicadas no painel,
// o serviço e deixa o contacto. Usado pelos salões com booking_mode = 'slots'.

const MONTHS_AHEAD = 6

type Props = { shop: Shop; services: Service[] }
type Pick = { slot: PublicSlot; day: string; label: string }

export default function SlotsSite({ shop, services }: Props) {
  const tz = shop.timezone
  const country = shop.country || 'PT'
  const [slots, setSlots] = useState<PublicSlot[] | null>(null)
  const [pick, setPick] = useState<Pick | null>(null)
  const [serviceId, setServiceId] = useState(services[0]?.id || '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [booked, setBooked] = useState('')
  const [openPolicy, setOpenPolicy] = useState(0)

  const loadSlots = useCallback(async () => {
    const from = new Date()
    const to = new Date(from.getTime() + MONTHS_AHEAD * 31 * 86400000)
    const { data } = await supabase.rpc('public_slots', { p_slug: shop.slug, p_from: from.toISOString(), p_to: to.toISOString() })
    setSlots((data as PublicSlot[]) || [])
  }, [shop.slug])

  useEffect(() => {
    loadSlots()
    const id = setInterval(loadSlots, 60000)
    return () => clearInterval(id)
  }, [loadSlots])

  // Vagas agrupadas por mês e por dia.
  const months = useMemo(() => {
    const out: { key: string; days: { key: string; slots: PublicSlot[] }[]; total: number }[] = []
    for (const s of slots || []) {
      const day = zoned(new Date(s.starts_at), tz).key
      const mk = day.slice(0, 7)
      let m = out[out.length - 1]
      if (!m || m.key !== mk) out.push((m = { key: mk, days: [], total: 0 }))
      let d = m.days[m.days.length - 1]
      if (!d || d.key !== day) m.days.push((d = { key: day, slots: [] }))
      d.slots.push(s)
      m.total++
    }
    return out
  }, [slots, tz])

  const dm = (day: string) => `${Number(day.slice(8))}/${Number(day.slice(5, 7))}`
  const first = slots?.[0]
  const nextLabel = slots === null ? 'A carregar vagas…'
    : first ? (() => { const d = zoned(new Date(first.starts_at), tz).key; return `Próxima vaga: ${WD_SHORT[weekdayOf(d)]} ${dm(d)} às ${hourLabel(first.starts_at, tz)}` })()
    : 'Sem vagas de momento'

  const waLink = shop.whatsapp ? `https://wa.me/${shop.whatsapp}?text=${encodeURIComponent(`Olá! Vim pelo site da ${shop.name}.`)}` : null
  const igLink = shop.instagram ? `https://instagram.com/${shop.instagram}` : null
  const ttLink = shop.tiktok ? `https://www.tiktok.com/@${shop.tiktok}` : null
  const announcement = shop.announcement && shop.announcement.until >= todayKey(tz) ? shop.announcement : null
  const policy = shop.policy || []
  const gallery = (shop.gallery || []).filter((g) => g.url)

  const digits = phone.replace(/\D/g, '')
  const phoneOk = country === 'PT' ? digits.length === 9 : digits.length >= 10
  const ok = !!pick && !!serviceId && name.trim().length > 1 && phoneOk && !sending
  const service = services.find((s) => s.id === serviceId)

  const goHorarios = () => document.getElementById('horarios')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const confirm = async () => {
    if (!ok || !pick) return
    setSending(true)
    setError('')
    const { error } = await supabase.rpc('book_slot', { p_slot_id: pick.slot.id, p_service_id: serviceId, p_client_name: name, p_client_phone: digits })
    setSending(false)
    if (error) { setError(errorMessage(error)); loadSlots(); return }
    setBooked(`${pick.label} · ${service?.name || ''}`)
    setPick(null); setName(''); setPhone('')
    loadSlots()
  }

  return (
    <div className="ns">
      <header className="ns-header">
        <a href="#topo" className="ns-brand">{shop.name}</a>
        <div className="ns-icons">
          {ttLink && <a href={ttLink} target="_blank" rel="noopener" aria-label="TikTok" title="TikTok"><IconTikTok /></a>}
          {igLink && <a href={igLink} target="_blank" rel="noopener" aria-label="Instagram" title="Instagram"><IconInstagram /></a>}
          {waLink && <a href={waLink} target="_blank" rel="noopener" aria-label="WhatsApp" title="WhatsApp"><IconWhatsApp /></a>}
        </div>
      </header>

      <section id="topo" className="ns-hero">
        <HeroVideos videos={shop.hero_videos} />
        <div className="ns-hero-shade" />
        <div className="ns-hero-fade" />
        <div className="ns-hero-in">
          <div className="ns-pill">{nextLabel}</div>
          <h1>Mãos lindas, marcação fácil.</h1>
          <p>Marque em 3 etapas: escolha a vaga, o serviço e deixe o seu contacto.</p>
          <div className="ns-hero-ctas">
            <button className="ns-btn" onClick={goHorarios}>Agendar horário</button>
            <a href="#servicos" className="ns-link">Ver serviços</a>
          </div>
        </div>
      </section>

      {announcement && (
        <section className="ns-sec">
          <div className="ns-promo">
            <span className="ns-eyebrow">{announcement.title}</span>
            <p>{announcement.text}</p>
          </div>
        </section>
      )}

      <section id="horarios" className="ns-sec">
        <h2 className="ns-h2">Horários</h2>
        {slots !== null && months.length === 0 && (
          <div className="ns-card"><p className="ns-muted" style={{ margin: 0 }}>Sem vagas publicadas de momento. Volte em breve{igLink ? ' ou acompanhe as novidades no Instagram' : ''}.</p></div>
        )}
        {booked && <p className="ns-ok">Reservado: {booked}.</p>}
        {months.map((m) => (
          <div key={m.key} className="ns-card ns-vagas">
            <div className="ns-vagas-head"><span>Vagas de {monthName(Number(m.key.slice(5)))}</span><span className="ns-count">{m.total} {m.total === 1 ? 'vaga' : 'vagas'}</span></div>
            {m.days.map((d) => (
              <div key={d.key} className="ns-day">
                <span className="ns-day-n"><b>{Number(d.key.slice(8))}</b> <span>{WD_SHORT[weekdayOf(d.key)]}</span></span>
                <div className="ns-day-slots">
                  {d.slots.map((s) => {
                    const sel = pick?.slot.id === s.id
                    const label = hourLabel(s.starts_at, tz)
                    return (
                      <button key={s.id} className={'ns-slot' + (sel ? ' sel' : '')} aria-pressed={sel}
                        onClick={() => { setPick(sel ? null : { slot: s, day: d.key, label: `${dm(d.key)} às ${label}` }); setBooked(''); setError('') }}>{label}</button>
                    )
                  })}
                </div>
              </div>
            ))}
            {pick && pick.day.slice(0, 7) === m.key && (
              <div className="ns-form">
                <b>{pick.label}</b>
                <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label="Serviço">
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.price_cents > 0 ? ` · ${money(s.price_cents, country)}` : ''}</option>)}
                </select>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" autoComplete="name" aria-label="Nome" />
                <input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value, country))} placeholder={country === 'PT' ? 'Telemóvel · 912 345 678' : 'WhatsApp · (11) 90000-0000'} inputMode="tel" autoComplete="tel" aria-label="Telemóvel" />
                {error && <p className="ns-error">{error}</p>}
                <button className="ns-btn ns-btn-sm" disabled={!ok} onClick={confirm}>{sending ? 'A reservar…' : 'Confirmar marcação'}</button>
                {policy.length > 0 && <small className="ns-muted">Ao confirmar, aceita a <a href="#politica">política de agendamento</a>.</small>}
              </div>
            )}
          </div>
        ))}
      </section>

      <section id="servicos" className="ns-sec">
        <h2 className="ns-h2">Serviços</h2>
        {services.map((s) => (
          <div key={s.id} className="ns-svc">
            <span className="ns-svc-name">{s.name}</span>
            <span className="ns-dots" />
            {s.price_cents > 0 && <span className="ns-muted">{s.duration_min} min</span>}
            <span className="ns-price">{priceLabel(s.price_cents, country)}</span>
          </div>
        ))}
      </section>

      {gallery.length > 0 && (
        <section id="trabalhos" className="ns-band">
          <h2 className="ns-h2">Trabalhos</h2>
          <div className="ns-marquee">
            <div className="ns-track">
              {[0, 1].flatMap((k) => gallery.map((g) => (
                <div key={k + g.url} className="ns-tile"><img src={g.url} alt={k ? '' : g.label} loading="lazy" /></div>
              )))}
            </div>
          </div>
        </section>
      )}

      <section className="ns-sec">
        <h2 className="ns-h2" style={{ marginBottom: 8 }}>Como marcar</h2>
        {['Escolhe o serviço', 'Pega o horário livre', 'Recebe o lembrete no WhatsApp'].map((t, i) => (
          <div key={t} className="ns-step"><span>{i + 1}</span>{t}</div>
        ))}
        <p className="ns-note">Nada é cobrado no site.{policy.length ? ' Antes de marcar, veja a política de agendamento.' : ''}</p>
      </section>

      {policy.length > 0 && (
        <section id="politica" className="ns-sec">
          <h2 className="ns-h2">Política de agendamento</h2>
          <div className="ns-card ns-acc">
            {policy.map((p, i) => (
              <div key={p.title}>
                <button aria-expanded={openPolicy === i} onClick={() => setOpenPolicy(openPolicy === i ? -1 : i)}><span>{p.title}</span><span className="ns-sign">{openPolicy === i ? '−' : '+'}</span></button>
                {openPolicy === i && <div className="ns-acc-body">{p.items.map((t, k) => <p key={k}>{t}</p>)}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="ns-sec ns-sec-last">
        <div className="ns-card ns-info">
          <h3>O salão</h3>
          {(shop.address || shop.city) && <div><div className="ns-label">Endereço</div><div>{shop.address}{shop.city && <><br />{shop.city}</>}</div></div>}
          {shop.hours_text.length > 0 && <div><div className="ns-label">Funcionamento</div>{shop.hours_text.map((l, i) => <div key={i}>{l}</div>)}</div>}
          {(waLink || igLink || shop.phone) && (
            <div>
              <div className="ns-label">Contato</div>
              {shop.phone && <div><a href={`tel:+${waNumber(shop.phone, country)}`}>Telefone: {shop.phone}</a></div>}
              {waLink && <div><a href={waLink} target="_blank" rel="noopener">WhatsApp: {displayPhone(shop.whatsapp || '', country)}</a></div>}
              {igLink && <div><a href={igLink} target="_blank" rel="noopener">Instagram: @{shop.instagram}</a></div>}
            </div>
          )}
          {shop.payment_text && <div><div className="ns-label">Pagamento</div><div>{shop.payment_text}</div></div>}
        </div>
      </section>

      <footer className="ns-footer">{shop.name}{shop.address ? ` · ${shop.address.split('·')[0].trim()}` : ''}{shop.city ? ` · ${shop.city}` : ''}</footer>

      <div className="ns-sticky"><button className="ns-btn" onClick={goHorarios}>Agendar horário</button></div>
    </div>
  )
}

// Vídeos do topo, sem som, 5 s cada. "#t=início,fim" no endereço escolhe o trecho a repetir.
function HeroVideos({ videos }: { videos: string[] }) {
  const clips = useMemo(() => videos.map((src) => {
    const m = /#t=([\d.]+)(?:,([\d.]+))?$/.exec(src)
    return { src, start: m ? Number(m[1]) : 0, end: m?.[2] ? Number(m[2]) : Infinity }
  }), [videos])
  const refs = useRef<(HTMLVideoElement | null)[]>([])
  const [cur, setCur] = useState(0)

  useEffect(() => {
    if (clips.length === 0) return
    const v = refs.current[cur]
    if (v) {
      v.muted = true
      try { v.currentTime = clips[cur].start } catch {}
      v.play().catch(() => {})
    }
    refs.current.forEach((o, i) => { if (o && i !== cur) o.pause() })
    const t = setTimeout(() => setCur((cur + 1) % clips.length), 5000)
    return () => clearTimeout(t)
  }, [cur, clips])

  return (
    <div className="ns-hero-bg">
      {clips.map((c, i) => (
        <video key={c.src} ref={(el) => { refs.current[i] = el }} src={c.src} muted playsInline preload={i === 0 ? 'auto' : 'metadata'}
          style={{ opacity: cur === i ? 1 : 0 }}
          onTimeUpdate={(e) => { const v = e.currentTarget; if (v.currentTime >= c.end || v.currentTime < c.start - 0.25) v.currentTime = c.start }} />
      ))}
    </div>
  )
}

function IconTikTok() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 3c.4 2.6 2.2 4.4 5 4.6" /></svg>
}
