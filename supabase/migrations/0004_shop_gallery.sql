-- Fotos da seção "Cortes" do site: [{"url": "...", "label": "degradê"}, ...]
alter table public.shops add column gallery jsonb not null default '[]'::jsonb;
grant select (gallery) on public.shops to anon, authenticated;
