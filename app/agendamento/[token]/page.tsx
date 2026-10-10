'use client'

import { use, useEffect, useState } from 'react'
import { supabase, errorMessage } from '@/lib/supabase'
import { dayLabel, priceLabel, timeLabel, zoned } from '@/lib/time'

type Booking = {
  shop_slug: string; shop_name: string; shop_address: string | null; shop_whatsapp: string | null
  timezone: string; cancel_hours: number; professional_name: string; service_name: string; price_cents: number
  client_name: string; starts_at: string; status: string; country?: 'BR' | 'PT'; payment_text?: string | null
}

const STATUS: Record<string, string> = { pending: 'Confirmado', done: 'Concluído', noshow: 'Não compareceu', cancelled: 'Cancelado' }

export default function BookingPage({ params }: PageProps<'/agendamento/[token]'>) {
  const { token } = use(params)
  const [b, setB] = useState<Booking | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)

  const load = async () => {
    const { data } = await supabase.rpc('get_booking', { p_token: token })
    setB(Array.isArray(data) && data[0] ? (data[0] as Booking) : null)
  }
  useEffect(() => { load() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('cancel_booking', { p_token: token })
    setBusy(false)
    setAsking(false)
    if (error) setError(errorMessage(error))
    else load()
  }

  if (b === undefined) return <div className="site s-page-center"><p className="s-muted">Carregando…</p></div>
  if (b === null) return <div className="site s-page-center"><div className="s-card"><h1 className="s-h3">Agendamento não encontrado</h1><p className="s-muted">Confira o link que você recebeu.</p></div></div>

  const start = new Date(b.starts_at)
  const canCancel = b.status === 'pending' && start.getTime() - Date.now() >= b.cancel_hours * 3600000
  const wa = b.shop_whatsapp
    ? `https://wa.me/${b.shop_whatsapp}?text=${encodeURIComponent(`Olá! Sou ${b.client_name} e tenho horário ${dayLabel(zoned(start, b.timezone).key)} às ${timeLabel(start, b.timezone)}.`)}`
    : null

  return (
    <div className="site s-page-center">
      <div className="s-card">
        <p className="s-eyebrow" style={{ margin: 0 }}>{b.shop_name}</p>
        <h1 className="s-h3" style={{ fontSize: 30 }}>Seu agendamento</h1>
        <div className="s-summary">
          <b>{b.service_name} com {b.professional_name.split(' ')[0]}</b>
          <span>{dayLabel(zoned(start, b.timezone).key)} às {timeLabel(start, b.timezone)}</span>
          <span className="s-price">{priceLabel(b.price_cents, b.country)}{b.payment_text ? '' : ' · paga no salão'}</span>
        </div>
        <p className="s-muted">Status: <b style={{ color: b.status === 'cancelled' ? '#F5B08F' : '#5BD38A' }}>{STATUS[b.status] || b.status}</b></p>
        {b.shop_address && <p className="s-muted">{b.shop_address}</p>}
        {error && <div className="s-error">{error}</div>}
        {b.status === 'pending' && (canCancel
          ? <button className="s-btn-outline" style={{ padding: 14 }} disabled={busy} onClick={() => setAsking(true)}>Cancelar agendamento</button>
          : <p className="s-muted">Faltam menos de {b.cancel_hours} horas. Pra cancelar, fale com o salão.</p>)}
        {b.status === 'pending' && canCancel && <p className="s-muted">Pra remarcar: cancele este horário e escolha outro.</p>}
        <a className="s-btn" href={`/${b.shop_slug}`}>{b.status === 'pending' ? 'Escolher outro horário' : 'Marcar novo horário'}</a>
        {wa && <a href={wa} target="_blank" rel="noopener" style={{ textAlign: 'center', fontWeight: 700 }}>Falar com o salão no WhatsApp</a>}
      </div>
      {asking && (
        <div className="s-modal-bg" onClick={() => setAsking(false)}>
          <div className="s-modal s-confirm" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <h2 className="s-h3">Cancelar agendamento?</h2>
            <p className="s-muted" style={{ fontSize: 15, lineHeight: 1.5 }}>{b.service_name} com {b.professional_name.split(' ')[0]}, {dayLabel(zoned(start, b.timezone).key)} às {timeLabel(start, b.timezone)}. O horário fica livre pra outra pessoa.</p>
            <div className="s-confirm-actions">
              <button className="s-btn-outline" style={{ padding: 14 }} onClick={() => setAsking(false)} autoFocus>Manter</button>
              <button className="s-btn" disabled={busy} onClick={cancel}>{busy ? 'Cancelando…' : 'Sim, cancelar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
