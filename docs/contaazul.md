# Conta Azul no DriveVision

## Configuração de produção

Cadastre um aplicativo de produção próprio no portal Conta Azul e use exatamente:

`https://vision.drivedata.com.br/api/connectors/callback/contaazul`

Configure somente no servidor/Vercel Production:

- `DRIVEVISION_CONTAAZUL_CLIENT_ID`
- `DRIVEVISION_CONTAAZUL_CLIENT_SECRET`

Reutiliza `DRIVEVISION_CONNECTOR_KEY`, `DRIVEVISION_APP_ORIGIN` e `CRON_SECRET` existentes. Não substitua a chave de criptografia: ela também protege as conexões anteriores. Não exige novas variáveis por cliente.

Execute `npm run db:contaazul` antes da publicação. A migração modifica exclusivamente o schema privado `drivevision`. As tabelas de outras aplicações são preservadas. Após alterar variáveis na Vercel, publique novamente.

## Jornada

Conexões → Conta Azul → nome da empresa → autorização no ERP → seleção do período e horário → progresso → painel financeiro editável. Conta Azul Pro autoriza cada empresa individualmente. O estado OAuth é aleatório, expira em dez minutos, está vinculado ao proprietário e à sessão e é consumido uma única vez. O cliente deve iniciar no botão do produto, não usar um link estático com `state=ESTADO`.

## Dados e limites desta versão

- Consulta somente contas a pagar e receber. Não escreve no ERP.
- 30, 90 ou 365 dias passados, mais os próximos 30 dias, por **vencimento** e horário de Brasília.
- Uma linha por parcela, identificada por tipo e ID externo; cada fonte pertence a uma conexão e proprietário.
- Recebido/pago são valores acumulados nas parcelas selecionadas, não movimentações pela data do pagamento. Não produz DRE, lucro ou saldo bancário presumidos.
- Parcelas canceladas, renegociadas e perdidas ficam identificadas na base, com métricas zeradas.
- Até 20 mil parcelas. Resposta incompatível, valores ausentes, duplicações ou paginação incompleta interrompem a carga; nenhum resultado parcial substitui a fonte anterior.
- Uma seleção financeira por empresa conectada; alterar a seleção mantém o ID da fonte e os dashboards.
- Reconsulta integral diária do período: **não usa CDC incremental nesta versão**. Isso reconcilia mudanças de vencimento e cancelamentos dentro da janela selecionada. Cada lote mantém seu checkpoint; quatro páginas por execução; a fila existente continua a cada minuto enquanto pendente.
- A API não oferece snapshot transacional entre páginas. Mudança na contagem durante a leitura é recusada; demais alterações concorrentes podem aparecer na atualização seguinte.
- Os checkpoints são cifrados com AES-GCM e vinculados ao proprietário, protegidos por RLS forçada. São removidos ao concluir, reiniciar, desconectar ou apagar a conta. Nenhum histórico ilimitado de payloads brutos é criado.
- Renovação de tokens serializada por bloqueio da conexão. Execuções da mesma fonte usam lease; uma seleção nova invalida publicações antigas. Credenciais e erros brutos do fornecedor não são enviados ao navegador.
- Pausar interrompe o cron; atualização manual é explícita. Desconectar remove credenciais e tarefas; os dados já importados continuam no workspace até o cliente removê-los.

## Validação

`npm run test:contaazul`: OAuth por HTTP, CSRF, estado de uso único, isolamento entre proprietários, criptografia, RLS dos checkpoints, carga retomável, falha sem publicação parcial, painel inicial, renovação, concorrência, agendamento, pausa e desconexão. Usa banco real com contas QA isoladas e respostas simuladas do fornecedor, removidas ao final. `--browser` mantém uma conta QA temporária para revisão visual.

A validação com uma empresa real depende da autorização do titular no ERP. Testes simulados não comprovam importação produtiva.

Referências: https://developers.contaazul.com/authorize-multiple-clients ; https://developers.contaazul.com/changecode ; https://developers.contaazul.com/faq
