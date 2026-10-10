-- Painel 2a + site 1c (Danieela_nails): vagas publicadas, sinal, lembretes e notificações push.
--
-- Salão com booking_mode = 'slots' não usa o horário semanal: a dona publica as vagas no Calendário
-- do painel e o site mostra só essas vagas. Os outros salões (booking_mode = 'hours') continuam iguais.

-- 1. Salão --------------------------------------------------------------------
alter table public.shops
  add column if not exists booking_mode text not null default 'hours' check (booking_mode in ('hours', 'slots')),
  add column if not exists tiktok text,                                   -- sem @
  add column if not exists deposit_cents int not null default 1000 check (deposit_cents >= 0),
  add column if not exists confirm_until time not null default '22:00',   -- a cliente confirma o lembrete até esta hora
  add column if not exists remind_max_days int not null default 3 check (remind_max_days between 1 and 14);

grant select (booking_mode, tiktok, deposit_cents) on public.shops to anon, authenticated;

-- 2. Marcação: sinal, lembrete, aviso de nova -----------------------------------
alter table public.appointments
  add column if not exists deposit_status text not null default 'pending' check (deposit_status in ('pending', 'sent', 'paid')),
  add column if not exists deposit_cents int,              -- valor do sinal no momento em que foi pago
  add column if not exists deposit_sent_at timestamptz,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists client_confirmed_at timestamptz,
  add column if not exists seen_at timestamptz;             -- nulo = nova marcação do site ainda não vista no painel

-- As marcações que já existem não aparecem como "novas".
update public.appointments set seen_at = created_at where seen_at is null;

-- 'manual' = criada no painel pelo botão "+ Novo".
alter table public.appointments drop constraint if exists appointments_source_check;
alter table public.appointments add constraint appointments_source_check
  check (source in ('site', 'counter', 'walkin', 'manual'));

-- 3. Vagas ------------------------------------------------------------------------
-- published: está no site agora. in_draft: está no rascunho do Calendário.
-- "Publicar" faz o site ficar igual ao rascunho; "Cancelar alterações" faz o rascunho voltar ao site.
-- Vaga tirada fica com as duas marcas desligadas (nada é apagado) e volta se o horário for adicionado de novo.
create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  professional_id uuid not null references public.professionals on delete cascade,
  starts_at timestamptz not null,
  published boolean not null default false,
  in_draft boolean not null default true,
  created_at timestamptz not null default now(),
  unique (professional_id, starts_at)
);
create index if not exists slots_shop_time on public.slots (shop_id, starts_at);
alter table public.slots enable row level security;

-- 4. Notificações push ----------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz                                  -- desligada neste aparelho (não recebe mais)
);
create table if not exists public.notification_prefs (
  shop_id uuid primary key references public.shops on delete cascade,
  new_booking boolean not null default true,
  before_appt boolean not null default true,
  before_min int not null default 60 check (before_min in (30, 60, 120)),
  reminders_due boolean not null default true,
  reminders_hour int not null default 10 check (reminders_hour between 0 and 23),
  not_confirmed boolean not null default true,
  deposit_missing boolean not null default true
);
-- Um aviso por tipo e referência (marcação, ou salão + dia), para não repetir.
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  kind text not null,
  ref_id uuid not null,
  sent_at timestamptz not null default now(),
  unique (kind, ref_id)
);
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notification_log enable row level security;

-- 5. Painel ------------------------------------------------------------------------

-- Igual à da 0002, mais as vagas do período e as preferências de notificação.
create or replace function public.panel_data(p_token uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_shop uuid := public.panel_shop_id(p_token);
begin
  return jsonb_build_object(
    'shop', (select to_jsonb(s) - 'panel_token' from public.shops s where s.id = v_shop),
    'professionals', coalesce((
      select jsonb_agg(to_jsonb(b) || jsonb_build_object('hours', coalesce((
        select jsonb_agg(to_jsonb(h) order by h.weekday) from public.professional_hours h where h.professional_id = b.id), '[]'::jsonb))
        order by b.sort, b.created_at)
      from public.professionals b where b.shop_id = v_shop), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort, x.name) from public.services x where x.shop_id = v_shop), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.starts_at)
      from public.appointments a
      where a.shop_id = v_shop and a.status <> 'cancelled' and a.starts_at >= p_from and a.starts_at < p_to), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.starts_at)
      from public.blocks b where b.shop_id = v_shop and b.ends_at > now()), '[]'::jsonb),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'professional_id', x.professional_id, 'starts_at', x.starts_at,
                                          'published', x.published, 'in_draft', x.in_draft) order by x.starts_at)
      from public.slots x where x.shop_id = v_shop and (x.published or x.in_draft)
        and x.starts_at >= p_from and x.starts_at < p_to), '[]'::jsonb),
    'notification_prefs', (
      select to_jsonb(n) - 'shop_id'
      from (select * from public.notification_prefs where shop_id = v_shop
            union all
            select v_shop, true, true, 60, true, 10, true, true
            where not exists (select 1 from public.notification_prefs where shop_id = v_shop)) n)
  );
end;
$$;

-- Sinal: pending (por pedir) → sent (pedido enviado) → paid (pago; a marcação fica confirmada).
create or replace function public.panel_set_deposit(p_token uuid, p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_shop uuid := public.panel_shop_id(p_token);
begin
  if p_status not in ('pending', 'sent', 'paid') then raise exception 'Estado do sinal inválido.'; end if;
  update public.appointments a set
    deposit_status = p_status,
    deposit_sent_at = case when p_status = 'pending' then null when p_status = 'sent' then coalesce(a.deposit_sent_at, now()) else a.deposit_sent_at end,
    deposit_paid_at = case when p_status = 'paid' then now() end,
    deposit_cents = case when p_status = 'paid' then (select s.deposit_cents from public.shops s where s.id = v_shop) end
  where a.id = p_id and a.shop_id = v_shop;
end;
$$;

-- p_sent = false desfaz o envio (e a confirmação da cliente).
create or replace function public.panel_mark_reminder(p_token uuid, p_id uuid, p_sent boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.appointments set
    reminder_sent_at = case when p_sent then coalesce(reminder_sent_at, now()) end,
    client_confirmed_at = case when p_sent then client_confirmed_at end
  where id = p_id and shop_id = public.panel_shop_id(p_token);
$$;

create or replace function public.panel_mark_client_confirmed(p_token uuid, p_id uuid, p_ok boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.appointments set client_confirmed_at = case when p_ok then now() end
  where id = p_id and shop_id = public.panel_shop_id(p_token);
$$;

-- p_ids nulo = todas as novas.
create or replace function public.panel_mark_seen(p_token uuid, p_ids uuid[])
returns void
language sql security definer set search_path = ''
as $$
  update public.appointments set seen_at = now()
  where shop_id = public.panel_shop_id(p_token) and seen_at is null and (p_ids is null or id = any(p_ids));
$$;

-- Acrescenta uma vaga ao rascunho (ou devolve ao rascunho uma vaga publicada que tinha sido tirada).
create or replace function public.panel_add_slot(p_token uuid, p_professional_id uuid, p_starts_at timestamptz)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_shop uuid := public.panel_shop_id(p_token);
begin
  if not exists (select 1 from public.professionals b where b.id = p_professional_id and b.shop_id = v_shop) then
    raise exception 'Profissional inválida.';
  end if;
  if exists (select 1 from public.slots x where x.professional_id = p_professional_id and x.starts_at = p_starts_at and x.in_draft) then
    raise exception 'Esse horário já existe neste dia.';
  end if;
  insert into public.slots (shop_id, professional_id, starts_at) values (v_shop, p_professional_id, p_starts_at)
  on conflict (professional_id, starts_at) do update set in_draft = true;
end;
$$;

-- Tira vagas livres do rascunho. Vaga com cliente marcada não sai por aqui (use cancelar marcação).
create or replace function public.panel_remove_slots(p_token uuid, p_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_shop uuid := public.panel_shop_id(p_token);
begin
  if exists (
    select 1 from public.slots x join public.appointments a
      on a.professional_id = x.professional_id and a.starts_at = x.starts_at and a.status <> 'cancelled'
    where x.id = any(p_ids) and x.shop_id = v_shop
  ) then
    raise exception 'Esse horário tem cliente marcada. Cancele a marcação primeiro.';
  end if;
  update public.slots set in_draft = false where id = any(p_ids) and shop_id = v_shop;
end;
$$;

-- O site fica igual ao rascunho.
create or replace function public.panel_publish_slots(p_token uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_shop uuid := public.panel_shop_id(p_token);
begin
  update public.slots set published = in_draft where shop_id = v_shop and published <> in_draft;
end;
$$;

-- O rascunho volta a ser igual ao site.
create or replace function public.panel_discard_slots(p_token uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_shop uuid := public.panel_shop_id(p_token);
begin
  update public.slots set in_draft = published where shop_id = v_shop and published <> in_draft;
end;
$$;

-- Cancelar marcação. p_keep_slot: a vaga volta ao site; false: o horário deixa de existir (já, sem publicar).
create or replace function public.panel_cancel_appointment(p_token uuid, p_id uuid, p_keep_slot boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_shop uuid := public.panel_shop_id(p_token);
  v_appt public.appointments;
begin
  update public.appointments set status = 'cancelled' where id = p_id and shop_id = v_shop returning * into v_appt;
  if v_appt.id is null then raise exception 'Marcação não encontrada.'; end if;
  if not coalesce(p_keep_slot, true) then
    update public.slots set published = false, in_draft = false
    where shop_id = v_shop and professional_id = v_appt.professional_id and starts_at = v_appt.starts_at;
  end if;
end;
$$;

-- "+ Novo" do painel: marca a cliente e garante a vaga (publicada e no rascunho) nesse horário.
create or replace function public.panel_add_booking(
  p_token uuid, p_professional_id uuid, p_service_id uuid, p_starts_at timestamptz, p_client_name text, p_client_phone text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_shop public.shops;
  v_service public.services;
  v_phone text := nullif(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g'), '');
  v_id uuid;
begin
  select * into v_shop from public.shops where id = public.panel_shop_id(p_token);
  if not exists (select 1 from public.professionals b where b.id = p_professional_id and b.shop_id = v_shop.id) then
    raise exception 'Profissional inválida.';
  end if;
  select * into v_service from public.services s where s.id = p_service_id and s.shop_id = v_shop.id;
  if not found then raise exception 'Escolhe o serviço.'; end if;
  if length(trim(coalesce(p_client_name, ''))) < 2 then raise exception 'Escreve o nome da cliente.'; end if;
  if p_starts_at is null then raise exception 'Escolhe um horário.'; end if;
  if v_shop.country = 'PT' and length(v_phone) = 9 then v_phone := '351' || v_phone; end if;

  insert into public.appointments
    (shop_id, professional_id, service_id, service_name, price_cents, client_name, client_phone,
     starts_at, ends_at, status, source, seen_at)
  values
    (v_shop.id, p_professional_id, v_service.id, v_service.name, v_service.price_cents, trim(p_client_name), v_phone,
     p_starts_at, p_starts_at + make_interval(mins => v_service.duration_min), 'pending', 'manual', now())
  returning id into v_id;

  insert into public.slots (shop_id, professional_id, starts_at, published, in_draft)
  values (v_shop.id, p_professional_id, p_starts_at, true, true)
  on conflict (professional_id, starts_at) do update set published = true, in_draft = true;
  return v_id;
exception when exclusion_violation then
  raise exception 'Esse horário já está marcado.';
end;
$$;

create or replace function public.panel_save_deposit(p_token uuid, p_cents int)
returns void
language sql security definer set search_path = ''
as $$
  update public.shops set deposit_cents = greatest(coalesce(p_cents, 0), 0) where id = public.panel_shop_id(p_token);
$$;

create or replace function public.panel_save_notification_prefs(p_token uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_shop uuid := public.panel_shop_id(p_token);
begin
  insert into public.notification_prefs (shop_id) values (v_shop) on conflict (shop_id) do nothing;
  update public.notification_prefs set
    new_booking = coalesce((p_data->>'new_booking')::boolean, new_booking),
    before_appt = coalesce((p_data->>'before_appt')::boolean, before_appt),
    before_min = coalesce((p_data->>'before_min')::int, before_min),
    reminders_due = coalesce((p_data->>'reminders_due')::boolean, reminders_due),
    reminders_hour = coalesce((p_data->>'reminders_hour')::int, reminders_hour),
    not_confirmed = coalesce((p_data->>'not_confirmed')::boolean, not_confirmed),
    deposit_missing = coalesce((p_data->>'deposit_missing')::boolean, deposit_missing)
  where shop_id = v_shop;
end;
$$;

-- p_sub: o JSON de PushSubscription ({"endpoint": "...", "keys": {"p256dh": "...", "auth": "..."}}).
create or replace function public.panel_save_push_subscription(p_token uuid, p_sub jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_shop uuid := public.panel_shop_id(p_token);
begin
  if coalesce(p_sub->>'endpoint', '') !~ '^https://' or p_sub#>>'{keys,p256dh}' is null or p_sub#>>'{keys,auth}' is null then
    raise exception 'Inscrição de notificações inválida.';
  end if;
  insert into public.push_subscriptions (shop_id, endpoint, p256dh, auth)
  values (v_shop, p_sub->>'endpoint', p_sub#>>'{keys,p256dh}', p_sub#>>'{keys,auth}')
  on conflict (endpoint) do update set shop_id = excluded.shop_id, p256dh = excluded.p256dh, auth = excluded.auth, disabled_at = null;
end;
$$;

create or replace function public.panel_disable_push_subscription(p_token uuid, p_endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  update public.push_subscriptions set disabled_at = now() where endpoint = p_endpoint and shop_id = public.panel_shop_id(p_token);
$$;

-- Dados do salão: igual à 0002, mais o TikTok.
create or replace function public.panel_save_shop(p_token uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.shops set
    name = coalesce(nullif(trim(p_data->>'name'), ''), name),
    address = coalesce(p_data->>'address', address),
    city = coalesce(p_data->>'city', city),
    phone = coalesce(p_data->>'phone', phone),
    whatsapp = coalesce(regexp_replace(p_data->>'whatsapp', '\D', '', 'g'), whatsapp),
    instagram = coalesce(replace(p_data->>'instagram', '@', ''), instagram),
    tiktok = coalesce(replace(p_data->>'tiktok', '@', ''), tiktok),
    hours_text = coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'hours_text') x), hours_text)
  where id = public.panel_shop_id(p_token);
end;
$$;

-- 6. Site ----------------------------------------------------------------------------

-- Vagas publicadas, futuras e sem cliente (nem bloqueio) nesse instante.
create or replace function public.public_slots(p_slug text, p_from timestamptz, p_to timestamptz)
returns table (id uuid, professional_id uuid, starts_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select x.id, x.professional_id, x.starts_at
  from public.slots x join public.shops s on s.id = x.shop_id
  where s.slug = p_slug and x.published and x.starts_at >= greatest(p_from, now()) and x.starts_at < p_to
    and not exists (select 1 from public.appointments a where a.professional_id = x.professional_id
                    and a.status in ('pending', 'done') and a.starts_at <= x.starts_at and a.ends_at > x.starts_at)
    and not exists (select 1 from public.blocks b where b.professional_id = x.professional_id
                    and b.starts_at <= x.starts_at and b.ends_at > x.starts_at)
  order by x.starts_at;
$$;

-- Marcação pelo site numa vaga publicada. Telemóvel PT: 9 dígitos, guardado como 351XXXXXXXXX.
create or replace function public.book_slot(p_slot_id uuid, p_service_id uuid, p_client_name text, p_client_phone text)
returns table (id uuid, cancel_token uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_slot public.slots;
  v_shop public.shops;
  v_service public.services;
  v_phone text := regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g');
begin
  select * into v_slot from public.slots x where x.id = p_slot_id and x.published;
  if not found then raise exception 'Essa vaga já não está disponível. Escolha outra.'; end if;
  select * into v_shop from public.shops s where s.id = v_slot.shop_id;
  if v_slot.starts_at < now() then raise exception 'Esse horário já passou.'; end if;

  select * into v_service from public.services s where s.id = p_service_id and s.shop_id = v_shop.id and s.active;
  if not found then raise exception 'Escolha o serviço.'; end if;
  if length(trim(coalesce(p_client_name, ''))) < 2 then raise exception 'Indique o seu nome.'; end if;
  if v_shop.country = 'PT' then
    if length(v_phone) = 9 then v_phone := '351' || v_phone; end if;
    if v_phone !~ '^351[29][0-9]{8}$' then raise exception 'Indique um número de telemóvel válido.'; end if;
  elsif length(v_phone) < 10 or length(v_phone) > 13 then
    raise exception 'Informe um WhatsApp válido.';
  end if;

  if exists (select 1 from public.blocks b where b.professional_id = v_slot.professional_id
             and b.starts_at < v_slot.starts_at + make_interval(mins => v_service.duration_min) and b.ends_at > v_slot.starts_at) then
    raise exception 'Essa vaga já não está disponível. Escolha outra.';
  end if;

  begin
    return query
    insert into public.appointments as a
      (shop_id, professional_id, service_id, service_name, price_cents, client_name, client_phone,
       starts_at, ends_at, source, reminder_consent)
    values
      (v_shop.id, v_slot.professional_id, v_service.id, v_service.name, v_service.price_cents, trim(p_client_name), v_phone,
       v_slot.starts_at, v_slot.starts_at + make_interval(mins => v_service.duration_min), 'site', true)
    returning a.id, a.cancel_token;
  exception when exclusion_violation then
    raise exception 'Essa vaga acabou de ser ocupada. Escolha outra.';
  end;
end;
$$;

-- 7. Danieela_nails passa para vagas publicadas, com logo, vídeos e fotos dos trabalhos -----------
-- Os vídeos levam o trecho a mostrar (#t=início,fim), como no design.
update public.shops set
  booking_mode = 'slots',
  tiktok = coalesce(tiktok, 'danieela_nails'),
  logo_url = coalesce(logo_url, '/media/danieela-logo.png'),
  hero_videos = case when hero_videos = '{}' then array[
    '/media/danieela-v6.mp4#t=3.8,8.8', '/media/danieela-v1.mp4#t=4.4,7.5',
    '/media/danieela-v7.mp4#t=6,11', '/media/danieela-v4.mp4#t=3,7.4'] else hero_videos end,
  gallery = case when gallery = '[]'::jsonb or not exists (select 1 from jsonb_array_elements(gallery) g where g->>'url' <> '') then '[
    {"url": "/media/danieela-01-stiletto.webp", "label": "stiletto"},
    {"url": "/media/danieela-02-nail-art-azul-metalizado.webp", "label": "nail art azul metalizado"},
    {"url": "/media/danieela-03-francesinha-quadrada.webp", "label": "francesinha quadrada"},
    {"url": "/media/danieela-04-francesinha-amarela.webp", "label": "francesinha amarela"},
    {"url": "/media/danieela-05-francesinha-nail-art.webp", "label": "francesinha com nail art"},
    {"url": "/media/danieela-06-francesinha-maos-e-pes.webp", "label": "francesinha mãos e pés"},
    {"url": "/media/danieela-07-nail-art-azul.webp", "label": "nail art azul"},
    {"url": "/media/danieela-08-rosa-flores.webp", "label": "rosa com flores"},
    {"url": "/media/danieela-09-nail-art-vermelho.webp", "label": "nail art vermelho"},
    {"url": "/media/danieela-10-francesinha-flor-amarela.webp", "label": "francesinha com flor amarela"},
    {"url": "/media/danieela-11-flor-vermelha.webp", "label": "flor vermelha"},
    {"url": "/media/danieela-12-flor-3d-branca.webp", "label": "flor 3D branca"}]'::jsonb else gallery end
where slug = 'danieela-nails';
