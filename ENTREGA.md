# DriveData Assist — preparação de dados e construtor de gráficos

Prévia funcional local: http://127.0.0.1:5173/. Reinicie com INICIAR.ps1, após npm ci.

## Fluxo principal

1. Importe Excel, CSV ou TSV em Fontes de dados, revise a estrutura sugerida ou use a demonstração.
2. Abra **Preparar dados**. Selecione uma coluna e a operação; confira a prévia e clique **Adicionar etapa**. Repita e conclua em **Aplicar ao dashboard**.
3. Abra **Configurar** em um visual. As abas **Dados**, **Formato** e **Filtros** controlam a análise, com prévia e tabela dos resultados calculados.
4. Clique **Aplicar gráfico** e depois **Salvar** no dashboard. Reabra a análise em Meus dashboards.

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


## Importação e exploração avançadas

Veja [Pesquisa e evolução](PESQUISA-E-EVOLUCAO.md) para importação de planilhas desestruturadas, combinação de bases, tabelas dinâmicas, investigação de registros, recortes salvos, qualidade, colunas condicionais e extração de períodos. A interpretação usa regras locais, sem IA generativa ou API externa.

