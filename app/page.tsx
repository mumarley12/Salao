import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Agenda por Profissional · Site de agendamento para salões de beleza',
  description: 'Um site com o nome do seu salão, onde a cliente escolhe a profissional, vê o horário livre e agenda sozinha. Pagamento único, sem mensalidade.',
  openGraph: {
    title: 'Agenda por Profissional',
    description: 'Site de agendamento + painel para salões de beleza. A cliente agenda sozinha, 24 horas por dia.',
    type: 'website',
    locale: 'pt_BR',
    url: '/',
    images: [{ url: '/media/og-agenda-por-profissional.jpg', width: 1200, height: 630, alt: 'Agenda por Profissional' }],
  },
}

// Seu WhatsApp de vendas (só dígitos, com 55). Defina NEXT_PUBLIC_SALES_WHATSAPP na Vercel.
const SALES_WA = process.env.NEXT_PUBLIC_SALES_WHATSAPP || '5511900000000'
const wa = `https://wa.me/${SALES_WA}?text=${encodeURIComponent('Quero meu site')}`
const DEMO = '/espacolumi'

const includes = [
  'Site com o nome, as fotos e as cores do seu salão',
  'Página de serviços com preço e duração',
  'Agenda individual pra cada profissional, com os horários dela',
  'Agendamento online 24h',
  'Lembrete no WhatsApp da cliente, com um toque no painel',
  'Painel do salão pra acompanhar os agendamentos e marcar cada um como concluído',
  'Pagamento presencial: o site não cobra a cliente nem desconta taxa por agendamento',
  'Botão pra colocar na bio do Instagram',
  'Domínio .com.br e hospedagem no primeiro ano',
  'Treinamento em vídeo pra usar o painel',
]

const faqs = [
  ['Quanto tempo leva pra ficar pronto?', '7 dias úteis depois que você manda as informações.'],
  ['Tem mensalidade?', 'Não. Pagamento único. Domínio e hospedagem do primeiro ano estão inclusos; a partir do segundo ano, R$ 120 por ano.'],
  ['A cliente paga pelo site?', 'Não. O pagamento é presencial, no salão, do jeito que você já recebe hoje.'],
  ['Como controlo os atendimentos?', 'Pelo painel: depois que a cliente paga, você marca o atendimento como concluído.'],
  ['Serve pra salão pequeno ou pra quem atende sozinha?', 'Sim, funciona com 1 profissional ou com várias.'],
  ['Como a cliente recebe o lembrete?', 'Pelo WhatsApp: no painel, cada horário tem um botão que abre a mensagem pronta com o link pra ela cancelar ou remarcar.'],
  ['Posso mudar preços e horários depois?', 'Sim, pelo seu próprio painel. Muda na hora no site.'],
  ['E se eu não gostar do layout?', 'Você aprova antes de ir pro ar, com 2 rodadas de ajuste.'],
  ['Quais as formas de pagamento do site?', 'Pix à vista ou cartão em até 10x.'],
]

const pains = [
  'Para a unha no meio pra responder mensagem, ou deixa a cliente no vácuo',
  'Duas clientes marcadas no mesmo horário porque a anotação se perdeu',
  'Cliente que marcou, não apareceu e nem avisou',
  'Profissional com buraco na agenda enquanto outra está lotada',
  'Cliente que perguntou o preço, não teve resposta e foi pro concorrente',
  'Fim do dia revisando conversa pra saber quem vem amanhã',
]

const changes = [
  'Você atende sem parar pra responder mensagem',
  'A agenda enche à noite e no fim de semana, enquanto você descansa',
  'A cliente lembra do horário, porque o lembrete chega no WhatsApp',
  'Cada profissional tem seus horários e não tem marcação em cima de marcação',
  'O pagamento continua na sua mão, no balcão, sem app ficando com parte do seu serviço',
  'Você abre o painel e sabe na hora quem já foi atendido e quem ainda vem',
  'Seu link na bio do Instagram vira um botão de agendar',
  'O site é seu, com seu nome, e não um perfil perdido dentro de um app',
  'Você paga uma vez e não tem boleto todo mês',
]

const objections = [
  ['"Mas minha cliente prefere WhatsApp, é mais fácil."', 'Faz sentido, e o WhatsApp continua. A cliente ainda fala com você por lá e recebe o lembrete por lá. A diferença é que o horário ela marca sozinha, num link, sem esperar você responder.'],
  ['"Mas não quero mexer com pagamento online."', 'Nem precisa. O site só agenda. A cliente paga aí, do jeito que você já recebe, e você marca como concluído no painel com um toque.'],
  ['"Mas eu não entendo de site."', 'Não precisa. Você manda as informações e a gente monta tudo.'],
  ['"Mas tenho poucas profissionais (ou trabalho sozinha)."', 'Funciona igual com 1 ou com 10. Sozinha, é aí que você mais precisa parar de responder mensagem no meio do atendimento.'],
  ['"Mas já existem apps de agendamento."', 'Existem. Na maioria você paga todo mês e seu salão fica dentro do app de outra empresa. Aqui o site é seu, com seu nome, e o pagamento é um só.'],
]

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-wrap lp-header-in">
          <span className="lp-logo">Agenda por Profissional</span>
          <a href={wa} target="_blank" rel="noopener" className="lp-btn lp-btn-sm">Quero meu site</a>
        </div>
      </header>

      <section className="lp-wrap lp-hero">
        <div className="lp-hero-text">
          <h1>Pare de usar o WhatsApp como agenda.</h1>
          <p>Um site com o nome do seu salão, onde a cliente escolhe a profissional, vê o horário livre e agenda sozinha. Ela ainda recebe lembrete no WhatsApp. Você paga uma vez, sem mensalidade.</p>
          <div className="lp-ctas">
            <a href={wa} target="_blank" rel="noopener" className="lp-btn lp-btn-lg">Quero meu site</a>
            <a href={DEMO} className="lp-btn-ghost">Veja funcionando →</a>
          </div>
          <div className="lp-trust"><span>Resposta no WhatsApp</span><i>•</i><span>Sem compromisso</span><i>•</i><span>Pagamento único</span></div>
        </div>
        <div className="lp-phone-wrap">
          <div className="lp-phone"><iframe src={DEMO} title="Demo Espaço Lumi" loading="lazy" /></div>
          <span>Demo ao vivo: site do Espaço Lumi</span>
        </div>
      </section>

      <section className="lp-band">
        <div className="lp-wrap lp-two">
          <h2 className="lp-h2 lp-h2-big">Você abriu o salão pra cuidar das suas clientes, não pra responder &quot;tem horário?&quot; o dia inteiro.</h2>
          <div className="lp-story">
            <p>Mas a agenda mora no WhatsApp. No meio da esmaltação o celular vibra, a mensagem fica sem resposta e a cliente marca em outro lugar.</p>
            <p>E tem o outro lado: cliente que marca, esquece e deixa o horário vazio.</p>
            <p className="gold">Dá pra resolver as duas coisas com um site só seu.</p>
          </div>
        </div>
      </section>

      <section className="lp-wrap lp-two lp-pad">
        <h2 className="lp-h2">Se você tem salão, provavelmente já passou por isso:</h2>
        <div className="lp-list">
          {pains.map((t, i) => <div key={i}><span>{String(i + 1).padStart(2, '0')}</span><span>{t}</span></div>)}
        </div>
      </section>

      <section className="lp-wrap lp-pad-b">
        <div className="lp-gold">
          <div>
            <h2 className="lp-h2">Criamos a Agenda por Profissional</h2>
            <p className="strong">Um site com a cara do seu salão, onde cada profissional tem a própria agenda.</p>
            <p>A cliente entra, vê endereço, serviços e preços. Escolhe a profissional, vê só os horários livres dela e agenda. Antes do horário, recebe um lembrete no WhatsApp.</p>
            <p>A cliente paga no salão, como sempre. Depois é só abrir o seu painel e marcar o atendimento como concluído. Em um lugar só, você vê o que está agendado, o que já foi feito e quem não apareceu.</p>
            <p className="serif">Você não precisa responder ninguém pra agenda encher.</p>
            <div className="lp-ctas">
              <a href={DEMO} className="lp-btn-dark">Veja funcionando: site do Espaço Lumi</a>
              <a href="/demo/painel" className="lp-btn-outline-dark">Ver o painel</a>
            </div>
          </div>
          <div className="lp-mock">
            {[['Fernanda Lopes', '11:30 · Mão e pé com Camila', 'Agendado', 'a'], ['Aline Souza', '09:30 · Esmaltação em gel com Camila', 'Concluído', 'b'], ['Patrícia Reis', '10:40 · Design de sobrancelha com Bia', 'Faltou', 'c']].map(([n, d, s, k]) => (
              <div key={n}><div><b>{n}</b><small>{d}</small></div><span className={'lp-chip ' + k}>{s}</span></div>
            ))}
            <p>Assim aparece no seu painel</p>
          </div>
        </div>
      </section>

      <section className="lp-wrap lp-pad-b">
        <h2 className="lp-h2" style={{ marginBottom: 32 }}>O que muda na sua rotina</h2>
        <div className="lp-grid">{changes.map((t) => <div key={t}>{t}</div>)}</div>
      </section>

      <section className="lp-band">
        <div className="lp-wrap lp-two" style={{ alignItems: 'center' }}>
          <div>
            <p className="lp-eyebrow">Demonstração ao vivo</p>
            <h2 className="lp-h2" style={{ marginBottom: 24 }}>Clique e agende como se fosse cliente</h2>
            <a href={DEMO} className="lp-btn">Abrir o site do Espaço Lumi</a>
          </div>
          <figure className="lp-quote">
            <blockquote>O Espaço Lumi é um salão de demonstração: nome, fotos, profissionais, serviços e preços são fictícios. No seu, tudo fica com a cara do seu salão.</blockquote>
            <figcaption>Pode agendar à vontade pra testar</figcaption>
          </figure>
        </div>
      </section>

      <section id="oferta" className="lp-wrap lp-pad">
        <h2 className="lp-h2" style={{ marginBottom: 36 }}>O que você recebe</h2>
        <div className="lp-two">
          <div className="lp-list lp-checks">{includes.map((t) => <div key={t}><span>✓</span><span>{t}</span></div>)}</div>
          <div className="lp-stack">
            <div className="lp-box">
              <h3>Como funciona</h3>
              {[['Conversa no WhatsApp', 'Você manda as informações do salão.'], ['Montagem', 'A gente monta o site em 7 dias úteis.'], ['Aprovação', 'Você testa e pede ajustes.'], ['No ar', 'Link pronto pra divulgar.']].map(([t, d], i) => (
                <div key={t} className="lp-step"><span>{i + 1}</span><div><b>{t}</b><small>{d}</small></div></div>
              ))}
            </div>
            <div className="lp-price">
              <span className="lbl">Investimento</span>
              <span className="val">R$ 1.497</span>
              <b>Pagamento único, sem mensalidade.</b>
              <span>Pix à vista ou em até 10x no cartão</span>
              <a href={wa} target="_blank" rel="noopener" className="lp-btn-dark">Quero meu site</a>
            </div>
          </div>
        </div>
        <p className="lp-cost"><strong>O que custa continuar como está:</strong> cada cliente que fica sem resposta ou falta sem avisar é um horário vazio na agenda. Faz a conta de quantas perdeu no último mês.</p>
      </section>

      <section className="lp-wrap lp-pad-b">
        <h2 className="lp-h2" style={{ marginBottom: 32 }}>&quot;Mas…&quot;</h2>
        <div className="lp-cards">{objections.map(([q, a]) => <div key={q}><h3>{q}</h3><p>{a}</p></div>)}</div>
      </section>

      <section className="lp-band">
        <div className="lp-wrap lp-pad-in">
          <h2 className="lp-h2" style={{ marginBottom: 32 }}>Garantia</h2>
          <div className="lp-guarantee">
            {['Escopo fechado: você sabe exatamente o que recebe antes de pagar', 'Você aprova o site antes de ir pro ar', '2 rodadas de ajuste incluídas', 'Suporte de 30 dias após a entrega'].map((t) => <div key={t}>{t}</div>)}
          </div>
          <div className="lp-scarcity">
            <p>Montamos 8 sites por mês pra manter o prazo de entrega.</p>
            <a href={wa} target="_blank" rel="noopener">Garantir uma vaga →</a>
          </div>
        </div>
      </section>

      <section className="lp-faq">
        <h2 className="lp-h2" style={{ marginBottom: 24 }}>Perguntas frequentes</h2>
        {faqs.map(([q, a]) => (
          <details key={q}>
            <summary><span>{q}</span><i /></summary>
            <p>{a}</p>
          </details>
        ))}
      </section>

      <section className="lp-wrap" style={{ paddingBottom: 96 }}>
        <div className="lp-final">
          <h2 className="lp-h2">Imagina terminar o atendimento, olhar o celular e ver três horários novos marcados, sem você ter respondido ninguém.</h2>
          <p>É isso que um site de agendamento faz pelo seu salão.</p>
          <a href={wa} target="_blank" rel="noopener" className="lp-btn lp-btn-lg">Quero meu site</a>
          <p className="ps"><strong>PS:</strong> você paga uma vez e o site trabalha todo dia. Clica no botão, manda &quot;quero meu site&quot; e a gente te mostra como fica com o nome do seu salão.</p>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap"><span>Agenda por Profissional · sites de agendamento para salões de beleza</span></div>
      </footer>

      <div className="lp-sticky"><a href={wa} target="_blank" rel="noopener" className="lp-btn">Quero meu site</a></div>
    </div>
  )
}
