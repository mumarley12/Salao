import type { Professional, ProfessionalHours, Interval } from './types'

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const monthName = (m: number) => MONTHS[m - 1]

const pad = (n: number) => String(n).padStart(2, '0')

const partsCache = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string) {
  let f = partsCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    partsCache.set(tz, f)
  }
  return f
}

// Data e hora "de parede" de um instante no fuso do salão.
export function zoned(date: Date, tz: string) {
  const p: Record<string, number> = {}
  for (const x of formatter(tz).formatToParts(date)) if (x.type !== 'literal') p[x.type] = Number(x.value)
  const key = `${p.year}-${pad(p.month)}-${pad(p.day)}`
  return { y: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute, s: p.second, key, weekday: weekdayOf(key) }
}

function offsetMs(date: Date, tz: string) {
  const z = zoned(date, tz)
  return Date.UTC(z.y, z.m - 1, z.d, z.h, z.min, z.s) - Math.floor(date.getTime() / 1000) * 1000
}

// Instante correspondente a "dia + minutos desde 00:00" no fuso do salão.
export function atLocal(dayKey: string, minutes: number, tz: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, 0, minutes)
  let t = guess - offsetMs(new Date(guess), tz)
  t = guess - offsetMs(new Date(t), tz)
  return new Date(t)
}

export const todayKey = (tz: string) => zoned(new Date(), tz).key

export function addDays(dayKey: string, n: number) {
  const [y, m, d] = dayKey.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

export function weekdayOf(dayKey: string) {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}
export const fromMinutes = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

export const timeLabel = (iso: string | Date, tz: string) => {
  const z = zoned(new Date(iso), tz)
  return `${pad(z.h)}:${pad(z.min)}`
}

// "Ter, 06/10"
export function dayLabel(dayKey: string) {
  const [, m, d] = dayKey.split('-')
  return `${WEEKDAYS[weekdayOf(dayKey)]}, ${d}/${m}`
}

// "Hoje", "Amanhã" ou "Qui"
export function relativeDay(dayKey: string, tz: string) {
  const t = todayKey(tz)
  if (dayKey === t) return 'Hoje'
  if (dayKey === addDays(t, 1)) return 'Amanhã'
  return WEEKDAYS[weekdayOf(dayKey)]
}

export function brl(cents: number) {
  return 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })
}

const hourShort = (hhmm: string) => {
  const [h, m] = hhmm.split(':')
  return `${Number(h)}h${m && m !== '00' ? m : ''}`
}

// "Ter a Sáb" / "Seg, Qua e Sex"
function daysText(days: number[]) {
  const order = [1, 2, 3, 4, 5, 6, 0]
  const sorted = order.filter((d) => days.includes(d))
  if (sorted.length === 0) return 'Sem dias fixos'
  if (sorted.length === 7) return 'Todos os dias'
  const idx = sorted.map((d) => order.indexOf(d))
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  if (contiguous && sorted.length > 2) return `${WEEKDAYS[sorted[0]]} a ${WEEKDAYS[sorted[sorted.length - 1]]}`
  const names = sorted.map((d) => WEEKDAYS[d])
  return names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1]
}

// Resumo dos dias e do horário mais comum, com exceções: "9h às 18h (Dom até 14h)"
export function scheduleLabels(hours: ProfessionalHours[]) {
  const daysLabel = daysText(hours.map((h) => h.weekday))
  if (hours.length === 0) return { daysLabel, hoursLabel: '' }
  const count = new Map<string, number>()
  for (const h of hours) {
    const k = h.start_time.slice(0, 5) + '-' + h.end_time.slice(0, 5)
    count.set(k, (count.get(k) || 0) + 1)
  }
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const [ms, me] = main.split('-')
  const extras = hours
    .filter((h) => h.start_time.slice(0, 5) + '-' + h.end_time.slice(0, 5) !== main)
    .map((h) => (h.start_time.slice(0, 5) === ms ? `${WEEKDAYS[h.weekday]} até ${hourShort(h.end_time)}` : `${WEEKDAYS[h.weekday]} ${hourShort(h.start_time)} às ${hourShort(h.end_time)}`))
  return { daysLabel, hoursLabel: `${hourShort(ms)} às ${hourShort(me)}` + (extras.length ? ` (${extras.join(', ')})` : '') }
}

export type Slot = { label: string; start: Date; busy: boolean }

export const SLOT_STEP_MIN = 30

// Horários de uma profissional num dia: grade de 30 min que cabe no expediente com a duração do serviço.
export function buildSlots(professional: Professional, dayKey: string, tz: string, durationMin: number, busy: Interval[], now = new Date()): Slot[] | null {
  const h = professional.hours.find((x) => x.weekday === weekdayOf(dayKey))
  if (!h) return null
  const start = toMinutes(h.start_time)
  const end = toMinutes(h.end_time)
  const mine = busy.filter((b) => b.professional_id === professional.id).map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()])
  const out: Slot[] = []
  for (let t = start; t + durationMin <= end; t += SLOT_STEP_MIN) {
    const s = atLocal(dayKey, t, tz)
    if (s.getTime() <= now.getTime()) continue
    const e = s.getTime() + durationMin * 60000
    out.push({ label: fromMinutes(t), start: s, busy: mine.some(([bs, be]) => bs < e && be > s.getTime()) })
  }
  return out
}

export function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0] || '').slice(0, 2).join('').toUpperCase()
}

export function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length > 6) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return d
}

// Telefone salvo (só dígitos) para link do WhatsApp com DDI 55.
export function waNumber(digits: string) {
  const d = digits.replace(/\D/g, '')
  return d.length <= 11 ? '55' + d : d
}
