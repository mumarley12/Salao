-- Salão de demonstração "Espaço Lumi": dados fictícios. O link do painel é público
-- (token fixo) e tudo volta ao original de hora em hora, com uma agenda de hoje sempre movimentada.
-- O que os visitantes mexeram vai para um salão-arquivo escondido (só UPDATE, nada é apagado).
create or replace function public.demo_reset()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_shop uuid;
  v_archive uuid;
  v_tz text := 'America/Sao_Paulo';
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_hour int := extract(hour from now() at time zone 'America/Sao_Paulo');
  v_pro record;
  v_h public.professional_hours;
  v_svc uuid[];
  v_names text[] := array['Fernanda Lopes', 'Aline Souza', 'Patrícia Reis', 'Mariana Costa', 'Letícia Gomes', 'Renata Dias',
                          'Carolina Melo', 'Débora Pires', 'Vanessa Rocha', 'Tatiane Nunes', 'Gabriela Teixeira', 'Priscila Moura'];
  v_n int := 0;
  v_off int;
  v_day date;
  v_start timestamptz;
  v_sid uuid;
  v_status text;
begin
  select id into v_shop from public.shops where slug = 'espacolumi';
  if v_shop is null then
    insert into public.shops (slug, name, panel_token) values ('espacolumi', 'Espaço Lumi', '1a3e0000-0000-4000-8000-00000000d3e0')
    returning id into v_shop;
  end if;

  select id into v_archive from public.shops where slug = 'arquivo-demo-espacolumi';
  if v_archive is null then
    insert into public.shops (slug, name) values ('arquivo-demo-espacolumi', 'Arquivo da demonstração')
    returning id into v_archive;
  end if;

  update public.shops set
    name = 'Espaço Lumi', address = 'Rua das Acácias, 215 · Jardins', city = 'São Paulo / SP',
    phone = '(11) 90000-0000', whatsapp = '5511900000000', instagram = null,
    hours_text = array['Seg a Sex, 9h às 20h', 'Sáb, 9h às 19h', 'Dom, 9h às 14h'],
    timezone = v_tz, logo_url = '/media/logo.jpg', hero_videos = array['/media/hero.jpg'],
    cancel_hours = 2, late_tolerance_min = 10,
    panel_token = '1a3e0000-0000-4000-8000-00000000d3e0',
    gallery = '[{"url":"/media/galeria-gel.jpg","label":"esmaltação em gel"},{"url":"/media/galeria-nailart.jpg","label":"nail art"},{"url":"/media/galeria-pe-e-mao.jpg","label":"pé e mão"},{"url":"/media/galeria-escova.jpg","label":"escova"},{"url":"/media/galeria-sobrancelha.jpg","label":"sobrancelha"},{"url":"/media/galeria-maquiagem.jpg","label":"maquiagem"}]'::jsonb
  where id = v_shop;

  update public.appointments set shop_id = v_archive where shop_id = v_shop;
  update public.blocks set shop_id = v_archive where shop_id = v_shop;
  update public.professionals set shop_id = v_archive, active = false where shop_id = v_shop;
  update public.services set shop_id = v_archive, active = false where shop_id = v_shop;

  insert into public.services (shop_id, name, price_cents, duration_min, sort) values
    (v_shop, 'Manicure', 3500, 45, 1), (v_shop, 'Pedicure', 4000, 50, 2), (v_shop, 'Mão e pé', 7000, 90, 3),
    (v_shop, 'Esmaltação em gel', 9000, 90, 4), (v_shop, 'Escova', 6000, 50, 5), (v_shop, 'Design de sobrancelha', 4000, 30, 6);

  with p as (
    insert into public.professionals (shop_id, name, photo_url, sort) values
      (v_shop, 'Camila Rocha', '/media/profissional-camila.jpg', 1),
      (v_shop, 'Juliana Alves', '/media/profissional-juliana.jpg', 2),
      (v_shop, 'Bia Lima', '/media/profissional-bia.jpg', 3)
    returning id, sort
  )
  insert into public.professional_hours (professional_id, weekday, start_time, end_time)
  select p.id, h.wd, h.st, h.en from p join (values
    (1, 2, '09:00'::time, '19:00'::time), (1, 3, '09:00', '19:00'), (1, 4, '09:00', '19:00'), (1, 5, '09:00', '19:00'), (1, 6, '09:00', '19:00'),
    (2, 1, '10:00', '20:00'), (2, 2, '10:00', '20:00'), (2, 3, '10:00', '20:00'), (2, 4, '10:00', '20:00'), (2, 5, '10:00', '20:00'),
    (3, 0, '09:00', '14:00'), (3, 3, '09:00', '18:00'), (3, 4, '09:00', '18:00'), (3, 5, '09:00', '18:00'), (3, 6, '09:00', '18:00')
  ) as h(sort, wd, st, en) on h.sort = p.sort;

  -- serviços de até 50 min, para caber um por hora sem sobrepor
  select array_agg(id order by sort) into v_svc from public.services where shop_id = v_shop and duration_min <= 50;

  -- Hoje: horas passadas concluídas (uma falta), próximas agendadas. Próximos 3 dias: alguns horários marcados.
  for v_pro in select b.id, b.sort from public.professionals b where b.shop_id = v_shop order by b.sort loop
    for v_day in select v_today + d from generate_series(0, 3) d loop
      select * into v_h from public.professional_hours h
      where h.professional_id = v_pro.id and h.weekday = extract(dow from v_day);
      continue when not found;
      for v_off in select generate_series(extract(hour from v_h.start_time)::int, extract(hour from v_h.end_time)::int - 1) loop
        -- dias futuros: só alguns horários; hoje: 2 horas antes e 2 depois de agora
        if v_day = v_today then
          continue when v_off < v_hour - 3 or v_off > v_hour + 2 or v_off = v_hour;
        else
          continue when (v_off + v_pro.sort + extract(day from v_day)::int) % 3 <> 0;
        end if;
        v_n := v_n + 1;
        v_start := (v_day + make_time(v_off, case when v_pro.sort = 2 then 30 else 0 end, 0)) at time zone v_tz;
        v_sid := v_svc[1 + (v_n % array_length(v_svc, 1))];
        v_status := case when v_start > now() then 'pending'
                         when v_pro.sort = 1 and v_off = v_hour - 1 then 'noshow'
                         else 'done' end;
        insert into public.appointments
          (shop_id, professional_id, service_id, service_name, price_cents, client_name, client_phone,
           starts_at, ends_at, status, source, reminder_consent)
        select v_shop, v_pro.id, s.id, s.name, s.price_cents, v_names[1 + (v_n % 12)], '11900000000',
               v_start, v_start + make_interval(mins => s.duration_min), v_status,
               case when v_n % 4 = 0 then 'counter' else 'site' end, true
        from public.services s where s.id = v_sid;
      end loop;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.demo_reset() from anon, authenticated, public;

select public.demo_reset();

create extension if not exists pg_cron;
select cron.schedule('demo-reset-espacolumi', '0 * * * *', 'select public.demo_reset()');
