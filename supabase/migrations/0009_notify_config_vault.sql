-- Configuração das notificações push guardada no Vault (sem segredos na Edge Function).
-- Antes de aplicar, criar no Vault: vapid_public_key, vapid_private_key, vapid_subject e notify_secret
--   select vault.create_secret('<valor>', '<nome>');
-- No Vercel, NEXT_PUBLIC_VAPID_PUBLIC_KEY = o mesmo valor de vapid_public_key.
create or replace function public.notify_config()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets
  where name in ('vapid_public_key', 'vapid_private_key', 'vapid_subject', 'notify_secret')
$$;
revoke all on function public.notify_config() from public, anon, authenticated;
grant execute on function public.notify_config() to service_role;
