import { redirect } from 'next/navigation'
import { DEMO_PANEL_TOKEN } from '@/lib/demo'

export function GET() {
  redirect(`/painel/${DEMO_PANEL_TOKEN}`)
}
