# DriveVision: assinatura mensal

## Jornada publicada

1. Página pública em `/`, com demonstração local, funcionalidades, preço, limites, termos e privacidade.
2. Cadastro em `/?view=signup`: conta privada, aceite registrado dos termos e acesso ao pagamento. Criar conta não concede uso do workspace.
3. Checkout hospedado no Asaas: **R$ 59,90**, cartão, recorrência mensal. O servidor define o preço; não aceita preço, cliente ou assinatura enviados pelo navegador.
4. Confirmação: webhook autenticado alimenta uma fila idempotente. O worker consulta o estado vigente no Asaas e libera o período confirmado. O retorno do navegador não comprova pagamento.
5. `/?view=billing`: situação, vencimento do acesso, cobranças, atualização manual e cancelamento da renovação. O período pago continua válido após cancelar; estorno/contestação retiram a elegibilidade da cobrança.

## Instalação e credenciais

- Execute `npm run db:billing` com a credencial administrativa local. Apenas o schema privado `drivevision` é alterado.
- Configuração pelo endpoint **POST `/api/admin/billing`**, com sessão superadmin e origem válida: `{apiKey,webhookToken,environment:"production"}`. Os segredos são criptografados com AES-256-GCM e `DRIVEVISION_CONNECTOR_KEY` em `platform_settings`. Nunca são devolvidos pela API. Preservar essa chave e seu backup é essencial para conexões e pagamentos.
- Alternativa de configuração: `DRIVEVISION_ASAAS_API_KEY`, `DRIVEVISION_ASAAS_WEBHOOK_TOKEN`, `DRIVEVISION_ASAAS_ENV=production` exclusivamente no servidor. Quando presentes, têm prioridade sobre o registro criptografado. Não usar prefixo `VITE_`/`NEXT_PUBLIC_`.
- `DRIVEVISION_APP_ORIGIN=https://vision.drivedata.com.br` permanece como origem autorizada. `CRON_SECRET` autentica o worker existente, a cada minuto.
- Webhook Asaas: **`https://vision.drivedata.com.br/api/webhooks/asaas`**, API v3, envio sequencial, token de autenticação igual ao configurado. Validado pelo cabeçalho `asaas-access-token`; não é assinatura HMAC.
- Eventos: checkout criado/pago/cancelado/expirado; cobrança criada/atualizada/confirmada/recebida/vencida/estornada/removida/restaurada/contestada; assinatura criada/atualizada/removida/inativada. Conferir eventos suportados no Asaas ao configurar.
- O Asaas desta empresa também atende outra aplicação. Alterar somente o webhook identificado como DriveVision. Eventos de outras assinaturas não liberam contas aqui.

## Consistência e operação

- A intenção de criar checkout é persistida antes da chamada remota. Cliques concorrentes reutilizam o checkout ou aguardam o resultado. Se a resposta se perder, o evento `CHECKOUT_CREATED` recupera a referência; não se tenta criar outra sessão enquanto a intenção ainda estiver válida.
- Cada conta tem um identificador de assinatura único. O vínculo inicial vem das cobranças do checkout criado para aquele proprietário. Nunca se vincula por e-mail, CPF ou parâmetro de URL.
- A liberação exige cobrança de 5.990 centavos, assinatura mensal e estado confirmado/recebido. O período termina um mês de calendário após o vencimento, às 00h de Brasília, com ajuste para meses curtos.
- Eventos duplicados têm a mesma chave e não estendem o acesso. Eventos fora de ordem consultam o estado atual no provedor. Falhas ficam pendentes para nova tentativa e visíveis no painel administrativo.
- A conciliação periódica recupera notificações perdidas. Cadastros sem checkout não geram consultas financeiras recorrentes. São processados lotes limitados por execução; monitorar backlog antes de ampliar o volume de clientes.
- Cancelar utiliza `DELETE /subscriptions/{id}`. Segundo o Asaas, isso remove futuras cobranças e cobranças pendentes/vencidas, mantendo as pagas. Checkouts ainda abertos também são cancelados.
- RLS e autorização do servidor bloqueiam o workspace fora do período pago. O login e a área de assinatura continuam acessíveis. A suspensão administrativa nunca é desfeita pelo webhook. Atualizações de fontes de contas sem período pago são ignoradas.
- O banco guarda somente identificadores e metadados financeiros necessários; não guarda número completo de cartão/CVV nem payload financeiro integral dos eventos.
- Reembolso, recuperação de senha e exclusão de conta são atendidos pelo suporte informado na interface; não existe automação de e-mail, estorno ou emissão fiscal nesta entrega. Não confundir recibo da cobrança com nota fiscal.
- A página descreve um responsável por conta. Não oferece equipes multiusuário, Google Drive ativo, IA universal ou processamento ilimitado.

## Validação

`npm run test:billing` usa respostas controladas do Asaas e contas QA no schema privado para testar preço fixo, aceite, bloqueio, isolamento, duplicidade, perda de resposta, webhook, estorno, cancelamento e expiração. O checkout real pode ser criado e cancelado sem inserir cartão; isso não substitui uma transação paga de ponta a ponta.

Referências: [Checkout recorrente](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente), [redirecionamento](https://docs.asaas.com/docs/link-do-checkout-e-redirecionamento-do-cliente), [remoção de assinatura](https://docs.asaas.com/reference/remover-assinatura).
