export type Shop = {
  id: string
  slug: string
  name: string
  address: string | null
  city: string | null
  phone: string | null
  whatsapp: string | null
  instagram: string | null
  hours_text: string[]
  timezone: string
  logo_url: string | null
  hero_videos: string[]
  gallery: { url: string; label: string }[]
  cancel_hours: number
  late_tolerance_min: number
  country: 'BR' | 'PT'
  payment_text: string | null
  policy: { title: string; items: string[] }[]
  announcement: { title: string; text: string; until: string } | null
  // 'slots': o site mostra só as vagas publicadas no Calendário do painel (painel 2a / site 1c).
  booking_mode?: 'hours' | 'slots'
  tiktok?: string | null
  deposit_cents?: number
  confirm_until?: string
  remind_max_days?: number
  created_at: string
}

export type ProfessionalHours = { weekday: number; start_time: string; end_time: string }

export type Professional = {
  id: string
  shop_id: string
  name: string
  specialty: string | null
  photo_url: string | null
  active: boolean
  sort: number
  hours: ProfessionalHours[]
}

export type Service = {
  id: string
  shop_id: string
  name: string
  price_cents: number
  duration_min: number
  active: boolean
  sort: number
}

export type AppointmentStatus = 'pending' | 'done' | 'noshow' | 'cancelled'

export type Appointment = {
  id: string
  shop_id: string
  professional_id: string
  service_id: string | null
  service_name: string
  price_cents: number
  client_name: string
  client_phone: string | null
  starts_at: string
  ends_at: string
  status: AppointmentStatus
  source: 'site' | 'counter' | 'walkin' | 'manual'
  cancel_token: string
  created_at: string
  deposit_status?: DepositStatus
  deposit_cents?: number | null
  reminder_sent_at?: string | null
  client_confirmed_at?: string | null
  seen_at?: string | null
}

export type DepositStatus = 'pending' | 'sent' | 'paid'

// Vaga do Calendário. published: está no site; in_draft: está no rascunho do painel.
export type SlotRow = { id: string; professional_id: string; starts_at: string; published: boolean; in_draft: boolean }

// Vaga livre mostrada no site.
export type PublicSlot = { id: string; professional_id: string; starts_at: string }

export type NotificationPrefs = {
  new_booking: boolean; before_appt: boolean; before_min: 30 | 60 | 120; reminders_due: boolean
  reminders_hour: number; not_confirmed: boolean; deposit_missing: boolean
}

export type Block = {
  id: string
  professional_id: string
  starts_at: string
  ends_at: string
  all_day: boolean
  reason: string | null
}

export type Interval = { professional_id: string; starts_at: string; ends_at: string }
