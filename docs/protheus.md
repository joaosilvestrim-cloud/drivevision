# Protheus Financeiro — contrato do conector piloto

Status: implementado com testes de contrato e integração no DriveVision. Não homologado em uma instalação real de Protheus. Não anunciar compatibilidade universal ou certificação TOTVS.

## Entrega ao cliente

Conexões → Protheus → informar REST, empresa/filial e usuário de consulta → conferir títulos e quatro totais → confirmar moeda/regras → importar → abrir painel financeiro editável. A importação inicial cria o painel; atualizações substituem a fonte e preservam as configurações dos gráficos. As credenciais pertencem ao ambiente, inclusive para usuários autorizados de um ambiente compartilhado.

Escopo v1: títulos SE1/SE2 com saldo positivo, moeda 1, tipos explicitamente escolhidos (padrão NF e DP), vencimento real entre os últimos 30/90/365 dias e os próximos 30 dias. RA, PA, NCC e NDF não são aceitos. Uma conexão representa um grupo de empresas e uma filial; tabelas compartilhadas com filial vazia são identificadas. Pessoas e naturezas são códigos, sem joins que multipliquem valores. Confirme que moeda 1 é BRL.

Indicadores: A receber, A pagar, Recebimentos vencidos e Pagamentos vencidos. Vencidos considera a data da extração em America/Sao_Paulo; não se recalcula em tempo real no navegador. Todos os valores são saldos dos títulos selecionados, não caixa realizado, DRE, lucro nem todo o passivo/ativo da empresa. O vencimento define o recorte e títulos fora dele não entram.

### Leitura financeira e conferência

O estúdio apresenta uma leitura da fonte completa, independente dos filtros e transformações do editor de gráficos. Não altera dashboards existentes. Cada indicador abre os títulos correspondentes, ordenados por vencimento, com busca por título/pessoa/loja/natureza/empresa/filial, filtro de pagar/receber, paginação de 25 linhas e exportação CSV de todos os resultados filtrados. Valores são somados em centavos; dados incompatíveis não são silenciosamente omitidos.

A agenda inclui o dia da extração e os seis dias seguintes. Faixas de atraso (1–7, 8–30, 31–60 e mais de 60 dias) separam os saldos a pagar e receber. Nenhuma dessas leituras pretende reconstruir pagamentos realizados. O limite de vencimentos da fonte também limita os atrasos visíveis.

Conferir com o ERP permite informar quatro totais e comparar diferenças exatas em centavos. Não consulta automaticamente um relatório do ERP. Valores digitados são temporários; o cliente pode baixar um relatório com escopo, data da extração e data da conferência. Fechar a janela descarta os valores digitados.

O estado da conexão é consultado a cada minuto com a página visível. Falha, pausa, falta de agendamento, execução atrasada e carga com mais de 26 horas são mostradas no próprio painel, com acesso à gestão da atualização. Falha na consulta de estado aparece como situação desconhecida, nunca como atualização bem-sucedida. Alertas são visuais dentro da aplicação; não há envio de e-mail implementado nesta versão.

Compatibilidade em produção: esta evolução não faz migrações nem regrava fontes ou configurações. A leitura aparece apenas para fontes Protheus e funciona com as fontes da versão anterior. Conta Azul, Omie e planilhas mantêm o fluxo atual.

## Arquitetura e segurança

- Navegador → rotas autenticadas `/api/connectors/protheus/{connect,preview,watch}` → adaptador no servidor → Protheus HTTPS.
- O proprietário do ambiente é resolvido no servidor. Todas as consultas locais usam transaction(owner), RLS forçada e validação do membro autenticado. Credenciais e cache usam AES-256-GCM com AAD do proprietário.
- Token obtido a cada extração por POST `/api/oauth2/v1/token?grant_type=password`, credenciais em headers. Não é criado um OAuth de autorização fictício. Bearer existe apenas durante a extração; não é entregue ao navegador. Não precisa configurar uma chave por cliente na Vercel.
- GET `/api/framework/v1/genericQuery`: tabelas/projeções fixas, paginação de 100, ordem determinística, filtro de filial e exclusão lógica ativos. Usuário não envia SQL, FROM ou JOIN.
- Base URL aceita apenas HTTPS, domínio e caminho simples. DNS IPv4 deve ser público. O endereço validado é fixado na conexão TLS para evitar rebinding; Host/SNI e validação de certificado são mantidos. IP literal, redes privadas/especiais, URL com credenciais, redirecionamento e resposta excessiva são rejeitados. Rede privada/IPv6-only não é suportada nesta versão; nunca exponha o banco para contornar isso.
- Erros do fornecedor não são reproduzidos nem registrados com credenciais. Validação distingue autenticação, endpoint inexistente, permissão, rede, volume e dados inconsistentes.

## Consistência, limites e atualização

- V1 usa extração completa de uma janela limitada, não incremental. Limite conjunto de 5.000 títulos, páginas de até 100, no máximo 50 páginas por tabela, 2 MB por resposta e prazo global de 55 s. Não há sucesso parcial.
- Números monetários são validados e somados em centavos. Campos ausentes/protegidos, moeda ou filial inesperada, datas inválidas, duplicações e variações nas contagens durante a paginação impedem publicação.
- A GenericQuery não fornece snapshot transacional entre páginas/tabelas. Mudanças de valores com contagem estável durante a extração não podem ser detectadas integralmente. Agendar fora do pico e reconciliar com o ERP; consistência transacional forte exigiria API/extração própria do ERP.
- A prévia contém amostra, contagem, quatro totais, período, horário e impressão digital. A confirmação envia essa impressão digital; se os dados consultados mudarem, recebe 409 e deve ser refeita. Cache criptografado de 65 segundos evita repetir consultas ao confirmar.
- A atualização usa o agendador/lease existente do DriveVision; uma transação publica fonte, painel inicial, histórico e revisão. Erro preserva a última versão. A tela mostra falha/última atualização. Resultado vazio em uma atualização válida limpa os saldos antigos; primeira importação vazia não cria painel.
- Alterar host, grupo, filial ou usuário exige nova conexão para evitar trocar silenciosamente a origem de painéis. Rotação de senha preserva a identidade da origem.

## Pré-requisitos do piloto

1. REST Protheus com SECURITY=1, certificado confiável e acesso de rede ao serviço; não ao banco.
2. APIs Token e GenericQuery, campos padrão selecionados em SE1/SE2 e paginação com hasNext/remainingRecords. remainingRecords requer LIB compatível (documentado a partir de 20220502 no FWAdapterBaseV2).
3. Usuário dedicado de consulta com permissões mínimas e acesso ao grupo/filial. Validar regras MFA do ambiente.
4. Validar licenciamento com o administrador TOTVS, moeda e tipos de título, compartilhamento de filiais e campos customizados.
5. Comparar totais com relatório Protheus usando exatamente os mesmos filtros. Testar parcela paga parcialmente, vencida, quitada, excluída, crédito/adiantamento, moeda diferente, mais de uma página e retirada de permissão.
6. Testar atualização diária, interrupção/retomada e ausência de mistura entre clientes com dois ambientes.

## Operação e validação

`npm run db:protheus`: migração idempotente restrita à constraint de provedores no schema privado drivevision; não altera outras aplicações.

`npm run test:protheus`: contrato do adaptador e fluxo HTTP autenticado com contas QA isoladas no banco configurado. O transporte Protheus é simulado, sem contato com ERP real. As contas QA são removidas no finally. Requer .env.local do ambiente de teste e credencial administrativa para criar/remover apenas os fixtures.

`npm run build` e `npm run test:i18n`: compilação e cobertura das mensagens estáticas PT/EN/ES.

A evolução para alto volume exige jobs com checkpoint, armazenamento analítico fora do payload do workspace e extração incremental com cursor/registro de alterações fornecidos pelo ERP. Não presumir que data de emissão captura baixas, exclusões ou alterações antigas. Agente local para rede privada, nomes de pessoas, consolidação multiempresa, vendas/estoque e contabilidade são fases futuras.

## Fontes oficiais

- https://tdn.totvs.com/display/framework/GenericQuery
- https://tdn.totvs.com/pages/viewpage.action?pageId=465383509
- https://tdn.totvs.com/display/framework/09.%2BFWAdapterBaseV2
- https://tdn.totvs.com/pages/viewpage.action?pageId=502457209
- https://centraldeatendimento.totvs.com/hc/pt-br/articles/360018606751-Cross-Segmento-TOTVS-Backoffice-Linha-Protheus-ADVPL-Consumo-de-Licen%C3%A7a-Webservice-EAI-e-SCHEDULE
