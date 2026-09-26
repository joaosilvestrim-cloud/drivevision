# Fontes conectadas — DriveVision

O menu **Conexões** acompanha arquivos do SharePoint, OneDrive e Google Drive, incluindo Google Sheets e drives compartilhados. Cada usuário autoriza sua própria conta e escolhe o conteúdo que será importado. Não é necessário fornecer senha Microsoft ou Google ao DriveVision.

## Fluxo do usuário

1. Entrar na conta DriveVision e abrir **Conexões**.
2. Conectar o provedor e autorizar a leitura na página oficial dele.
3. Navegar pelas bibliotecas/pastas e escolher um arquivo ou **Acompanhar esta pasta**. No SharePoint, começar pelo site e biblioteca.
4. Conferir a prévia e definir aba, linha de cabeçalho, primeira/última coluna e última linha. Deixar a última linha vazia para incluir novos registros nas próximas atualizações. Em pastas, filtrar os nomes dos arquivos.
5. Escolher atualização a cada 15 minutos, hora, 6 horas ou dia. Confirmar a seleção inicia a primeira atualização.
6. Usar **Analisar** para construir dashboards com a fonte conectada. As próximas atualizações preservam o identificador da fonte e os dashboards existentes.

É possível atualizar agora, pausar, retomar, revisar a seleção, consultar as últimas 30 execuções e encerrar o acompanhamento. Desconectar uma conta encerra seus acompanhamentos e remove os tokens armazenados; mantém os dados já importados. Para revogar o consentimento no provedor, usar também o painel de aplicativos autorizados Microsoft/Google.

O agendamento roda no servidor mesmo com o navegador fechado. Um workspace aberto verifica a versão na nuvem a cada minuto enquanto está visível e avisa quando há novos dados; o usuário recarrega sem perder um rascunho inadvertidamente. Atualizações manuais na tela Conexões já recarregam os dados após concluir.

## Ativação na produção

O código e as tabelas não substituem o registro OAuth. Os botões permanecem em **Aguardando configuração** até existirem credenciais do respectivo provedor e a chave de criptografia.

Configurar no projeto Vercel `drive-data/drivevision`, ambiente **Production**, e fazer novo deployment depois de alterar variáveis:

| Variável | Valor/finalidade |
| --- | --- |
| `DRIVEVISION_APP_ORIGIN` | `https://drivevision-theta.vercel.app` |
| `DRIVEVISION_CONNECTOR_KEY` | Chave estável de 32 bytes aleatórios, codificada em Base64 |
| `DRIVEVISION_MICROSOFT_CLIENT_ID` | Application (client) ID do registro Entra |
| `DRIVEVISION_MICROSOFT_CLIENT_SECRET` | **Value** do segredo do registro, não o Secret ID |
| `DRIVEVISION_MICROSOFT_TENANT` | `common` para aplicativo multitenant com contas pessoais; ou o tenant ID do registro restrito à organização |
| `DRIVEVISION_GOOGLE_CLIENT_ID` | Client ID OAuth do tipo aplicação Web |
| `DRIVEVISION_GOOGLE_CLIENT_SECRET` | Client secret desse cliente Google |
| `CRON_SECRET` | Segredo aleatório de pelo menos 32 caracteres para autenticar o agendamento |

Manter as variáveis atuais `DRIVEVISION_DB_*`. Não usar prefixos `VITE_`/`NEXT_PUBLIC_` para segredos. Não enviar a senha administrativa do banco à Vercel. Os dois provedores podem ser habilitados separadamente. Preservar a chave de criptografia: sua troca sem migrar os tokens exige reconectar as contas.

### Microsoft: um registro para SharePoint e OneDrive

No Microsoft Entra, registrar um aplicativo confidencial **Web**, criar o segredo e cadastrar exatamente os dois redirects:

```text
https://drivevision-theta.vercel.app/api/connectors/callback/onedrive
https://drivevision-theta.vercel.app/api/connectors/callback/sharepoint
```

O modo de contas aceitas deve corresponder ao tenant configurado. Para atender clientes de organizações diferentes e OneDrive pessoal, selecionar organizações multitenant e contas pessoais. SharePoint exige conta organizacional com acesso ao site.

Permissões **delegadas Microsoft Graph**: `User.Read`, `Files.Read`, `Files.Read.All`, `Sites.Read.All`, além de `offline_access` para renovação. O OneDrive solicita `Files.Read`; o SharePoint solicita `Files.Read.All` e `Sites.Read.All` para navegar sites e bibliotecas. Respeitar a política de consentimento administrativo de cada organização. Não usar permissões de aplicação nem client credentials para este fluxo.

### Google: cliente Web + Drive API

No Google Cloud, habilitar **Google Drive API**, configurar a tela de consentimento e criar credenciais OAuth de **aplicação Web**. Registrar:

```text
https://drivevision-theta.vercel.app/api/connectors/callback/google
```

O escopo usado é `https://www.googleapis.com/auth/drive.readonly`. Ele permite navegar pastas e ler arquivos existentes; o DriveVision só importa a seleção configurada. É um escopo restrito e a disponibilização pública pode exigir verificação do aplicativo e avaliação de segurança conforme as regras Google. Em modo de teste, adicionar usuários de teste; refresh tokens para aplicativos externos em Testing normalmente expiram em 7 dias. Para uso contínuo por clientes, concluir o processo de publicação/consentimento aplicável.

Para desenvolvimento, registrar também os mesmos callbacks com `http://127.0.0.1:5173` e ajustar `DRIVEVISION_APP_ORIGIN`. Usar registros/segredos próprios de teste quando necessário. Não autorizar callbacks de previews aleatórios sem cadastro.

### Banco e agendamento

A migração `supabase/migrations/20260926133929_drivevision_remote_sources.sql` cria somente tabelas privadas no schema `drivevision`. Para um banco novo, aplicar a estrutura base e de ativação primeiro, depois executar `npm run db:connectors` com as credenciais administrativas locais. É idempotente. O runtime continua usando a role limitada `drivevision_app`.

`vercel.json` agenda `GET /api/cron/sources` a cada minuto. Essa frequência requer plano Vercel que a suporte (Pro/Enterprise); não é compatível com a frequência diária do Hobby. A Vercel envia `Authorization: Bearer CRON_SECRET`. Sem esse segredo o endpoint recusa chamadas e a tela informa que só a atualização manual está disponível. O indicador de configuração não comprova uma execução real: verificar os logs Cron após ativar.

A fila processa até três fontes por invocação, respeitando o orçamento de execução e os intervalos de cada fonte. Os horários são aproximados: fila, limites e indisponibilidade dos provedores podem atrasar a atualização. Há exclusão de execuções simultâneas, timeout e nova tentativa na próxima janela. Não há webhook nem promessa de tempo real.

## Limites e proteção dos dashboards

- Excel (`.xlsx`/`.xls`), CSV UTF-8, TSV e Google Sheets. PDF, Word, imagens, atalhos e listas SharePoint não são fontes tabulares nesta versão.
- Até 10 MB por arquivo, 20 mil registros e 60 colunas na fonte final, respeitando também os limites existentes do importador e workspace.
- Pasta: até 10 arquivos compatíveis, apenas filhos diretos, sem percorrer subpastas. Todos devem ter a mesma aba (Excel/Sheets) e estrutura. A prévia mostra um arquivo de exemplo; a atualização valida o conjunto inteiro antes de gravar.
- O cabeçalho e intervalo ficam fixos até revisão. A última linha pode ser dinâmica. Linhas vazias e cabeçalhos repetidos são tratados pelo importador; totais podem ser ignorados.
- Alteração de colunas/tipos, remoção de arquivo, acesso revogado ou erro de leitura preservam a última versão válida. Revisar a seleção para restaurar a estrutura esperada; para uma estrutura intencionalmente diferente, criar nova fonte e ajustar os dashboards.
- Até 10 contas conectadas e 20 acompanhamentos por usuário. A capacidade atual destina-se a planilhas de pequeno/médio porte; grandes volumes requerem processamento em lotes e armazenamento analítico próprio.
- Tokens OAuth cifrados com AES-256-GCM e vinculados ao proprietário. OAuth com PKCE, estado de uso único, expiração e vínculo à sessão. RLS e verificações de propriedade protegem dados entre usuários. A fila interna contém apenas metadados operacionais.
- Salvar uma versão antiga de um workspace retorna conflito, evitando sobrescrever silenciosamente uma sincronização feita no servidor.

## Validação

`npm run test:connectors` usa respostas controladas dos provedores e contas temporárias isoladas no banco configurado, removidas ao final. Cobre OAuth/PKCE, RLS, criptografia, exportação Sheets/Excel, atualização estável de fonte, mudanças de estrutura, arquivos ausentes, consolidação de pasta, renovação de token, concorrência, SSRF e cron autenticado/pausa. Não substitui a homologação OAuth com uma conta real de cada provedor depois de configurar os aplicativos.

Documentação dos provedores: [Microsoft OAuth/PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [Microsoft Graph: download](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content), [Google OAuth Web Server](https://developers.google.com/identity/protocols/oauth2/web-server), [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Vercel Cron](https://vercel.com/docs/cron-jobs).
