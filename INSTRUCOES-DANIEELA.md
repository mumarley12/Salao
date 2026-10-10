# Aplicar o salão Danieela_nails

Este zip é o repositório `mumarley12/salao` no branch `danieela-nails` (sem `node_modules`).

Passos, nesta ordem:

1. **Banco primeiro.** No projeto Supabase `salao` (`mpdovyglnhcrzlgorgga`), aplique
   `supabase/migrations/0006_portugal_politica.sql`. Ela só acrescenta colunas em `shops`
   (country, payment_text, policy, announcement), troca `book_appointment` (telemóvel PT) e
   `get_booking` (devolve país e texto de pagamento), e cria o salão `danieela-nails`.
   É idempotente na parte dos dados: se o salão já existir, não insere de novo.
2. **Depois o código.** Leve o branch `danieela-nails` para o `main`
   (`git merge danieela-nails` ou PR) e faça o deploy.
   Não publique o código antes do passo 1: a página `/[slug]` passa a ler as colunas novas.
3. **Conferir.** Abra `/danieela-nails` e `/espacolumi` (a demonstração tem de continuar igual).
4. **Painel da Danieela.** O link é `/painel/<panel_token>`:
   `select panel_token from public.shops where slug = 'danieela-nails';`

## O que ainda falta (não está no Instagram)

- Preços e durações: os serviços Mãos, Pés e Mãos + pés estão com preço 0, que o site mostra como
  "Preço a confirmar". Ajustar no painel → Serviços.
- Horário de atendimento: a profissional Danieela está sem horários, por isso a agenda online fica
  fechada e os botões levam à mensagem no Instagram. Ao preencher os horários no painel, a agenda abre.
- WhatsApp/telefone, logótipo, foto e fotos dos trabalhos: preencher no painel ou em `assets/media/`.
