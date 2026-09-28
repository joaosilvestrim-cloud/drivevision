# Administração de clientes

Acesse **Administração** com uma conta de superadministrador. O painel cadastra empresas, busca e pagina clientes, altera a identificação comercial do plano, suspende/reativa o acesso e exibe as últimas 50 ações administrativas de cada cliente.

## Jornada do cliente

1. O operador informa empresa, responsável, e-mail e identificação do plano.
2. Conta e workspace são criados na mesma transação, sem limite comercial de quantidade de clientes no cadastro. A capacidade total continua dependente da infraestrutura.
3. O painel apresenta um convite de uso único, válido por 72 horas. Compartilhe-o com o responsável; não há envio de e-mail automático.
4. O responsável define a própria senha. Bases, dashboards, histórico e conexões pertencem exclusivamente àquela conta.

Nesta versão cada cliente possui **um responsável e um workspace**, com múltiplos dashboards. Equipes com vários usuários por cliente, papéis internos e troca entre organizações ainda não estão implementados. A administração gerencia metadados e acesso; não recebe acesso aos datasets de outros clientes.

O botão de novo convite aparece apenas para contas ainda não ativadas e invalida o convite anterior. Não redefine senhas de contas já ativadas. Suspender revoga sessões e impede operações autenticadas e atualizações automáticas, preservando dados. Reativar permite novo login; atualizações vencidas voltam a ser elegíveis no próximo ciclo do agendador. Arquivos já baixados não podem ser revogados.

## Segurança e instalação

- Migração: `npm run db:admin`. Somente o schema privado `drivevision` é alterado. Cadastros existentes são preservados e recebem um registro de cliente.
- Conceder perfil à conta exata: `npm run account:superadmin -- email-do-operador`. Comando local com credencial administrativa; nenhuma API pública permite promover usuários.
- Atualize a página após a concessão. O servidor consulta o perfil no banco em cada sessão/requisição e exige autorização em todas as rotas administrativas.
- `platform_admins` não aceita INSERT/UPDATE pela credencial da aplicação. `clients` e `admin_audit` têm RLS; roles públicas não têm acesso ao schema.
- Alterações usam revisão para evitar sobrescritas entre operadores. Logs administrativos não contêm senhas nem tokens de convite.
- Contas de operadores não aparecem na listagem comercial nem podem ser suspensas pelo painel.

## Cobrança futura

O controle de acesso é **manual**. Os campos privados `billing_provider`, `billing_customer_id` e `billing_subscription_id` permitem vincular o cliente ao Asaas posteriormente. A aplicação ainda não cria cobranças nem interpreta o nome do plano como preço, limites ou assinatura.

Antes de automatizar a liberação, implementar webhooks autenticados, eventos idempotentes e ordenação por estado vigente, política de vencimento/carência e conciliação. Não liberar contas com base em um redirecionamento do navegador. Credenciais do Asaas permanecem no servidor.

## Validação

`npm run test:admin` cobre autorização, isolamento entre clientes, provisionamento atômico, duplicidade, convites, suspensão, reativação, conflitos de revisão, auditoria e paginação. Utiliza contas QA identificadas e remove apenas os registros criados pelo próprio teste.
