import { t as translate, locale } from "@/lib/i18n";
/* This Vite application uses native navigation for query-based public routes. */
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */
import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChartNoAxesCombined,
  Database,
  SlidersHorizontal,
  ShieldCheck,
  Layers3,
  Plus,
  Minus,
} from "lucide-react";

export function PublicHeader() {
  return (
    <header className="sales-header">
      <a href="/" className="sales-brand">
        <img src="/drivedata-logo.png" width="36" height="36" alt="" />
        <span>
          {translate(" drive")}
          <b>{translate("vision")}</b>
          <small>{translate("POR DRIVEDATA")}</small>
        </span>
      </a>
      <nav aria-label={translate("Menu principal")}>
        <a href="/#recursos">{translate("O produto")}</a>
        <a href="/#plano">{translate("O plano")}</a>
        <a className="sales-login" href="/?view=login">
          {translate(" Entrar ")}
          <ArrowUpRight size={16} />
        </a>
      </nav>
    </header>
  );
}
export function PublicFooter() {
  return (
    <footer className="sales-footer">
      <div>
        <strong>{translate("DriveVision / DriveData")}</strong>
        <p>{translate("DRIVEDATA LTDA · CNPJ 55.175.790/0001-38")}</p>
      </div>
      <nav aria-label={translate("Informações")}>
        <a href="/?view=terms">{translate("Termos de uso")}</a>
        <a href="/?view=privacy">{translate("Privacidade")}</a>
        <a href="mailto:suporte@drivedata.com.br">
          {translate(" Fale com a gente ")}
          <ArrowUpRight size={14} />
        </a>
      </nav>
    </footer>
  );
}
function Preview() {
  const [period, setPeriod] = useState("Semestre");
  const bars =
    period === "Semestre" ? [34, 49, 42, 69, 63, 89] : [44, 31, 68, 53, 78, 95];
  return (
    <div className="sales-preview">
      <div className="preview-top">
        <span>
          <span className="preview-dot" /> {translate(" SEU WORKSPACE ")}
        </span>
        <span>{translate("DADOS ILUSTRATIVOS")}</span>
      </div>
      <div className="preview-layout">
        <div className="preview-rail" aria-hidden="true">
          <ChartNoAxesCombined />
          <Layers3 />
          <Database />
          <SlidersHorizontal />
        </div>
        <div className="preview-content">
          <div className="preview-title">
            <div>
              <small>{translate("VISÃO COMERCIAL")}</small>
              <h3>{translate("O negócio, por inteiro.")}</h3>
            </div>
            <select
              aria-label={translate("Período da demonstração")}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="Semestre">{translate("Semestre")}</option>
              <option value="Últimos meses">
                {translate("Últimos meses")}
              </option>
            </select>
          </div>
          <div className="preview-kpis">
            <article>
              <small>{translate("Receita")}</small>
              <strong>
                {translate(" R$ ")}
                {period === "Semestre" ? "128.450" : "142.780"}
              </strong>
              <span>{translate("↗ Visão do período")}</span>
            </article>
            <article>
              <small>{translate("Pedidos")}</small>
              <strong>{period === "Semestre" ? "842" : "916"}</strong>
              <span>{translate("Todos os canais")}</span>
            </article>
            <article>
              <small>{translate("Ticket médio")}</small>
              <strong>
                {translate("R$ ")}
                {period === "Semestre" ? "152" : "156"}
              </strong>
              <span>{translate("Por pedido")}</span>
            </article>
          </div>
          <div className="preview-charts">
            <article>
              <div className="preview-chart-label">
                <strong>{translate("Receita ao longo do tempo")}</strong>
                <span>{translate("● Vendas")}</span>
              </div>
              <div
                className="preview-bars"
                aria-label={translate("Gráfico ilustrativo de receita")}
              >
                <div className="preview-grid" />
                {bars.map((height, i) => (
                  <div key={i}>
                    <span style={{ height: `${height}%` }} />
                    <small>
                      {translate(["Abr", "Mai", "Jun", "Jul", "Ago", "Set"][i])}
                    </small>
                  </div>
                ))}
              </div>
            </article>
            <article className="preview-mix">
              <strong>{translate("Vendas por canal")}</strong>
              <div className="preview-donut">
                <span>
                  3<small>{translate("CANAIS")}</small>
                </span>
              </div>
              <p>
                <i /> {translate(" Online ")}
                <b>48%</b>
              </p>
              <p>
                <i /> {translate(" Loja ")}
                <b>32%</b>
              </p>
              <p>
                <i /> {translate(" Parceiros ")}
                <b>20%</b>
              </p>
            </article>
          </div>
          <div className="preview-bottom">
            <span>
              <Check size={14} /> {translate(" Excel + OneDrive + SharePoint ")}
            </span>
            <span>{translate("Suas métricas. Seu jeito.")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
const faqs = [
  [
    "Preciso saber programar?",
    "Não. Você importa sua base, prepara os dados e configura os gráficos pela interface. Pode explorar a demonstração antes de assinar para conhecer o funcionamento.",
  ],
  [
    "Posso usar mais de uma planilha?",
    "Sim. Você pode importar Excel e CSV, preparar os dados e combinar fontes. Planilhas desorganizadas têm uma etapa de revisão: confira cabeçalhos, tipos e tabelas identificadas antes de confirmar.",
  ],
  [
    "As conexões ficam na minha conta?",
    "Sim. Você entra na sua própria conta Microsoft e autoriza o acesso no DriveVision. Depois escolhe os arquivos ou pastas do OneDrive ou SharePoint. A política da sua organização pode exigir aprovação do administrador Microsoft.",
  ],
  [
    "Qual é o tamanho de base suportado?",
    "O plano comporta até 50 bases no workspace, 20 mil linhas e 100 colunas por base e até 24 visuais por painel. O salvamento também está sujeito ao limite total de 3,5 MB compactados. Explore a demonstração com uma amostra dos seus dados antes de contratar.",
  ],
  [
    "Como funciona a cobrança e o cancelamento?",
    "Novas assinaturas têm 7 dias grátis com cartão cadastrado no Asaas. Depois, R$ 59,90 por mês automaticamente. O teste é liberado após a confirmação do cadastro do cartão. A data da primeira cobrança aparece no checkout e em Minha assinatura. Cancele antes dessa data para não cobrar. Para ajuda ou reembolso, use Ajuda e contato.",
  ],
  [
    "Posso dar acesso para minha equipe?",
    "Neste plano, cada assinatura corresponde a uma conta responsável e um workspace privado. Não compartilhe sua senha. Para uma operação com vários responsáveis, converse com a DriveData.",
  ],
];
export function LandingPage({ onDemo }: { onDemo: () => void }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <main className="sales-page">
      <PublicHeader />
      <section className="sales-hero">
        <h1>
          {translate(" MENOS PLANILHAS ABERTAS. ")}
          <br />
          <em>{translate("MAIS VISÃO DO NEGÓCIO.")}</em>
        </h1>
        <p>
          {translate(
            " Junte suas bases, crie dashboards do seu jeito e acompanhe ",
          )}
          <br className="desktop-break" />{" "}
          {translate(" os números que movem a sua empresa. Em um só lugar. ")}
        </p>
        <div className="sales-actions">
          <a className="sales-button" href="/?view=signup">
            {translate(" Testar grátis por 7 dias ")}
            <ArrowUpRight size={20} />
          </a>
          <button className="sales-link" onClick={onDemo}>
            {translate(" Explorar a demonstração ")}
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="sales-hero-note">
          <span>
            <Check size={14} /> {translate(" Sem fidelidade ")}
          </span>
          <span>
            <Check size={14} /> {translate(" Workspace privado ")}
          </span>
          <span>
            <Check size={14} /> {translate(" Sem programação ")}
          </span>
        </div>
        <Preview />
      </section>
      <section
        className="sales-strip"
        aria-label={translate("Fontes de dados")}
      >
        <span>{translate("DO ARQUIVO À DECISÃO")}</span>
        <b>{translate("Excel")}</b>
        <span>+</span>
        <b>{translate("CSV")}</b>
        <span>+</span>
        <b>{translate("OneDrive")}</b>
        <span>+</span>
        <b>{translate("SharePoint")}</b>
      </section>
      <section className="sales-features" id="recursos">
        <div className="sales-section-heading">
          <h2>
            {translate(" VOCÊ CONHECE O NEGÓCIO. ")}
            <br />
            <em>{translate("AGORA, ENXERGUE OS DADOS.")}</em>
          </h2>
          <p>
            {translate(
              " Um espaço para explorar, organizar e transformar números em próximas ações. ",
            )}
          </p>
        </div>
        <div className="sales-feature-grid">
          <article className="feature-mint">
            <Database size={28} />
            <span>01</span>
            <h3>
              {translate(" SUAS BASES. ")}
              <br />
              {translate(" CONECTADAS. ")}
            </h3>
            <p>
              {translate(
                " Importe Excel e CSV ou conecte arquivos da Microsoft. Escolha o conteúdo e programe as atualizações. ",
              )}
            </p>
            <div className="feature-tags">
              <b>{translate(".xlsx")}</b>
              <b>{translate(".csv")}</b>
              <b>{translate("↻ Conexões")}</b>
            </div>
          </article>
          <article>
            <SlidersHorizontal size={28} />
            <span>02</span>
            <h3>
              {translate(" GRÁFICOS COM ")}
              <br />
              {translate("A SUA CARA. ")}
            </h3>
            <p>
              {translate(
                " Escolha medidas, dimensões, filtros e tipos de visual. Organize o painel com arrastar e soltar. ",
              )}
            </p>
            <div className="feature-mini-bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </article>
          <article className="feature-black">
            <Layers3 size={28} />
            <span>03</span>
            <h3>
              {translate(" UMA VISÃO PARA ")}
              <br />
              {translate(" CADA PERGUNTA. ")}
            </h3>
            <p>
              {translate(
                " Crie diferentes dashboards no mesmo workspace. Vendas, operação ou financeiro: você escolhe o foco. ",
              )}
            </p>
            <div className="feature-tags">
              <b>{translate("Comercial ↗")}</b>
              <b>{translate("Financeiro ↗")}</b>
            </div>
          </article>
        </div>
      </section>
      <section className="sales-how">
        <div>
          <h2>
            {translate(" SEU PRIMEIRO PAINEL ")}
            <br />
            {translate(" COMEÇA AQUI. ")}
          </h2>
          <a className="sales-link" href="/?view=signup">
            {translate(" Criar minha conta ")}
            <ArrowUpRight size={18} />
          </a>
        </div>
        <ol>
          <li>
            <span>01</span>
            <div>
              <h3>{translate("Crie sua conta e teste")}</h3>
              <p>
                {translate(
                  " Pagamento protegido no ambiente do Asaas. Seu acesso é liberado após a confirmação. ",
                )}
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>{translate("Traga seus dados")}</h3>
              <p>
                {translate(
                  " Importe um arquivo ou conecte uma origem. Revise e prepare as informações. ",
                )}
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>{translate("Monte sua visão")}</h3>
              <p>
                {translate(
                  " Escolha as métricas, ajuste os visuais e salve seu dashboard para acompanhar depois. ",
                )}
              </p>
            </div>
          </li>
        </ol>
      </section>
      <section className="sales-pricing" id="plano">
        <div>
          <h2>
            {translate(" UM INVESTIMENTO ")}
            <br />
            <em>{translate("QUE CABE NO MÊS.")}</em>
          </h2>
          <p>
            {translate(" Saia das abas espalhadas para um workspace ")}
            <br />
            {translate(" que acompanha suas decisões. ")}
          </p>
          <div className="sales-security">
            <ShieldCheck size={24} />
            <p>
              {translate(" Seu ambiente é privado. ")}
              <br />
              <strong>{translate("Pagamento processado pelo Asaas.")}</strong>
            </p>
          </div>
        </div>
        <article className="sales-price-card">
          <div className="sales-price-top">
            <strong>{translate("DRIVEVISION")}</strong>
            <span>{translate("PLANO MENSAL")}</span>
          </div>
          <div className="sales-price">
            <span>{translate("R$")}</span>
            <strong>59,90</strong>
            <span>{translate("/mês")}</span>
          </div>
          <p>
            <strong>{translate("7 dias grátis para começar.")}</strong>{" "}
            {translate(" Uma conta. Seu workspace de análises. ")}
          </p>
          <ul>
            {[
              "Criação de múltiplos dashboards",
              "Gráficos, filtros e arrastar e soltar",
              "Importação e preparação de Excel e CSV",
              "Conexões com OneDrive e SharePoint",
              "Atualizações agendadas das fontes conectadas",
              "Central de ajuda e atendimento DriveData",
            ].map((s) => (
              <li key={s}>
                <Check size={17} />
                {translate(s)}
              </li>
            ))}
          </ul>
          <a className="sales-button" href="/?view=signup">
            {translate(" Quero meu DriveVision ")}
            <ArrowUpRight size={21} />
          </a>
          <small>
            {translate(
              " Cartão necessário. Após 7 dias grátis, renovação mensal automática. Cancele antes da primeira cobrança para não cobrar. ",
            )}
            <br />
            {translate(" Confira os limites de uso nas perguntas abaixo. ")}
          </small>
        </article>
      </section>
      <section className="sales-faq">
        <h2>{translate("ANTES DE COMEÇAR.")}</h2>
        {faqs.map(([q, a], i) => (
          <article key={q}>
            <h3>
              <button
                aria-expanded={open === i}
                aria-controls={`faq-${i}`}
                onClick={() => setOpen(open === i ? null : i)}
              >
                {translate(q)}
                {open === i ? <Minus size={19} /> : <Plus size={19} />}
              </button>
            </h3>
            <p id={`faq-${i}`} hidden={open !== i}>
              {translate(a)}
            </p>
          </article>
        ))}
      </section>
      <section className="sales-last">
        <div>
          <h2>{translate("DÊ UMA NOVA VISÃO A ELES.")}</h2>
        </div>
        <a className="sales-button" href="/?view=signup">
          {translate(" Começar agora ")}
          <ArrowUpRight size={22} />
        </a>
      </section>
      <PublicFooter />
    </main>
  );
}

export function LegalPage({ privacy }: { privacy: boolean }) {
  return (
    <main className="sales-page">
      <PublicHeader />
      <article className="sales-legal">
        <h1>
          {privacy
            ? translate("POLÍTICA DE PRIVACIDADE")
            : translate("TERMOS DE USO E ASSINATURA")}
        </h1>
        <p>
          {translate(
            " Serviço oferecido por DRIVEDATA LTDA, CNPJ 55.175.790/0001-38. Endereço: Alameda Rio Negro, 503, Alphaville, Barueri/SP, CEP 06454-000. Contato:",
          )}{" "}
          <a href="mailto:suporte@drivedata.com.br">
            {translate("suporte@drivedata.com.br")}
          </a>
          .
        </p>
        {privacy ? (
          <>
            <h2>{translate("Quais dados utilizamos")}</h2>
            <p>
              {translate(
                " Tratamos nome, e-mail, credenciais protegidas, registros de acesso e os arquivos e análises que você escolhe salvar. Ao conectar uma conta Microsoft, guardamos os tokens de acesso criptografados para ler o conteúdo autorizado e executar as atualizações solicitadas. ",
              )}
            </p>
            <h2>{translate("Para quais finalidades")}</h2>
            <p>
              {translate(
                " Os dados são usados para fornecer seu workspace, autenticar acessos, processar a assinatura, atender solicitações e proteger o serviço. Para dados pessoais presentes nas suas bases, cabe a você possuir autorização e definir a finalidade do tratamento. Evite enviar dados sensíveis desnecessários. ",
              )}
            </p>
            <h2>{translate("Pagamento e fornecedores")}</h2>
            <p>
              {translate(
                " O Asaas processa o pagamento no próprio ambiente. O DriveVision não recebe o número completo do cartão nem seu código de segurança. Mantemos identificadores de cobrança, situação, valor, vencimento e período de acesso. Utilizamos Vercel para hospedagem e Supabase/PostgreSQL para armazenamento. Esses fornecedores podem processar dados em infraestrutura fora do Brasil, conforme seus contratos e políticas. ",
              )}
            </p>
            <h2>{translate("Seu controle sobre os dados")}</h2>
            <p>
              {translate(
                " Você pode gerenciar suas fontes, remover conexões e exportar suas análises pela aplicação. Solicitações de acesso, correção, exclusão, informação sobre compartilhamento e demais direitos devem ser enviadas ao suporte. Podemos solicitar confirmação de identidade antes de atendê-las. ",
              )}
            </p>
            <h2>{translate("Retenção e encerramento")}</h2>
            <p>
              {translate(
                " Cancelar a renovação não exclui automaticamente a conta nem os dados. Eles permanecem armazenados para permitir a continuidade ou retomada do serviço, até a exclusão solicitada ou comunicada pela DriveData. Registros necessários ao cumprimento de obrigações e à defesa de direitos podem ser mantidos pelo prazo aplicável. Backups podem ter um ciclo de eliminação diferente da base principal. O histórico de fontes obedece às opções e limites disponíveis no produto. ",
              )}
            </p>
            <h2>{translate("Atendimento e mensagens")}</h2>
            <p>
              {translate(
                " Ao falar conosco, armazenamos nome, e-mail, empresa e telefone quando informados, assunto, descrição, autorização de contato e histórico do atendimento. Esses dados são utilizados pela equipe DriveData para responder e acompanhar sua solicitação. As notificações de novos chamados são enviadas aos responsáveis pelo atendimento via Resend. O assistente de ajuda consulta guias locais; as perguntas do chat não são enviadas a serviços de inteligência artificial. Evite inserir dados sensíveis nos formulários. ",
              )}
            </p>
            <h2>{translate("Cookies e segurança")}</h2>
            <p>
              {translate(
                " Utilizamos um cookie essencial para manter sua sessão e armazenamento local para preferências e o modo de demonstração. O acesso aos dados é separado por conta. Não compartilhe sua senha e desconecte o acesso em dispositivos de terceiros. ",
              )}
            </p>
          </>
        ) : (
          <>
            <h2>{translate("O que você contrata")}</h2>
            <p>
              {translate(
                " O plano mensal oferece uma conta responsável e um workspace privado para importar, preparar e visualizar dados. Inclui múltiplos dashboards, até 50 bases, 20 mil linhas e 100 colunas por base, até 24 visuais por painel e até 3,5 MB compactados por salvamento do workspace. Arquivos de conexões externas têm limite de 10 MB. Não inclui implantação personalizada, consultoria, licença Microsoft ou licença de outro fornecedor. ",
              )}
            </p>
            <h2>{translate("Preço, pagamento e liberação")}</h2>
            <p>
              {translate(
                " O preço é de R$ 59,90 por mês, com renovação automática no cartão via Asaas. Novas contas elegíveis têm um teste de 7 dias, concedido uma única vez por conta após a confirmação do cadastro do cartão no checkout. A primeira cobrança ocorre na data exibida no checkout e em Minha assinatura, após pelo menos sete dias completos de teste. Como a cobrança ocorre por data, o prazo é arredondado para o próximo dia em Brasília para não antecipar a cobrança. Criar a conta ou abrir o checkout não libera o teste. Após o teste, o acesso depende da confirmação do pagamento. O período disponível e a situação são exibidos em Minha assinatura. Alterações futuras de preço ou condições serão comunicadas antes de sua aplicação. ",
              )}
            </p>
            <h2>{translate("Cancelamento e reembolso")}</h2>
            <p>
              {translate(
                " Você pode cancelar a renovação em Minha assinatura. O cancelamento impede novas cobranças e mantém o acesso até o fim do teste ou do período já pago, salvo estorno ou contestação. Para evitar a primeira cobrança, cancele antes da data de término do teste. Solicite reembolso ou atendimento sobre cobrança pelo suporte. Os direitos legais aplicáveis ao consumidor, inclusive arrependimento quando cabível, são preservados. ",
              )}
            </p>
            <h2>{translate("Uso dos dados e conexões")}</h2>
            <p>
              {translate(
                " Você é responsável pela origem e autorização de uso das bases e pela conferência dos resultados. A preparação automática auxilia a importação, mas exige sua revisão. Integrações dependem da disponibilidade e das permissões dos fornecedores. Não envie conteúdo ilícito nem tente acessar informações de outras contas. ",
              )}
            </p>
            <h2>{translate("Disponibilidade, suporte e encerramento")}</h2>
            <p>
              {translate(
                " O suporte é prestado pela central Ajuda e contato e pelo e-mail informado nesta página. O serviço pode passar por manutenção e apresentar interrupções; mantenha cópias das suas bases originais. Não há garantia de resultado de negócio. Em caso de inadimplência, o acesso às análises é interrompido ao fim do teste ou do período pago, permanecendo disponíveis a área de assinatura e a central de atendimento. Suspensões por segurança ou uso indevido serão tratadas pelo suporte. A exclusão da conta pode ser solicitada ao suporte, observadas as retenções legais. ",
              )}
            </p>
          </>
        )}
        <a className="sales-button" href="/?view=signup">
          {translate(" Voltar ao cadastro ")}
          <ArrowRight size={18} />
        </a>
      </article>
      <PublicFooter />
    </main>
  );
}
