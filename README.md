# DriveData Assist — preparação de dados e construtor de gráficos

Projeto DriveVision / DriveData Assist. Execute `npm ci` e `npm run dev`; prévia em http://127.0.0.1:5173/. Para hospedar, siga [Publicar na Vercel](DEPLOY-VERCEL.md).

O menu **Conexões** acompanha arquivos e pastas do SharePoint, OneDrive e Google Drive. Consulte [Fontes conectadas](CONNECTED-SOURCES.md) para registrar os aplicativos OAuth, configurar o agendamento e conferir os limites. A ativação de cada provedor depende das respectivas credenciais no servidor.

## Fluxo principal

**Novo dashboard** é a entrada única para enviar uma planilha, reaproveitar uma fonte, conectar OneDrive/SharePoint ou experimentar dados fictícios. Criar um painel em branco é uma escolha explícita. A demonstração pública abre um painel interativo na primeira visita, sem gravá-lo automaticamente na biblioteca.

1. Em **Importar planilha**, escolha a atividade da empresa e o objetivo. O modelo vazio e o exemplo preenchido explicam uma linha por item e a diferença entre item e pedido.
2. Envie Excel, CSV ou TSV e confira a estrutura. Em **Revisar publicação**, selecione nova base ou atualização de uma base existente.
3. Para um painel novo, confirme as correspondências de valor, data, pedido, cliente, produto/serviço, vendedor e canal. A prévia usa a fonte enviada. Colunas ambíguas ficam sem associação; dados inválidos impedem os indicadores afetados.
4. **Salvar e abrir meu painel** salva fonte e dashboard na mesma operação e abre a leitura. O contexto e as correspondências ficam no dashboard, dentro do workspace do cliente, e podem ser reutilizados. Atualizações da mesma base preservam o vínculo e reabrem seu painel existente.
5. Fontes já cadastradas oferecem **Criar painel guiado**. Em Conexões, analisar uma fonte abre seu painel existente ou a mesma conferência para criar o primeiro.
6. **Editar painel**, **Preparar dados** e **Configurar** permanecem disponíveis para personalização. Alterações posteriores precisam ser salvas.

O envio apresenta três etapas: negócio/arquivo, conferência da tabela e revisão do painel. Em leitura, os gráficos têm prioridade; **O que posso fazer neste painel?** explica filtros, investigação e personalização. A origem e as regras do painel ficam abaixo dos visuais. Uma falha de salvamento mantém a conferência e os campos disponíveis para tentar novamente.

### Escopo dos modelos de negócio

O primeiro painel cobre vendas e clientes para Comércio, Serviços, Indústria, Alimentação e Operação mista. O objetivo ordena as análises. O valor deve ser o total de cada linha; preços unitários e totais de pedido repetidos em vários itens exigem preparação anterior. Pedidos são contados por identificador distinto preenchido. Sem campo de valor, há apenas contagens; sem data, não há evolução temporal. A soma mantém valores negativos e não aplica deduções automáticas.

Esta etapa aplica a configuração, conferência e primeiro valor dos documentos de produto da Tamires, mas não implementa a visão completa: caixa, estoque, produção, lucro, margem e ticket médio não são calculados automaticamente por estes modelos. O histórico existente de versões de fontes também não equivale à retenção contratual de todos os arquivos originais descrita no plano. O mapeamento salvo é reaproveitado quando as colunas ainda existem; continua exigindo confirmação para cada painel novo.

`node scripts/test-business-onboarding.mjs` verifica totais, pedidos com vários itens, ambiguidades, valores ausentes, devoluções, objetivo, persistência compatível com a API e atualização idempotente da base.

## Manipulação dos dados

- Renomear colunas, alterar tipo para número, texto ou data.
- Remover espaços, padronizar caixa, substituir valores completos e preencher vazios.
- Editar células clicando na tabela; a edição vira uma etapa.
- Remover duplicações por todas as colunas ou por chaves escolhidas, mantendo a primeira linha.
- Filtrar linhas com condições E/OU, comparação, intervalo, texto e vazio/preenchido.
- Criar colunas por fórmula aritmética: [Receita] - [Custo], ([Receita] - [Custo]) / [Receita].
- Conferir valores distintos, vazios e incompatíveis por coluna; buscar, ordenar a prévia, paginar e exportar o resultado em CSV.

As fórmulas operam por linha, com números, referências entre colchetes, +, -, *, / e parênteses. Não executam JavaScript. Referências desconhecidas são rejeitadas; vazio, valor inválido e divisão por zero geram vazio. Uma média de percentuais por linha não representa automaticamente a razão dos totais.

As etapas são sequenciais, reversíveis a partir da última e específicas do dashboard. O arquivo original e os demais painéis ficam preservados. Renomear uma coluna atualiza referências nos gráficos e filtros; se remover uma coluna calculada em uso, o visual solicita selecionar outro campo.

## Construção dos gráficos

- Indicador, linhas, área, colunas, barras, rosca/pizza, combinado, tabela e texto.
- Até quatro medidas por gráfico, com campo, agregação, nome e cor próprios.
- Soma, média, contagem de linhas, contagem distinta, mínimo, máximo e mediana.
- Séries por categoria a partir da primeira medida: até oito categorias alfabéticas, com aviso se houver outras.
- Colunas agrupadas, séries empilhadas e gráfico combinado de colunas e linhas.
- Agrupamentos por dia, mês, trimestre ou ano; ordenação e top-N.
- Número, moeda, percentual, casas decimais, abreviação, prefixo e sufixo.
- Rótulos, legenda e posição, títulos e limites dos eixos, grade, traçado, espessura, abertura da rosca e linha de referência/meta.
- Filtros próprios por gráfico, cumulativos com os filtros do dashboard.
- Largura e altura, organização, duplicação, modelos, tema e apresentação.

Indicadores e roscas usam a primeira medida. No combinado, a primeira medida aparece em colunas e as demais em linhas, no mesmo eixo e formato. Limites de eixo manuais podem recortar dados. Roscas rejeitam negativos. Rótulos em gráficos estreitos são abreviados para manter a leitura; valores calculados continuam disponíveis na tabela da prévia. Em apresentação, cliques em gráficos compatíveis abrem os registros; seleções podem ser aplicadas ao painel. Tabelas dinâmicas também permitem explorar células.

## Armazenamento e limites

Excel XLSX/XLS ou CSV/TSV UTF-8: até 10 MB por arquivo, 30 abas, 160 colunas na origem, 20.000 registros e 60 colunas na base final. Uma aba/tabela por importação. O modelo preparado aceita até 100 colunas e 60 etapas. Até 24 visuais por dashboard e até 500 grupos por gráfico. CSV sem colunas numéricas também é aceito para preparação; inicia com contagens.

No modo local, dados e configurações ficam no IndexedDB deste navegador e endereço. No modo conta, login e persistência usam o PostgreSQL no schema exclusivo drivevision. Fontes e painéis podem ser reabertos em outro dispositivo. Há controle de versões para evitar sobrescritas concorrentes. Não há coedição, equipes, recuperação de senha, MFA ou cobrança. A IA generativa ainda não está integrada; o assistente usa comandos guiados. Consulte [Banco de dados](BANCO-DE-DADOS.md) e [Vercel](DEPLOY-VERCEL.md).

## Validação

```powershell
node node_modules/typescript/bin/tsc --noEmit
node scripts/test-analytics.mjs
node scripts/test-visual-builder.mjs
node scripts/test-data-model.mjs
node scripts/test-exploration.mjs
node scripts/test-smart-import.mjs
node node_modules/vite/bin/vite.js build --config vite.preview.config.ts
```

Testes de parsing e datas; fórmulas e rejeição de código; conversão de tipos; edição; duplicados; filtros E/OU, datas e vazios; renomeação e referências; múltiplas medidas; mediana e outras agregações; séries e agrupamento temporal; persistência das configurações.

Fluxo verificado no navegador com a demonstração: criar Lucro, comparar Receita e Lucro em gráfico combinado, filtrar Receita >= 1000 apenas no gráfico, configurar rótulos/moeda/tamanho, salvar, recarregar e reabrir. Painel global com 360 linhas e gráfico filtrado com 215. Verificação responsiva em viewport simulado; não representa aparelhos físicos ou Safari.

Prévia: React/Vite no cliente. Arquivos centrais: lib/data-model.ts, lib/chart-model.ts, lib/workspace-model.ts, components/data-studio.tsx, components/chart-studio.tsx, components/chart-renderer.tsx e components/visual-editor.tsx.

## Identidade visual

A interface usa a referência `DESIGN (4).md` e os tokens enviados em 25/09/2026: preto, branco, cinza #e5e5e5 e detalhes #d1ffca. O amarelo #fff100 sinaliza rascunhos. `app/design-system.css` centraliza os tokens e sua aplicação; `app/globals.css` define a ordem das folhas de estilo.

As fontes locais são Barlow Condensed Bold (títulos), Inter (interface) e IBM Plex Mono (rótulos técnicos), substitutas previstas na referência. Arquivos e licenças OFL ficam em `public/fonts`; a aplicação não depende do Google Fonts em tempo de execução. Cores escolhidas para séries, modo escuro do painel, densidade e cantos permanecem configuráveis.


## Importação e exploração avançadas

Consulte [Cargas recorrentes e histórico](CARGAS-E-HISTORICO.md) para atualização por identificador, substituição de período, combinações que acompanham as origens, versões recuperáveis e limites de retenção.

Veja [Pesquisa e evolução](PESQUISA-E-EVOLUCAO.md) para importação de planilhas desestruturadas, combinação de bases, tabelas dinâmicas, investigação de registros, recortes salvos, qualidade, colunas condicionais e extração de períodos. A interpretação usa regras locais, sem IA generativa ou API externa.



### Área de trabalho e identidade DriveData

Login com logo, ativação por link de uso único e entrada animada. Biblioteca em cartões, lista e quadro por pasta, favoritos, duplicação e quatro modelos iniciais. Editor com alças para mover/redimensionar e novos tipos árvore, radar, funil comparativo e medidor. Consulte [instruções e validação](AREA-DE-TRABALHO-E-ACESSO.md).
