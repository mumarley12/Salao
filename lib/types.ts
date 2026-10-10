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
  source: 'site' | 'counter' | 'walkin'
  cancel_token: string
  created_at: string
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
