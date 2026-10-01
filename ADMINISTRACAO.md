# Administração de clientes

Acesse **Administração** em `https://vision.drivedata.com.br/admin` com uma conta de superadministrador. Se não houver sessão, o link abre o login e mantém o destino administrativo. O endereço anterior `/?view=admin` continua compatível. O painel cadastra empresas, busca e pagina clientes, altera a identificação comercial do plano, suspende/reativa o acesso e exibe as últimas 50 ações administrativas de cada cliente.

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

## Assinaturas online

A página pública oferece DriveVision por **R$ 59,90/mês**, com checkout recorrente de cartão no Asaas. Novos cadastros públicos precisam aceitar os termos, confirmar o e-mail e cadastrar o cartão no checkout para iniciar os sete dias grátis elegíveis. A data da primeira cobrança é apresentada antes da confirmação. Contas existentes e as provisionadas pelo administrador continuam com acesso manual. Alterar o rótulo do plano ou reativar uma conta não substitui a ativação de uma assinatura online.

Após confirmar o e-mail, uma sessão da mesma conta segue automaticamente para Minha assinatura quando ainda não tem acesso, ou para o workspace quando já está liberada. Sem sessão, ou com outra conta aberta, segue para o login. O link de confirmação não autentica silenciosamente outra conta.

Cada cadastro público cria conta, workspace privado e registro de assinatura na mesma transação. As consultas usam a conta autenticada e RLS no schema `drivevision`. Uma aba antiga com sessão trocada em outra aba é impedida de operar sobre a nova conta. O isolamento é lógico, em infraestrutura compartilhada, e não corresponde a um banco ou servidor dedicado por cliente.

O painel apresenta a situação financeira dos cadastros online, períodos pagos, renovações canceladas e confirmações que precisam de atenção. A suspensão administrativa prevalece sobre qualquer pagamento. O operador não visualiza as bases dos clientes.

Consulte [COMERCIAL.md](COMERCIAL.md) para configuração, operação e limites da integração.

## Validação

`npm run test:admin` cobre autorização, isolamento entre clientes, provisionamento atômico, duplicidade, convites, suspensão, reativação, conflitos de revisão, auditoria e paginação. Utiliza contas QA identificadas e remove apenas os registros criados pelo próprio teste.

O painel **E-mails automáticos** mostra os últimos 20 envios, filas e falhas de cadastro, recuperação e assinatura. O próprio cliente pode solicitar um novo link de confirmação ou recuperar a senha pela tela de entrada.
