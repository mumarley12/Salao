// Service worker do painel (notificações push). Servido em /sw.js para valer no site inteiro.
// O envio fica na Edge Function "notify" do Supabase; aqui só mostra o aviso e abre a aba certa ao tocar.
const SW = `
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(d.title || 'Painel do salão', {
    body: d.body || '', icon: d.icon, badge: d.icon, tag: d.tag, data: { url: d.url || '/' },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.split('?')[0] === url.split('?')[0] && 'focus' in c) return c.navigate(url).then((w) => (w || c).focus())
    }
    return self.clients.openWindow(url)
  }))
})
`

export function GET() {
  return new Response(SW, {
    headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-cache', 'service-worker-allowed': '/' },
  })
}
