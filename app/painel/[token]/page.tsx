import type { Metadata, Viewport } from 'next'
import Panel from './Panel'

export async function generateMetadata({ params }: PageProps<'/painel/[token]'>): Promise<Metadata> {
  const { token } = await params
  return {
    title: 'Painel do salão',
    robots: { index: false, follow: false },
    // Instalar no ecrã principal: no iPhone é a única forma de receber notificações.
    manifest: `/painel/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: 'Painel', statusBarStyle: 'default' },
  }
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#FBFAF8' }

export default async function Page({ params }: PageProps<'/painel/[token]'>) {
  const { token } = await params
  return <Panel token={token} />
}
