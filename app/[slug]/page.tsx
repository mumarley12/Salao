import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Professional, Service, Shop } from '@/lib/types'
import ShopSite from './ShopSite'

const SHOP_COLUMNS = 'id, slug, name, address, city, phone, whatsapp, instagram, hours_text, timezone, logo_url, hero_videos, gallery, cancel_hours, late_tolerance_min, created_at'

async function load(slug: string) {
  const { data: shop } = await supabase.from('shops').select(SHOP_COLUMNS).eq('slug', slug).maybeSingle<Shop>()
  if (!shop) return null
  const [{ data: professionals }, { data: services }] = await Promise.all([
    supabase.from('professionals').select('*, hours:professional_hours(weekday, start_time, end_time)').eq('shop_id', shop.id).eq('active', true).order('sort'),
    supabase.from('services').select('*').eq('shop_id', shop.id).eq('active', true).order('sort'),
  ])
  return { shop, professionals: (professionals || []) as Professional[], services: (services || []) as Service[] }
}

export async function generateMetadata({ params }: PageProps<'/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const data = await load(slug)
  if (!data) return { title: 'Salão não encontrado' }
  const title = `${data.shop.name} · Agende seu horário`
  const description = `Escolha a profissional, pegue o horário e receba o lembrete no WhatsApp. ${data.shop.address || ''}`.trim()
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', locale: 'pt_BR', siteName: data.shop.name, url: `/${slug}` },
    icons: data.shop.logo_url ? { icon: data.shop.logo_url } : undefined,
  }
}

export default async function Page({ params }: PageProps<'/[slug]'>) {
  const { slug } = await params
  const data = await load(slug)
  if (!data) notFound()
  return <ShopSite shop={data.shop} professionals={data.professionals} services={data.services} />
}
