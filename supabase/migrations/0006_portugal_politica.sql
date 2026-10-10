-- Salões em Portugal + política de agendamento e aviso (promoção) por salão.
--
-- country: 'BR' (padrão, R$ e WhatsApp +55) ou 'PT' (€ e telemóvel +351).
-- payment_text: substitui o texto padrão "paga no salão, depois do atendimento".
-- policy: [{"title": "Atrasos", "items": ["...", "..."]}, ...] mostrado no site e antes de confirmar.
-- announcement: {"title": "...", "text": "...", "until": "2026-10-16"} faixa no topo até a data.
alter table public.shops
  add column country text not null default 'BR' check (country in ('BR', 'PT')),
  add column payment_text text,
  add column policy jsonb not null default '[]'::jsonb,
  add column announcement jsonb;

grant select (country, payment_text, policy, announcement) on public.shops to anon, authenticated;

-- Telefone da cliente: BR continua igual (10 a 13 dígitos).
-- PT: 9 dígitos (ou 351 + 9) e fica salvo como 351XXXXXXXXX, pronto para o link do WhatsApp.
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
  if v_shop.country = 'PT' then
    if length(v_phone) = 9 then v_phone := '351' || v_phone; end if;
    if v_phone !~ '^351[29][0-9]{8}$' then raise exception 'Indique um número de telemóvel válido.'; end if;
  elsif length(v_phone) < 10 or length(v_phone) > 13 then
    raise exception 'Informe um WhatsApp válido.';
  end if;
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

-- A página do agendamento precisa do país (moeda) e do texto de pagamento.
-- Função nova (get_booking_v2) em vez de trocar o retorno de get_booking: assim nada é apagado
-- e a get_booking antiga continua funcionando para quem ainda a chama.
create or replace function public.get_booking_v2(p_token uuid)
returns table (
  shop_slug text, shop_name text, shop_address text, shop_whatsapp text, timezone text, cancel_hours int,
  professional_name text, service_name text, price_cents int, client_name text,
  starts_at timestamptz, status text, country text, payment_text text
)
language sql stable security definer set search_path = ''
as $$
  select s.slug, s.name, s.address, s.whatsapp, s.timezone, s.cancel_hours,
         b.name, a.service_name, a.price_cents, a.client_name, a.starts_at, a.status, s.country, s.payment_text
  from public.appointments a
  join public.shops s on s.id = a.shop_id
  join public.professionals b on b.id = a.professional_id
  where a.cancel_token = p_token;
$$;

-- Salão Danieela_nails (Rio de Mouro, Sintra). Dados tirados do Instagram @danieela_nails em 10/10/2026.
-- Preços, durações, horário e telefone não estão no perfil: os serviços entram com preço 0 ("a confirmar")
-- e a profissional sem horários, então a agenda fica fechada até isso ser preenchido no painel.
do $$
declare v_shop uuid;
begin
  if exists (select 1 from public.shops where slug = 'danieela-nails') then return; end if;

  insert into public.shops (slug, name, address, city, instagram, timezone, country, cancel_hours, late_tolerance_min,
                            payment_text, policy, announcement, gallery)
  values (
    'danieela-nails', 'Danieela_nails', 'Rio de Mouro · atendimento em casa', 'Sintra, Portugal', 'danieela_nails',
    'Europe/Lisbon', 'PT', 48, 10,
    'A marcação é garantida com um sinal. Em caso de falta ou cancelamento o sinal não é devolvido; com aviso de pelo menos 48 horas fica como crédito para uma nova marcação.',
    '[
      {"title": "Cancelamentos e reagendamentos", "items": [
        "Em caso de cancelamento ou falta, o valor do sinal não é devolvido.",
        "Avisando com pelo menos 48 horas de antecedência, o valor pago fica como crédito para uma nova marcação."]},
      {"title": "Atrasos", "items": [
        "Tolerância de 10 minutos.",
        "Depois de 10 minutos é cobrada uma taxa de 5 €; depois de 15 minutos a taxa passa a 10 € ou, conforme a disponibilidade, o atendimento pode não ser feito."]},
      {"title": "Acompanhantes", "items": ["Não são permitidos acompanhantes durante o atendimento."]},
      {"title": "Mensagem de confirmação", "items": [
        "No dia anterior à marcação é enviada uma mensagem de confirmação. Se não for respondida até às 22h, a marcação fica sem efeito e o sinal não é devolvido."]}
    ]'::jsonb,
    '{"title": "Promoção de outubro", "text": "Ao fazer mãos + pés, 20% de desconto na decoração (mãos e pés). Ou traga uma amiga e as duas têm 15% de desconto em qualquer serviço. Válido até 16 de outubro, só para quem ainda não tem marcação.", "until": "2026-10-16"}'::jsonb,
    '[{"url":"","label":"francesinha colorida"},{"url":"","label":"stiletto"},{"url":"","label":"flores 3D"},{"url":"","label":"nail art"},{"url":"","label":"strass e charms"},{"url":"","label":"pés"}]'::jsonb
  )
  returning id into v_shop;

  insert into public.professionals (shop_id, name, sort) values (v_shop, 'Danieela', 1);

  insert into public.services (shop_id, name, price_cents, duration_min, sort) values
    (v_shop, 'Mãos', 0, 60, 1), (v_shop, 'Pés', 0, 60, 2), (v_shop, 'Mãos + pés', 0, 60, 3);
end;
$$;
