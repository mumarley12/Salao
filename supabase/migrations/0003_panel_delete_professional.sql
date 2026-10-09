-- Apaga uma profissional que não tem agendamento ativo (usado para limpar cadastros de teste).
create or replace function public.panel_delete_professional(p_token uuid, p_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.professionals b
  where b.id = p_id and b.shop_id = public.panel_shop_id(p_token)
    and not exists (select 1 from public.appointments a where a.professional_id = b.id and a.status <> 'cancelled');
$$;
