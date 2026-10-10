-- Agenda a Edge Function "notify" de 15 em 15 minutos. Aplicar só depois de:
--   1. publicar a função (supabase functions deploy notify --no-verify-jwt);
--   2. definir os segredos VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT e NOTIFY_SECRET;
--   3. guardar o mesmo NOTIFY_SECRET no Vault:  select vault.create_secret('<segredo>', 'notify_secret');
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
