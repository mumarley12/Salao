# Agenda por Profissional

Site de agendamento + painel para salões de beleza e manicures. Cada salão tem o próprio site
(`/<slug>`) e um painel acessado por link secreto (`/painel/<token>`).

- **Next.js 16** (App Router) + **Supabase** (projeto `salao`).
- `supabase/migrations/`: tabelas, regras de acesso e funções (agendamento, painel, demonstração).
- `assets/media/`: imagens fictícias do salão de demonstração, servidas pela rota `/media/<arquivo>`.

## Demonstração

- Site: `/espacolumi` (Espaço Lumi, dados fictícios)
- Painel: `/demo/painel`. O link é público e os dados voltam ao original a cada hora (`public.demo_reset()` agendado no pg_cron).

## Rodar local

```bash
npm install
npm run dev
```

## Vagas publicadas (Danieela_nails)

Salões com `booking_mode = 'slots'` usam o site 1c (`app/[slug]/SlotsSite.tsx`) e o painel 2a
(`app/painel/[token]/SlotsPanel.tsx`): a dona publica as vagas no Calendário do painel, controla o sinal
(pendente → pedido → pago) e os lembretes de véspera. Banco: `supabase/migrations/0007_vagas_sinal_lembretes.sql`.

Notificações push (opcional): Edge Function `supabase/functions/notify` + `0008_notify_cron.sql`.
Precisa das chaves VAPID (segredos da função e `NEXT_PUBLIC_VAPID_PUBLIC_KEY` no Vercel); sem elas o painel
funciona normalmente e o botão "Ativar notificações" avisa que ainda não estão configuradas.
