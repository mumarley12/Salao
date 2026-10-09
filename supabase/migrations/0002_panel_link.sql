-- Painel acessado por link secreto (sem senha, por enquanto).
-- Cada salão tem um panel_token; o painel chama só estas funções,
-- e todas validam o token antes de ler ou mudar qualquer coisa.

-- O cadastro de salão pelo próprio usuário fica desligado: quem cria os salões é você.
revoke execute on function public.create_shop(text, text) from authenticated, anon, public;

alter table public.shops add column panel_token uuid not null default gen_random_uuid() unique;

-- panel_token não pode vazar pela leitura pública da tabela shops.
revoke select on public.shops from anon, authenticated;
grant select (id, slug, name, address, city, phone, whatsapp, instagram, hours_text, timezone,
              logo_url, hero_videos, cancel_hours, late_tolerance_min, created_at)
  on public.shops to anon, authenticated;

create or replace function public.panel_shop_id(p_token uuid)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare v_id uuid;
begin
  select s.id into v_id from public.shops s where s.panel_token = p_token;
  if v_id is null then raise exception 'Link do painel inválido.'; end if;
  return v_id;
end;
$$;

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
      select jsonb_agg(to_jsonb(a) - 'cancel_token' order by a.starts_at)
      from public.appointments a
      where a.shop_id = v_shop and a.status <> 'cancelled' and a.starts_at >= p_from and a.starts_at < p_to), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.starts_at)
      from public.blocks b where b.shop_id = v_shop and b.ends_at > now()), '[]'::jsonb)
  );
end;
$$;

create or replace function public.panel_set_status(p_token uuid, p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_status not in ('pending', 'done', 'noshow', 'cancelled') then raise exception 'Status inválido.'; end if;
  update public.appointments set status = p_status
  where id = p_id and shop_id = public.panel_shop_id(p_token);
exception when exclusion_violation then
  raise exception 'Esse horário já foi ocupado por outra cliente.';
end;
$$;

-- Registra atendimento do balcão. p_starts_at nulo = cliente atendido agora (walkin, já concluído).
create or replace function public.panel_add_appointment(
  p_token uuid, p_professional_id uuid, p_service_id uuid, p_starts_at timestamptz,
  p_client_name text, p_client_phone text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_shop uuid := public.panel_shop_id(p_token);
  v_service public.services;
  v_id uuid;
  v_walkin boolean := p_starts_at is null;
  v_start timestamptz := coalesce(p_starts_at, now());
begin
  if not exists (select 1 from public.professionals b where b.id = p_professional_id and b.shop_id = v_shop) then
    raise exception 'Profissional inválida.';
  end if;
  select * into v_service from public.services s where s.id = p_service_id and s.shop_id = v_shop;
  if not found then raise exception 'Serviço inválido.'; end if;
  if length(trim(coalesce(p_client_name, ''))) < 2 then raise exception 'Coloca o nome da cliente.'; end if;

  insert into public.appointments
    (shop_id, professional_id, service_id, service_name, price_cents, client_name, client_phone,
     starts_at, ends_at, status, source)
  values
    (v_shop, p_professional_id, v_service.id, v_service.name, v_service.price_cents, trim(p_client_name),
     nullif(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g'), ''),
     v_start, v_start + make_interval(mins => v_service.duration_min),
     case when v_walkin then 'done' else 'pending' end,
     case when v_walkin then 'walkin' else 'counter' end)
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception 'A profissional já tem cliente nesse horário.';
end;
$$;

create or replace function public.panel_add_block(
  p_token uuid, p_professional_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_all_day boolean, p_reason text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_shop uuid := public.panel_shop_id(p_token);
begin
  if not exists (select 1 from public.professionals b where b.id = p_professional_id and b.shop_id = v_shop) then
    raise exception 'Profissional inválida.';
  end if;
  if p_ends_at <= p_starts_at then raise exception 'O fim precisa ser depois do início.'; end if;
  insert into public.blocks (shop_id, professional_id, starts_at, ends_at, all_day, reason)
  values (v_shop, p_professional_id, p_starts_at, p_ends_at, coalesce(p_all_day, false), nullif(trim(coalesce(p_reason, '')), ''));
end;
$$;

create or replace function public.panel_delete_block(p_token uuid, p_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.blocks where id = p_id and shop_id = public.panel_shop_id(p_token);
$$;

create or replace function public.panel_save_service(
  p_token uuid, p_id uuid, p_name text, p_price_cents int, p_duration_min int, p_active boolean
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_shop uuid := public.panel_shop_id(p_token); v_id uuid;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Dá um nome pro serviço.'; end if;
  if p_id is null then
    insert into public.services (shop_id, name, price_cents, duration_min, active, sort)
    values (v_shop, trim(p_name), greatest(coalesce(p_price_cents, 0), 0), coalesce(p_duration_min, 30), coalesce(p_active, true),
            coalesce((select max(sort) + 1 from public.services where shop_id = v_shop), 1))
    returning id into v_id;
  else
    update public.services set name = trim(p_name), price_cents = greatest(coalesce(p_price_cents, 0), 0),
      duration_min = coalesce(p_duration_min, 30), active = coalesce(p_active, true)
    where id = p_id and shop_id = v_shop returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.panel_delete_service(p_token uuid, p_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.services where id = p_id and shop_id = public.panel_shop_id(p_token);
$$;

-- p_hours: [{"weekday":2,"start_time":"09:00","end_time":"19:00"}, ...]
create or replace function public.panel_save_professional(
  p_token uuid, p_id uuid, p_name text, p_specialty text, p_active boolean, p_hours jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_shop uuid := public.panel_shop_id(p_token); v_id uuid;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Dá um nome pra profissional.'; end if;
  if p_id is null then
    insert into public.professionals (shop_id, name, specialty, active, sort)
    values (v_shop, trim(p_name), nullif(trim(coalesce(p_specialty, '')), ''), coalesce(p_active, true),
            coalesce((select max(sort) + 1 from public.professionals where shop_id = v_shop), 1))
    returning id into v_id;
  else
    update public.professionals set name = trim(p_name), specialty = nullif(trim(coalesce(p_specialty, '')), ''),
      active = coalesce(p_active, true)
    where id = p_id and shop_id = v_shop returning id into v_id;
    if v_id is null then raise exception 'Profissional inválida.'; end if;
  end if;
  if p_hours is not null then
    delete from public.professional_hours where professional_id = v_id;
    insert into public.professional_hours (professional_id, weekday, start_time, end_time)
    select v_id, (h->>'weekday')::smallint, (h->>'start_time')::time, (h->>'end_time')::time
    from jsonb_array_elements(p_hours) h;
  end if;
  return v_id;
end;
$$;

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
    hours_text = coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'hours_text') x), hours_text)
  where id = public.panel_shop_id(p_token);
end;
$$;

-- O painel recebe o cancel_token para mandar o link de cancelamento no lembrete do WhatsApp.
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
      from public.blocks b where b.shop_id = v_shop and b.ends_at > now()), '[]'::jsonb)
  );
end;
$$;
