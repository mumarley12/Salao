import type { Metadata } from 'next'
import Panel from './Panel'

export const metadata: Metadata = {
  title: 'Painel do salão',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: PageProps<'/painel/[token]'>) {
  const { token } = await params
  return <Panel token={token} />
}
