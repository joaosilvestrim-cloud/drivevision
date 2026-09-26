# DriveVision na Vercel

Importe `joaosilvestrim-cloud/drivevision`, branch `main`, raiz `./`. O `vercel.json` define Vite, `npm ci`, `npm run build`, saída `dist-preview` e a função Node em `api/[...path].ts`. Use Node 24.x.

## Banco de dados

A estrutura já foi criada no banco autorizado, exclusivamente no schema `drivevision`. O runtime usa a role `drivevision_app`, separada de `postgres`. As credenciais administrativas não são usadas pela aplicação e não devem ser cadastradas na Vercel.

Cadastre em Environment Variables (Production e Preview, conforme necessário):

| Variável | Valor |
| --- | --- |
| `DRIVEVISION_DB_HOST` | Host exato de **Supabase → Connect → Transaction pooler** |
| `DRIVEVISION_DB_PORT` | `6543` |
| `DRIVEVISION_DB_DATABASE` | `postgres` |
| `DRIVEVISION_DB_USER` | `drivevision_app.` seguido do project ref do banco |
| `DRIVEVISION_DB_PASSWORD` | Senha da role `drivevision_app`, gerada durante o setup e salva no `.env.local` desta máquina |
| `DRIVEVISION_APP_ORIGIN` | Opcional: URL pública exata, como `https://seu-projeto.vercel.app`. Se não definir, as mutações exigem Origin com o mesmo host da requisição. |
| `DRIVEVISION_ALLOW_REGISTRATION` | Opcional: `false` desativa novos cadastros |

Também é aceita `DRIVEVISION_DATABASE_URL` no servidor; caracteres especiais da senha devem ser percent-encoded. Nunca use prefixos `VITE_` ou `NEXT_PUBLIC_` para credenciais. O certificado CA do Supabase está incluído e a verificação SSL permanece habilitada. Um banco futuro com outra CA pode usar `DRIVEVISION_DB_CA`.

O host direto fornecido funciona nesta máquina por IPv6. Para funções serverless use o **Transaction pooler**, conforme a [documentação do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres). O host do pooler precisa ser copiado do projeto, não deduzido da região.

Depois de configurar as variáveis, faça um redeploy. A conexão com o banco em produção só está confirmada após testar cadastro/login, importar, salvar e reabrir um painel nessa URL. A configuração local validada não substitui esse teste.

## Modos de uso

- **Local:** funciona sem conta; IndexedDB separado por navegador e domínio.
- **Conta:** fontes, transformações e dashboards são salvos no PostgreSQL e podem ser reabertos em outros dispositivos.
- Em **Minha conta → Trazer análises deste navegador**, o usuário revisa as quantidades e confirma a cópia para a conta. Os itens já existentes são mantidos.

A interpretação de planilhas ocorre no navegador. No modo conta, o resultado organizado é enviado ao backend ao confirmar. Não há IA generativa ou serviço externo de IA.

## Executar e validar

```sh
npm ci
npm test
npm run build
npm run dev
```

`npm start` serve o bundle pronto na porta 4173, incluindo a API local. `npm run test:server` usa `.env.local`, cria duas contas fictícias temporárias no schema DriveVision, verifica isolamento e persistência e remove somente essas contas ao terminar.

## Estrutura e migração futura

Veja [Banco de dados](BANCO-DE-DADOS.md). O setup é manual, nunca executado durante build/deploy. Não execute `supabase db reset` nem aplique migrações globais no projeto compartilhado.

Esta entrega inclui configuração e código; não afirma que um deployment da Vercel já foi concluído. Referência: [configuração da Vercel](https://vercel.com/docs/project-configuration).
