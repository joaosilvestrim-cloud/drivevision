# Evolução do DriveData Assist

Pesquisa e implementação local em 25/09/2026. Referências selecionadas de produtos de BI; não constitui levantamento exaustivo do mercado.

## Referências e recursos implementados

| Referência oficial | Recurso aplicado |
| --- | --- |
| [Metabase: investigação dos registros](https://www.metabase.com/docs/latest/questions/visualizations/drill-through) e [dashboards interativos](https://www.metabase.com/docs/latest/dashboards/interactive) | Abrir registros de um gráfico, buscar, ordenar, exportar e aplicar seleções cumulativas ao painel. |
| [Metabase: tabela dinâmica](https://www.metabase.com/docs/latest/questions/visualizations/pivot-table) e [formatação de tabelas](https://www.metabase.com/docs/latest/questions/visualizations/table) | Cruzamento entre duas dimensões, medida e agregação configuráveis, mapa de calor, totais recalculados e exportação. |
| [Tableau Prep: joins e unions](https://help.tableau.com/current/prep/en-us/prep_combine.htm) | Combinar fontes por chave ou empilhar registros, com prévia e contagem de correspondências. |
| [Power BI: bookmarks](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-bookmarks) | Guardar recortes nomeados com período, filtros e seleções no dashboard. |
| [Grist: tabelas de resumo](https://support.getgrist.com/summary-tables/) | Agregações verificáveis e navegação entre resumo e registros. |
| [SheetJS: instalação oficial](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [mesclagens](https://docs.sheetjs.com/docs/csf/features/merges/) e [datas](https://docs.sheetjs.com/docs/csf/features/dates/) | Leitura local de Excel, preservação de datas e tratamento explícito de células mescladas. |

Também foram adicionados: diagnóstico de qualidade, concentração por categoria, valores atípicos por intervalo interquartil, colunas condicionais e extração de ano, mês, trimestre e dia da semana. Destaques são cálculos descritivos, não previsões de IA.

## Planilhas desestruturadas

Em **Dados → Importar planilha**, selecione Excel, CSV ou TSV. O sistema procura possíveis tabelas, sugere um cabeçalho e apresenta o arquivo original junto com o resultado organizado. É possível:

- Escolher a aba, o bloco e o intervalo de linhas e colunas.
- Combinar até três linhas de cabeçalho, inclusive células mescladas.
- Remover cabeçalhos repetidos e, por escolha do usuário, linhas marcadas Total/Subtotal.
- Preencher categorias para baixo e repetir valores de mesclagens.
- Empilhar meses ou categorias distribuídos em colunas, gerando campos de categoria e valor.
- Conferir tipos, valores misturados, fórmulas e possíveis totais antes de gerar o painel.

A biblioteca de Excel é distribuída com a aplicação. A leitura ocorre em um Web Worker no navegador; os arquivos não são enviados a API externa. A origem e um resumo das transformações da importação ficam disponíveis em **Ver dados**. O original permanece intacto.

### Limites atuais

- Regras estruturais locais, sem LLM ou IA generativa. Não há compreensão universal de planilhas, OCR ou interpretação de regras de negócio.
- Até 10 MB por arquivo, 30 abas, 160 colunas na origem e 2 milhões de células na área utilizada do Excel. Até 20 mil registros e 60 colunas na base importada.
- A detecção automática examina as primeiras mil linhas; intervalos maiores podem ser selecionados manualmente. Linhas vazias podem encerrar o bloco sugerido; a prévia permite ajustar o fim.
- Uma aba/tabela por importação. Fórmulas usam somente os resultados salvos; não são recalculadas. Macros não são executadas. CSV deve estar em UTF-8.
- Totais são mantidos até o usuário optar por removê-los. Identificação por rótulo pode ser ambígua e precisa de revisão.
- Joins aceitam chave única à direita e não relacionam chaves vazias. São cópias materializadas das fontes importadas, sem atualização automática nem aplicação dos tratamentos particulares de outro dashboard.
- Tabelas dinâmicas exibem até 100 grupos de linha e 30 de coluna; os totais incluem todos os registros, com aviso sobre os grupos omitidos.
- Recortes guardam filtros, não o layout. Até 12 por dashboard. É necessário salvar o dashboard para persistir mudanças.
- Dados locais em IndexedDB, separados por navegador e endereço. Sem contas, servidor multiusuário ou sincronização. A entrega continua sendo uma prévia local.

## Validação

Testes automatizados: importação CSV/Excel, datas, mesclagens, cabeçalhos duplicados, identificação de blocos, empilhamento sem alterar somas, preservação de zeros à esquerda, limites, imutabilidade, joins e cardinalidade, totais de pivôs, filtros, qualidade, colunas condicionais, datas e persistência das configurações.

Fluxos verificados no navegador:

1. CSV com título, espaços, cabeçalho na linha 5, cabeçalho repetido e total: empilhamento de Janeiro/Fevereiro resultou em quatro registros e soma 1.000 no painel.
2. Excel com duas abas: seleção de aba, datas preservadas e composição do cabeçalho mesclado em dois níveis.
3. Coluna condicional: Valor >= 300 classifica dois registros como Prioridade e dois como Regular.
4. Tabela dinâmica, investigação de célula, filtros cumulativos e recorte salvo/reaberto: 21 registros no recorte Sul + Consultoria da demonstração.
5. Junção de 360 vendas com cinco regiões: 360 correspondências, zero sem correspondência e oito colunas, preservando as fontes.
6. Importador em larguras simuladas de 320, 390 e 768 px, com botão de confirmação acessível e sem transbordamento horizontal da página. Não equivale a teste em aparelho físico ou Safari.

Compilação TypeScript e build da prévia Vite integram a verificação. O build SSR do scaffold não é a prévia utilizada nesta entrega.

## Atualização: persistência em conta

A etapa posterior adicionou contas próprias e armazenamento no PostgreSQL, isolados no schema drivevision. Os limites locais descritos acima continuam válidos no modo local. Veja BANCO-DE-DADOS.md e DEPLOY-VERCEL.md para a arquitetura atual e configuração da hospedagem.
