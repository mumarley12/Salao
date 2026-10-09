import { createClient } from '@supabase/supabase-js'

// Projeto "salao". A chave publicável é pública por natureza; as variáveis de ambiente
// permitem apontar para outro projeto sem mudar o código.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpdovyglnhcrzlgorgga.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_YwNO1pqDaAqN7dnmhYTwBg_2-jBjEHD'

// Só a chave pública: o banco protege tudo com RLS e funções que validam o acesso.
export const supabase = createClient(url, key, { auth: { persistSession: false } })

// Mensagem legível de um erro vindo do Supabase.
export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message
  return 'Algo deu errado. Tenta de novo.'
}
