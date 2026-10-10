import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  // Endereço público: as prévias de link (WhatsApp, Instagram) precisam de URLs absolutas.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://agenda-por-profissional.vercel.app'),
  title: 'Agenda Unhas',
  description: 'Site de agendamento para salões de beleza: cada profissional com a própria agenda.',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=Albert+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Serif+Display&family=Manrope:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
