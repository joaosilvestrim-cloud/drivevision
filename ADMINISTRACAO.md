# Administração de clientes

Acesse **Administração** em `https://vision.drivedata.com.br/admin` com uma conta de superadministrador. Se não houver sessão, o link abre o login e mantém o destino administrativo. O endereço anterior `/?view=admin` continua compatível. O painel cadastra empresas, busca e pagina clientes, altera a identificação comercial do plano, suspende/reativa o acesso e exibe as últimas 50 ações administrativas de cada cliente.

## Jornada do cliente

1. O operador informa empresa, responsável, e-mail e identificação do plano.
2. Escolha **Criar ambiente exclusivo** ou **Compartilhar ambiente existente**. Conta e ambiente (ou vínculo) são criados na mesma transação, sem limite comercial de quantidade de cadastros. A capacidade total continua dependente da infraestrutura.
3. Você pode definir uma senha inicial de 12 a 128 caracteres para entregar o acesso pronto. Se deixar em branco, o painel apresenta um convite de uso único, válido por 72 horas. Compartilhe a senha ou o convite somente com o responsável; não há envio automático.
4. O responsável entra com a senha cadastrada ou define a própria senha pelo convite. No ambiente exclusivo, começa com dados próprios. No compartilhado, acessa e edita os mesmos dados, dashboards, histórico e conexões do responsável do ambiente.

Cada usuário possui um login individual e participa de **um ambiente**, com múltiplos dashboards. Um ambiente pode receber vários usuários. O compartilhamento é concedido apenas no cadastro pelo superadministrador, com permissão de edição; não há troca entre organizações, transferência de usuários existentes ou perfil somente leitura nesta versão. O responsável continua controlando a assinatura do ambiente. A administração gerencia metadados e acesso; não recebe acesso aos datasets dos clientes.

Os novos cadastros administrativos são **cortesias**, sem criar cobrança, assinatura Asaas ou renovação automática. Um usuário compartilhado não pode contratar ou cancelar a assinatura do responsável. O ambiente compartilhado continua sujeito à suspensão e à situação de pagamento do responsável; a cortesia de um novo usuário não altera uma assinatura existente. Suspender apenas o participante bloqueia seu login sem suspender os colegas.

O botão de novo convite aparece apenas para contas ainda não ativadas e invalida o convite anterior. Para definir uma nova senha, use **Definir senha** na linha do cliente. A alteração revoga sessões e links de recuperação anteriores, registra auditoria sem senhas e exige a revisão atual do cadastro. Não altera assinatura nem confirma e-mail pendente. Contas suspensas precisam ser reativadas primeiro; contas de superadministrador são protegidas contra alterações pelo painel. Suspender revoga sessões e impede operações autenticadas e atualizações automáticas, preservando dados. Reativar permite novo login; atualizações vencidas voltam a ser elegíveis no próximo ciclo do agendador. Arquivos já baixados não podem ser revogados.

## Segurança e instalação

- Migração: `npm run db:admin`. Somente o schema privado `drivevision` é alterado. Cadastros existentes são preservados e recebem um registro de cliente.
- Compartilhamento: `npm run db:shared-workspaces`, antes de publicar o código. Adiciona a tabela privada `workspace_members` com RLS, sem alterar os ambientes existentes. O servidor resolve o vínculo da pessoa autenticada e verifica novamente a associação e a suspensão em cada transação de dados. O navegador não escolhe o proprietário das consultas.
- Conceder perfil à conta exata: `npm run account:superadmin -- email-do-operador`. Comando local com credencial administrativa; nenhuma API pública permite promover usuários.
- Atualize a página após a concessão. O servidor consulta o perfil no banco em cada sessão/requisição e exige autorização em todas as rotas administrativas.
- `platform_admins` não aceita INSERT/UPDATE pela credencial da aplicação. `clients` e `admin_audit` têm RLS; roles públicas não têm acesso ao schema.
- Alterações usam revisão para evitar sobrescritas entre operadores. Logs administrativos não contêm senhas nem tokens de convite.
- Contas de operadores não aparecem na listagem comercial nem podem ser suspensas pelo painel.

## Assinaturas online

A página pública oferece DriveVision por **R$ 59,90/mês**, com checkout recorrente de cartão no Asaas. Novos cadastros públicos precisam aceitar os termos, confirmar o e-mail e cadastrar o cartão no checkout para iniciar os sete dias grátis elegíveis. A data da primeira cobrança é apresentada antes da confirmação. Contas existentes e as provisionadas pelo administrador continuam com acesso manual. Alterar o rótulo do plano ou reativar uma conta não substitui a ativação de uma assinatura online.

Após confirmar o e-mail, uma sessão da mesma conta segue automaticamente para Minha assinatura quando ainda não tem acesso, ou para o workspace quando já está liberada. Sem sessão, ou com outra conta aberta, segue para o login. O link de confirmação não autentica silenciosamente outra conta.

Cada cadastro público cria conta, workspace privado e registro de assinatura na mesma transação. As consultas usam a conta autenticada e RLS no schema `drivevision`. Uma aba antiga com sessão trocada em outra aba é impedida de operar sobre a nova conta. O isolamento é lógico, em infraestrutura compartilhada, e não corresponde a um banco ou servidor dedicado por cliente.

O painel apresenta a situação financeira dos cadastros online, períodos pagos, renovações canceladas e confirmações que precisam de atenção. A suspensão administrativa prevalece sobre qualquer pagamento. O operador não visualiza as bases dos clientes.

Consulte [COMERCIAL.md](COMERCIAL.md) para configuração, operação e limites da integração.

## Validação

`npm run test:admin` cobre autorização, isolamento entre clientes, provisionamento atômico, duplicidade, convites, suspensão, reativação, conflitos de revisão, auditoria e paginação. Utiliza contas QA identificadas e remove apenas os registros criados pelo próprio teste.

`npm run test:shared-workspaces` cobre cadastro de cortesia, leitura e edição compartilhadas, conflito entre sessões, isolamento de terceiros, tentativa de vincular a si mesmo, bloqueio de assinatura para participantes e suspensão do responsável e do participante.

O painel **E-mails automáticos** mostra os últimos 20 envios, filas e falhas de cadastro, recuperação e assinatura. O próprio cliente pode solicitar um novo link de confirmação ou recuperar a senha pela tela de entrada.
