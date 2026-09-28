# Cargas recorrentes, combinações e histórico

## Fluxo do cliente

Em **Dados → Importar planilha**, selecione Excel/CSV, confirme a estrutura e escolha o destino. Uma base existente aceita:

- **Acrescentar operações novas**: chaves já existentes e idênticas são ignoradas; valores diferentes bloqueiam a carga e orientam usar atualização.
- **Atualizar por identificador**: inclui novas chaves e substitui os valores das existentes. Chaves compostas são permitidas, sem conversão ou normalização implícita.
- **Substituir um período**: exige data, início, fim e confirmação explícita. Preserva registros fora do período; remove apenas as chaves ausentes dentro dele. Datas inválidas, chaves fora do período e linhas recebidas fora do intervalo bloqueiam a publicação.

Identificadores vazios, chaves repetidas na base atual e registros conflitantes no arquivo bloqueiam a carga. Repetições idênticas dentro do arquivo são contadas e ignoradas. A prévia informa inclusões, alterações, registros existentes, remoções e repetições. Não há inferência de duplicidade por nome, valor ou data. O cliente deve escolher a chave de negócio adequada. Conteúdo idêntico a uma base existente orienta atualizar essa base em vez de criar outra.

## Combinações atualizadas

Novas combinações guardam as origens e regras de ligação. Uma alteração recalcula todas as dependências, inclusive combinações de combinações, preservando IDs e nomes de colunas. O servidor também recalcula: não confia nas linhas derivadas enviadas pelo navegador. Ciclos, origem ausente, mudança de estrutura e chave ambígua na segunda base impedem a publicação inteira.

Combinações criadas antes desta entrega continuam como cópias estáticas: não há metadados suficientes para reconstruir suas regras com segurança. Recrie-as em **Combinar bases** para estabelecer atualização automática. Etapas de preparação de um dashboard continuam pertencendo àquele dashboard; não são aplicadas implicitamente à base usada por outros painéis.

## Histórico e retenção

Em **Dados → Histórico**, contas autenticadas podem consultar versões, exportar os registros em CSV e restaurar uma origem. A restauração recalcula dependências, registra uma nova versão quando o conteúdo muda e pausa a atualização automática daquela origem para evitar sobrescrita imediata. A retomada ocorre em **Conexões**. Uma combinação é restaurada pelas suas origens.

As versões guardam os **dados organizados**, não o arquivo Excel original. Cargas anteriores à instalação não são reconstruídas: na primeira mudança, a versão anterior é preservada como ponto inicial. Alterações sem mudança no conteúdo não criam cópias adicionais.

Retenção operacional inicial: **até 20 versões por base e 50 MB compactados por conta**, com descarte das mais antigas na próxima publicação. Não representa retenção temporal de 12/24 meses nem auditoria imutável. A base atual não é descartada por esse limite. A contagem de diferenças compara linhas completas; uma linha corrigida aparece como retirada + inclusão no histórico.

O cliente pode excluir o histórico de uma base com confirmação, preservando os dados atuais. Excluir a base remove suas versões no banco ativo por chave estrangeira. Futuras alterações geram novas versões. Retenção de backups, contratos, bases legais, canal de direitos e política de encerramento continuam exigindo definição operacional; esta funcionalidade não certifica conformidade integral com a LGPD.

## Banco e implantação

Migração aditiva `20260928143942_drivevision_source_history.sql`, somente no schema `drivevision`. Tabela privada com RLS habilitada e forçada; `anon` e `authenticated` não recebem acesso. O servidor usa a identidade da sessão e bloqueio do workspace. Dados, dependências, histórico e revisão são publicados na mesma transação. Restauração e exclusão de histórico exigem a revisão atual, protegendo contra abas desatualizadas.

O script `scripts/setup-source-history.mjs` usa a CLI Supabase indicada em `SUPABASE_CLI`, lê credenciais apenas do ambiente local e aplica o SQL numa transação. Não executar reset, db push ou migrações de outros schemas no banco compartilhado.

Limites existentes continuam: 10 MB por arquivo local, 20 mil registros por base, 50 bases por workspace e 3,5 MB compactados por transferência do workspace. São limites desta implementação, não franquias comerciais aprovadas.

Conectores de arquivos mantêm as credenciais OAuth e `CRON_SECRET` como requisitos de ativação. Não foi adicionado conector ERP nem credencial fictícia de produção. O agendamento diário permite escolher horário/fuso, mostra a próxima execução e limita as tentativas antecipadas após falhas; consulte [Fontes conectadas](CONNECTED-SOURCES.md).

## Verificação

`npm run test:lifecycle`: regras de carga e testes HTTP/banco com contas descartáveis, isolamento RLS, versões, restauração, concorrência, retenção e exclusão. `npm run test:connectors`: provedores simulados com banco real; inclui recálculo e histórico em atualização remota, falha atômica e pausa após restauração. `npm run test:server` verifica também o JavaScript emitido para o servidor.

Preço, cobrança, retenção analítica ampliada e oferta de múltiplos usuários por empresa precisam de validação própria antes da venda. Medir tempo de primeira e segunda carga, suporte por cliente e custo de processamento/armazenamento num piloto pago antes de confirmar R$ 59,90 como preço sustentável.
