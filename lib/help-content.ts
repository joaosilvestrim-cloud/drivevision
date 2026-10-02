import { t } from "./i18n";
export const helpTopics = [
  {
    id: "inicio",
    title: "Meu primeiro dashboard",
    group: "Primeiros passos",
    keywords: "começar inicio usar criar painel dashboard",
    text: "No workspace, importe uma planilha em Fontes de dados. Confira a prévia e os tipos das colunas antes de salvar. Crie um dashboard, adicione um visual e escolha a base, a dimensão (por exemplo, mês) e a medida (por exemplo, receita). Você pode criar outros painéis com a mesma base.",
  },
  {
    id: "excel",
    title: "Importar Excel ou CSV",
    group: "Dados",
    keywords:
      "excel csv arquivo planilha subir upload importar desestruturada cabeçalho",
    text: "Importe seu arquivo na área de fontes e revise a preparação sugerida. Escolha a aba e a linha de cabeçalho, confira números e datas e remova linhas que não são dados, como títulos e totais. Arquivos desestruturados precisam dessa conferência: a detecção automática pode exigir ajustes. Não envie suas planilhas pelo formulário de suporte.",
  },
  {
    id: "combinar",
    title: "Combinar bases e evitar duplicatas",
    group: "Dados",
    keywords: "juntar combinar duplicado duplicatas arquivos bases unir chave",
    text: "Na preparação dos dados, escolha entre acrescentar linhas e relacionar bases por uma chave em comum. Confira os nomes e tipos das colunas. Para evitar duplicatas, use campos que identifiquem o registro (como código do pedido e item) e revise o resultado antes de publicar. Uma atualização de fonte não substitui a definição correta dessas chaves.",
  },
  {
    id: "grafico",
    title: "Personalizar meus gráficos",
    group: "Dashboards",
    keywords:
      "grafico visual cores personalizar medida soma media barras pizza tabela",
    text: "Selecione um visual no dashboard para editar suas opções. Escolha o tipo de gráfico, dimensão, medida e agregação. Ajuste título, cores e formatação conforme as opções do visual. Para categorias, experimente barras; para evolução no tempo, linhas; para valores detalhados, uma tabela.",
  },
  {
    id: "layout",
    title: "Organizar e mover os visuais",
    group: "Dashboards",
    keywords: "arrastar soltar mover tamanho organizar layout",
    text: "Abra o dashboard no modo de edição e use os controles de movimentação e tamanho dos visuais. Organize os indicadores principais primeiro e os detalhes abaixo. Antes de sair, confira o indicador de salvamento na nuvem. Se houver conflito com outra aba, preserve seu rascunho e recarregue.",
  },
  {
    id: "filtros",
    title: "Explorar e filtrar os dados",
    group: "Dashboards",
    keywords: "filtro filtrar explorar periodo periodo data segmento",
    text: "Use os filtros disponíveis no dashboard ou no visual para selecionar o período e as categorias. Confira qual base alimenta cada gráfico e a agregação escolhida. Se o resultado não for o esperado, limpe os filtros e compare os registros na tabela antes de mudar a medida.",
  },
  {
    id: "microsoft",
    title: "Conectar OneDrive ou SharePoint",
    group: "Conexões",
    keywords: "onedrive sharepoint microsoft conectar pasta conexão",
    text: "Abra Conexões, clique em Conectar conta e autorize o acesso na Microsoft com sua própria conta. Depois selecione o arquivo ou pasta e configure a importação. Algumas empresas exigem aprovação do administrador Microsoft. A DriveData não precisa receber sua senha.",
    href: "/?view=connections",
    action: "Abrir Conexões",
  },
  {
    id: "atualizacao",
    title: "Agendar atualizações",
    group: "Conexões",
    keywords: "agendar atualização atualizar diaria diariamente sincronizar",
    text: "Após vincular o conteúdo do OneDrive ou SharePoint, configure a frequência e o horário disponíveis. Consulte o histórico de execuções para conferir falhas e a última atualização. Se mover o arquivo ou revogar a autorização Microsoft, a conexão poderá precisar de nova seleção ou autorização.",
  },
  {
    id: "omie",
    title: "Conectar Omie",
    group: "Conexões",
    keywords: "omie api erp vendas pedidos faturados chave app key secret integrar",
    text: "Abra Conexões → Conectar Omie. Informe as chaves da sua empresa, disponíveis no Omie em Meus aplicativos → engrenagem → Resumo do App → Chave de Integração (API). Escolha 30, 90 ou 365 dias, confira a prévia e defina o horário diário. A conexão lê até 5.000 pedidos de produtos faturados, uma linha por pedido, excluindo cancelados, denegados e pedidos com devolução total ou parcial. Depois da importação, escolha seu segmento e crie o painel sugerido. Em caso de falha, os dados anteriores são preservados; confira o histórico em Conexões.",
    href: "/?view=connections",
    action: "Abrir Conexões",
  },
  {
    id: "futuro",
    title: "Google Drive e APIs externas",
    group: "Conexões",
    keywords: "google drive api externa integração sistema erp plugplay",
    text: "A conexão com Omie já permite consultar pedidos faturados. Google Drive, Bling e outros sistemas continuam em breve. Você também pode importar Excel/CSV ou conectar OneDrive e SharePoint. Fale com a equipe para informar qual integração precisa; isso não representa uma promessa de prazo.",
  },
  {
    id: "plano",
    title: "Teste grátis e mensalidade",
    group: "Assinatura",
    keywords:
      "preço valor comprar pagar cartão gratuito gratis teste trial mensal plano assinatura",
    text: "Novas assinaturas elegíveis têm 7 dias grátis, com cadastro do cartão no checkout seguro do Asaas. Depois, a cobrança é de R$ 59,90 por mês, automaticamente, salvo cancelamento. Confira a data exata da primeira cobrança antes de confirmar. O teste começa após a confirmação do cadastro pelo Asaas; criar uma conta, sozinho, não libera o workspace.",
    href: "/?view=billing",
    action: "Ver minha assinatura",
  },
  {
    id: "cancelar",
    title: "Cancelar a renovação",
    group: "Assinatura",
    keywords: "cancelar cancelamento cobrança renovação reembolso estorno",
    text: "Abra Minha assinatura e escolha Cancelar renovação. Para evitar a primeira cobrança, cancele antes da data informada para o fim do teste. O cancelamento interrompe novas cobranças; o acesso permanece até o fim do período já concedido. Solicitações de reembolso devem ser analisadas pela equipe pelo formulário de contato.",
    href: "/?view=billing",
    action: "Gerenciar assinatura",
  },
  {
    id: "acesso",
    title: "Senha, confirmação e acesso",
    group: "Conta",
    keywords:
      "senha login entrar email e-mail confirmar confirmação recuperar bloqueado",
    text: "Na tela de login, use a opção de recuperação para criar uma nova senha. Se ainda não confirmou o e-mail, procure a mensagem na caixa de entrada e no spam ou solicite um novo envio. Links podem expirar. Nunca envie sua senha ou códigos de autenticação para o suporte.",
    href: "/?view=recover",
    action: "Recuperar senha",
  },
  {
    id: "privacidade",
    title: "Privacidade e meus dados",
    group: "Conta",
    keywords: "lgpd privacidade dados segurança excluir exclusão histórico",
    text: "Seu workspace está associado à sua conta. Para solicitar informações sobre seus dados, exclusão ou esclarecer retenção do histórico, abra um atendimento na categoria Conta e acesso. Não inclua senhas, cartões ou dados pessoais de terceiros. Consulte a política de privacidade para conhecer o tratamento de dados.",
    href: "/?view=privacy",
    action: "Ler política de privacidade",
  },
];
export function findHelp(question: string) {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const words = normalize(question)
    .split(/\W+/)
    .filter(
      (w) =>
        w.length > 2 &&
        ![
          "como",
          "para",
          "quero",
          "qual",
          "meu",
          "minha",
          "uma",
          "que",
          "com",
          "nao",
          "por",
          "isso",
          "voce",
          "tem",
          "how",
          "the",
          "can",
          "with",
          "want",
          "what",
          "this",
          "for",
          "como",
          "con",
          "que",
          "quiero",
          "una",
          "mis",
          "los",
          "las",
        ].includes(w),
    );
  return helpTopics
    .map((topic) => ({
      topic,
      score: words.reduce(
        (n, w) =>
          n +
          (normalize(
            topic.title +
              " " +
              topic.keywords +
              " " +
              t(topic.title) +
              " " +
              t(topic.keywords),
          ).includes(w)
            ? 1
            : 0),
        0,
      ),
    }))
    .filter((v) => v.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((v) => v.topic);
}
