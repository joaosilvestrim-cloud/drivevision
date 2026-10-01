# DriveVision: assinatura mensal

## Jornada publicada

1. Página pública em `/`, com demonstração local, funcionalidades, preço, limites, termos e privacidade.
2. Cadastro em `/?view=signup`: conta privada, aceite registrado dos termos e confirmação do e-mail antes do pagamento. Criar conta não concede uso do workspace.
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
- Recuperação de senha e confirmação de e-mail são automáticas pelo Resend. Reembolso e exclusão de conta são atendidos pelo suporte; não há estorno automático nem emissão fiscal. Não confundir recibo da cobrança com nota fiscal.
- A página descreve um responsável por conta. Não oferece equipes multiusuário, Google Drive ativo, IA universal ou processamento ilimitado.

## Validação

`npm run test:billing` usa respostas controladas do Asaas e contas QA no schema privado para testar preço fixo, aceite, bloqueio, isolamento, duplicidade, perda de resposta, webhook, estorno, cancelamento e expiração. O checkout real pode ser criado e cancelado sem inserir cartão; isso não substitui uma transação paga de ponta a ponta.

Referências: [Checkout recorrente](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente), [redirecionamento](https://docs.asaas.com/docs/link-do-checkout-e-redirecionamento-do-cliente), [remoção de assinatura](https://docs.asaas.com/reference/remover-assinatura).

## E-mails transacionais

- Execute `npm run db:email` após a migração comercial. Contas existentes continuam confirmadas; novos cadastros públicos precisam confirmar o e-mail.
- Configure **POST `/api/admin/email`** com sessão superadmin, origem válida e `{apiKey}`. O segredo fica criptografado no banco privado, usando a mesma chave protegida dos conectores. Alternativa: `DRIVEVISION_RESEND_API_KEY` no servidor. Remetente e resposta: `DriveVision <suporte@drivedata.com.br>`, domínio verificado no Resend.
- Confirmação vale 24 horas; recuperação vale 30 minutos. Links carregam o token no fragmento, removido da barra de endereço. A confirmação exige ação explícita; leitores automáticos de e-mail não consomem o link. O banco guarda somente o hash do token; o conteúdo pendente fica criptografado e é eliminado após envio/falha definitiva.
- A troca de senha encerra todas as sessões anteriores. Recuperação não informa se o endereço tem conta. Há limites por IP/endereço e reenvio de confirmação com intervalo mínimo.
- Fila persistente com tentativas limitadas e chave idempotente estável no Resend. O cron existente processa os e-mails a cada minuto. Confirmação inicial/reenvio também tentam entrega imediata. Falhas permanecem visíveis na administração.
- Pagamento confirmado, pendência vencida e cancelamento solicitado pelo cliente geram avisos sem duplicação por período/evento. Não são mensagens de marketing.
- O painel distingue aceitação pelo serviço de entrega efetiva. `npm run test:email` valida confirmação, expiração, repetição, recuperação, revogação de sessões, fila e isolamento administrativo usando respostas controladas, sem envios reais.


## Teste gratuito e atendimento (30/09/2026)

- Novas contas desta versão recebem elegibilidade para um teste único de 7 dias de calendário, com primeira cobrança em data fixa de Brasília. Contas antigas e planos manuais são preservados.
- O checkout exige aceite explícito de renovação por R$ 59,90/mês e guarda a data da primeira cobrança. O Asaas hospeda o cadastro do cartão; não coletamos cartão/CVV.
- A liberação do teste exige consulta autenticada da assinatura Asaas ativa, tipo CREDIT_CARD, valor e ciclo corretos, checkoutSession correspondente e cobrança pendente na data prevista. O callback do navegador não libera acesso.
- O prazo fica separado de paid_until. Cancelar preserva o teste já concedido, interrompe cobranças futuras e não concede outro teste. A expiração é aplicada em API, RLS e agendador.
- Migração adicional: npm run db:support-trial. Validação: npm run test:billing e npm run test:support.
- Ajuda e contato disponível em todas as telas: assistente baseado em guias locais, guias por assunto, formulário público e histórico privado para compradores. Não é um modelo generativo e não consulta arquivos do cliente.
- Chamados e mensagens de compradores notificam tamirescavani@drivedata.com e joaosilvestrim@drivedata.com via outbox Resend, uma entrega idempotente por destinatário. Falhas são repetidas e aparecem no detalhe administrativo. Estado enviado significa aceitação pelo provedor, não comprova leitura.
- Administradores respondem no histórico privado do comprador. Para visitantes, o painel apresenta o e-mail de retorno; o visitante não recebe acesso ao histórico por um protocolo público. Sem anexos; não solicitar planilhas ou credenciais pelo suporte.
- Google Drive e APIs externas aparecem Em breve. Novas autorizações Google estão bloqueadas também no servidor. Conexões Microsoft permanecem disponíveis.
