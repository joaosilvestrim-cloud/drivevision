# Onboarding por conhecimento

Em **Novo dashboard**, o comprador pode enviar Excel/CSV ou preparar um painel a partir de uma fonte já cadastrada, inclusive dados importados pelas conexões. O fluxo pergunta nível de conhecimento, atividade e objetivo.

- **Estou começando:** revisão de campos seguida de sugestões de gráficos com explicações. Ajustes de estrutura ficam recolhidos quando há uma tabela detectada; ambiguidades e erros mantêm os controles abertos.
- **Já uso planilhas / Tenho experiência com BI:** revisão direta de campos e gráficos, sem as explicações introdutórias.
- Todas as sugestões exibem dados reais da fonte e podem ser desmarcadas. É necessário selecionar pelo menos um visual e confirmar os campos antes de salvar.
- O nível é salvo em `config.businessContext.profile.knowledge` junto com o painel. A criação seguinte reaproveita o contexto de um painel existente; não é uma preferência independente da conta. Painéis antigos continuam compatíveis e pedem o nível na próxima criação guiada.
- **Outra atividade / Explorar outros dados** permite análise genérica por categoria e período. Totais genéricos não são rotulados como vendas ou moeda automaticamente.

A interpretação usa regras locais, nomes de colunas e validação dos valores. Não é IA generativa nem compreensão irrestrita das regras de negócio. Valores e datas inválidos precisam ser corrigidos ou desassociados; nomes ambíguos não escolhem uma medida financeira silenciosamente. Os modelos financeiros próprios dos conectores permanecem independentes.

Validação: `node scripts/test-business-onboarding.mjs`, `node scripts/test-i18n.mjs` e `npm run build`. Verificação de navegador com API local simulada e CSV: seleção de nível, revisão de fonte existente, importação, seleção de gráficos, bloqueio de seleção vazia, erro de salvamento com nova tentativa, reabertura, prévias renderizadas e tamanhos 320/390/768/1440 px. Não representa nova validação de autorização OAuth ou cobrança em produção.
