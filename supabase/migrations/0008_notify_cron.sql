-- Agenda a Edge Function "notify" de 15 em 15 minutos. Aplicar só depois de:
--   1. publicar a função (supabase functions deploy notify --no-verify-jwt);
--   2. guardar as chaves no Vault (ver 0009_notify_config_vault.sql);
--   3. o notify_secret do Vault é o mesmo que a função confere;
-- No Vercel, NEXT_PUBLIC_VAPID_PUBLIC_KEY = a mesma chave pública.
create extension if not exists pg_net;

select cron.schedule('notify-push', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://mpdovyglnhcrzlgorgga.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')),
    body := '{}'::jsonb
  );
$$);
