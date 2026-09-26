# Banco do DriveVision

## Isolamento

Foi criado apenas o schema `drivevision` e a role de runtime `drivevision_app`. Não foram alterados objetos nos schemas `public`, `licita`, `auth`, `storage` ou nos demais schemas existentes. O setup comparou a impressão SHA-256 das definições de colunas externas antes e depois; o resultado foi igual. Essa checagem cobre definições de colunas, não é um teste funcional da outra aplicação.

Tabelas próprias:

- `accounts`: contas independentes da autenticação da aplicação existente; senha com scrypt e salt.
- `sessions`: hashes de tokens, expiração e revogação no logout.
- `workspaces`: workspace privado por conta e número de revisão para evitar sobrescritas concorrentes.
- `sources`: fontes importadas em JSONB, preservando estrutura e registros.
- `dashboards`: configuração, visuais, transformações, filtros e recortes em JSONB.
- `rate_limits`: limites de tentativas por origem e identificador com hashes.
- `schema_migrations`: histórico exclusivo do DriveVision.

A API usa SQL parametrizado, transações e a role específica. A role não pode criar objetos no schema. `anon` e `authenticated` não têm acesso ao schema. RLS restringe workspaces, fontes e dashboards pelo usuário definido localmente em cada transação. Tabelas de autenticação são acessíveis somente ao servidor; nenhuma senha ou token de banco entra no cliente.

A role tem limite de 10 conexões; cada instância da aplicação mantém no máximo três. Para Vercel configure o Transaction pooler. Cookies de sessão são HttpOnly/SameSite e Secure na Vercel. Mutações verificam Origin. Sessões duram sete dias e são revogadas no logout.

## Configuração administrativa

O `.env.local`, ignorado pelo Git, contém credenciais locais. `DRIVEVISION_DB_ADMIN_*` é usado apenas por `npm run db:setup` e pelos testes de integração. O backend recusa usar `postgres` como usuário de runtime.

`npm run db:setup` executa apenas a migração inicial específica do DriveVision, dentro de uma transação. Recusa prosseguir se o schema ou a role já existirem. Não rode novamente no banco atual. O registro fica em `drivevision.schema_migrations`; o histórico de migrações da outra aplicação não é alterado.

O certificado público incluído foi obtido em `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`. Ele não contém chave privada.

## Mudar de banco depois

1. Faça backup apenas do schema `drivevision` com `pg_dump --schema=drivevision --no-owner --no-acl` usando uma conexão administrativa autorizada.
2. No destino vazio, crie a role `drivevision_app` e restaure o schema/dados. Reaplique os grants e políticas definidos na migração, sem executar novamente os comandos CREATE TABLE em objetos restaurados.
3. Ajuste host, usuário, senha e CA da API. Revogue as sessões anteriores no schema DriveVision se desejar exigir novo login.
4. Confira a contagem de contas, fontes e dashboards, e teste login, gravação e isolamento antes de mudar o tráfego.
5. Preserve o banco antigo até concluir a conferência. Não remova a estrutura da outra aplicação.

## Limites desta versão

Um workspace por conta; até 50 fontes, sem limite fixo de quantidade de dashboards, até 50 MB de JSON e 3,5 MB compactados por workspace. Transferência usa gzip para caber no limite de funções serverless. Não há coedição em tempo real: uma gravação concorrente retorna conflito e preserva o rascunho atual na tela.

Autenticação própria inicial, sem verificação de e-mail, recuperação de senha, MFA, convites, equipes ou cobrança. O e-mail funciona como identificador de login, não como identidade verificada. Esses fluxos precisam evoluir antes de uma oferta pública com requisitos completos de administração de contas.

A aplicação não usa a API Auth do Supabase da outra aplicação. Os testes automatizados de servidor cobrem persistência, senhas, cookies, bloqueio de origens externas, sessões, concorrência, referências inválidas, privilégios e isolamento entre contas.


Ativação de contas: execute `npm run db:activation` para conceder ao servidor apenas UPDATE na coluna `drivevision.accounts.password_hash`. Veja `AREA-DE-TRABALHO-E-ACESSO.md`.
