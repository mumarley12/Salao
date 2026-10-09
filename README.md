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
