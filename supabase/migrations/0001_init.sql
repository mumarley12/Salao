-- Agenda Salão: esquema multi-salão
create extension if not exists btree_gist with schema extensions;

-- Salões -------------------------------------------------------------
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null,
  address text,
  city text,
  phone text,
  whatsapp text,              -- só dígitos com DDI, ex.: 5511987654321
  instagram text,             -- sem @
  hours_text text[] not null default '{}',
  timezone text not null default 'America/Sao_Paulo',
  logo_url text,
  hero_videos text[] not null default '{}',
  cancel_hours int not null default 2,
  late_tolerance_min int not null default 10,
  created_at timestamptz not null default now()
);

create table public.shop_members (
  shop_id uuid not null references public.shops on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  primary key (shop_id, user_id)
);
create index on public.shop_members (user_id);

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  name text not null,
  specialty text,
  photo_url text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.professionals (shop_id);

-- Um registro por dia da semana trabalhado (0 = domingo)
create table public.professional_hours (
  professional_id uuid not null references public.professionals on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  primary key (professional_id, weekday)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  name text not null,
  price_cents int not null default 0 check (price_cents >= 0),
  duration_min int not null default 30 check (duration_min between 5 and 480),
  active boolean not null default true,
  sort int not null default 0
);
create index on public.services (shop_id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  professional_id uuid not null references public.professionals on delete cascade,
  service_id uuid references public.services on delete set null,
  service_name text not null,
  price_cents int not null default 0,
  client_name text not null,
  client_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'pending' check (status in ('pending', 'done', 'noshow', 'cancelled')),
  source text not null default 'site' check (source in ('site', 'counter', 'walkin')),
  reminder_consent boolean not null default false,
  cancel_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  -- Dois horários ativos da mesma profissional não podem se sobrepor.
  -- Quem chega sem horário (walkin) fica de fora: ele é encaixado na hora.
  constraint appointments_no_overlap exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending', 'done') and source <> 'walkin')
);
create index on public.appointments (shop_id, starts_at);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  professional_id uuid not null references public.professionals on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  all_day boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);
create index on public.blocks (shop_id, starts_at);

-- Permissões -------------------------------------------------------------
create or replace function public.is_member(p_shop uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop and m.user_id = (select auth.uid())
  );
$$;

alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.professionals enable row level security;
alter table public.professional_hours enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.blocks enable row level security;

-- O site público lê o salão, profissionais ativas, horários e serviços ativos.
create policy "shops public read" on public.shops for select using (true);
create policy "shops member update" on public.shops for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

create policy "members read own" on public.shop_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy "professionals public read" on public.professionals for select
  using (active or public.is_member(shop_id));
create policy "professionals member write" on public.professionals for all to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));

create policy "hours public read" on public.professional_hours for select using (true);
create policy "hours member write" on public.professional_hours for all to authenticated
  using (public.is_member((select b.shop_id from public.professionals b where b.id = professional_id)))
  with check (public.is_member((select b.shop_id from public.professionals b where b.id = professional_id)));

create policy "services public read" on public.services for select
  using (active or public.is_member(shop_id));
create policy "services member write" on public.services for all to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));

-- Agendamentos e bloqueios: só a equipe vê. O público usa as funções abaixo.
create policy "appointments member all" on public.appointments for all to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));
create policy "blocks member all" on public.blocks for all to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));

-- Funções públicas -------------------------------------------------------

-- Intervalos ocupados (sem dados de cliente) para montar os horários livres.
create or replace function public.get_busy(p_shop_slug text, p_from timestamptz, p_to timestamptz)
returns table (professional_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.professional_id, a.starts_at, a.ends_at
  from public.appointments a join public.shops s on s.id = a.shop_id
  where s.slug = p_shop_slug and a.status in ('pending', 'done')
    and a.starts_at < p_to and a.ends_at > p_from
  union all
  select b.professional_id, b.starts_at, b.ends_at
  from public.blocks b join public.shops s on s.id = b.shop_id
  where s.slug = p_shop_slug and b.starts_at < p_to and b.ends_at > p_from;
$$;

create or replace function public.book_appointment(
  p_shop_slug text, p_professional_id uuid, p_service_id uuid, p_starts_at timestamptz,
  p_client_name text, p_client_phone text, p_consent boolean
)
returns table (id uuid, cancel_token uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_shop public.shops;
  v_service public.services;
  v_local timestamp;
  v_end timestamptz;
  v_hours public.professional_hours;
  v_phone text := regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g');
begin
  select * into v_shop from public.shops where slug = p_shop_slug;
  if not found then raise exception 'Salão não encontrado.'; end if;

  if not exists (select 1 from public.professionals b where b.id = p_professional_id and b.shop_id = v_shop.id and b.active) then
    raise exception 'Profissional indisponível.';
  end if;

  select * into v_service from public.services s where s.id = p_service_id and s.shop_id = v_shop.id and s.active;
  if not found then raise exception 'Serviço indisponível.'; end if;

  if length(trim(coalesce(p_client_name, ''))) < 2 then raise exception 'Informe seu nome.'; end if;
  if length(v_phone) < 10 or length(v_phone) > 13 then raise exception 'Informe um WhatsApp válido.'; end if;
  if not coalesce(p_consent, false) then raise exception 'Aceite receber lembretes pelo WhatsApp.'; end if;

  if p_starts_at < now() then raise exception 'Esse horário já passou.'; end if;
  if p_starts_at > now() + interval '30 days' then raise exception 'Agenda aberta só pros próximos 30 dias.'; end if;

  v_end := p_starts_at + make_interval(mins => v_service.duration_min);
  v_local := p_starts_at at time zone v_shop.timezone;

  select * into v_hours from public.professional_hours h
  where h.professional_id = p_professional_id and h.weekday = extract(dow from v_local);
  if not found
     or v_local::time < v_hours.start_time
     or (v_end at time zone v_shop.timezone)::time > v_hours.end_time
     or (v_end at time zone v_shop.timezone)::date <> v_local::date then
    raise exception 'Fora do horário de atendimento da profissional.';
  end if;

  if exists (select 1 from public.blocks b where b.professional_id = p_professional_id
             and b.starts_at < v_end and b.ends_at > p_starts_at) then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro.';
  end if;

  begin
    return query
    insert into public.appointments as a
      (shop_id, professional_id, service_id, service_name, price_cents, client_name, client_phone,
       starts_at, ends_at, source, reminder_consent)
    values
      (v_shop.id, p_professional_id, v_service.id, v_service.name, v_service.price_cents,
       trim(p_client_name), v_phone, p_starts_at, v_end, 'site', true)
    returning a.id, a.cancel_token;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro.';
  end;
end;
$$;

create or replace function public.get_booking(p_token uuid)
returns table (
  shop_slug text, shop_name text, shop_address text, shop_whatsapp text, timezone text, cancel_hours int,
  professional_name text, service_name text, price_cents int, client_name text,
  starts_at timestamptz, status text
)
language sql stable security definer set search_path = ''
as $$
  select s.slug, s.name, s.address, s.whatsapp, s.timezone, s.cancel_hours,
         b.name, a.service_name, a.price_cents, a.client_name, a.starts_at, a.status
  from public.appointments a
  join public.shops s on s.id = a.shop_id
  join public.professionals b on b.id = a.professional_id
  where a.cancel_token = p_token;
$$;

create or replace function public.cancel_booking(p_token uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_appt public.appointments;
  v_hours int;
begin
  select a.* into v_appt from public.appointments a where a.cancel_token = p_token;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  if v_appt.status <> 'pending' then raise exception 'Esse agendamento não pode mais ser cancelado.'; end if;
  select s.cancel_hours into v_hours from public.shops s where s.id = v_appt.shop_id;
  if v_appt.starts_at - now() < make_interval(hours => v_hours) then
    raise exception 'Cancelamento só até % horas antes. Fale com o salão pelo WhatsApp.', v_hours;
  end if;
  update public.appointments set status = 'cancelled' where id = v_appt.id;
end;
$$;

-- Cria um salão para o usuário logado (onboarding pelo painel).
create or replace function public.create_shop(p_name text, p_slug text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Faça login.'; end if;
  insert into public.shops (name, slug) values (trim(p_name), lower(trim(p_slug))) returning id into v_id;
  insert into public.shop_members (shop_id, user_id) values (v_id, (select auth.uid()));
  insert into public.services (shop_id, name, price_cents, duration_min, sort) values
    (v_id, 'Manicure', 3500, 45, 1), (v_id, 'Pedicure', 4000, 50, 2), (v_id, 'Escova', 6000, 50, 3);
  return v_id;
exception when unique_violation then
  raise exception 'Esse endereço já está em uso. Escolha outro.';
end;
$$;

revoke execute on function public.create_shop(text, text) from anon, public;
grant execute on function public.create_shop(text, text) to authenticated;
