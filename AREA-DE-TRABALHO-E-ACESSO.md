# Área de trabalho e acesso — DriveVision

A entrada do produto agora é uma tela de acesso com o logo original da DriveData, login real, cadastro, ativação e transição de boas-vindas. A opção de explorar localmente continua disponível. A animação respeita `prefers-reduced-motion` e pode ser pulada.

## Área de trabalho

- Biblioteca inicial com cartões, lista e quadro por pasta. Busca ignora acentos; ordenação por atualização ou nome.
- Pastas criadas ao organizar um dashboard; favoritos, renomeação, duplicação independente e exclusão confirmada.
- Arraste pela alça para mover um dashboard para a pasta na lateral ou para uma coluna no quadro. O formulário Organizar oferece a mesma operação sem arrastar.
- Novo dashboard começa com visão executiva, comparativo, tendências ou em branco. É salvo ao criar; alterações posteriores são salvas pelo botão Salvar.
- A biblioteca pagina a cada 24 itens. Não há limite fixo de quantidade de dashboards; continuam valendo a capacidade do navegador e, na nuvem, os limites de transporte de 50 MB de JSON e 3,5 MB comprimidos por workspace. Fontes: até 50.
- Miniaturas mostram a composição, não uma prévia calculada dos valores.

## Editor

- Alças com Pointer Events para mover com mouse, toque e caneta; setas na alça para reordenar pelo teclado. Esc e cancelamento de ponteiro descartam o movimento.
- Canto inferior direito redimensiona o visual: 4, 6, 8 ou 12 colunas; até 900 px de altura. As setas nesse controle também ajustam o tamanho. No celular, o layout se adapta a uma coluna.
- Movimento e redimensionamento geram uma única entrada no histórico de desfazer/refazer por gesto e são persistidos ao salvar o painel.
- Novos tipos: mapa de árvore, radar, funil comparativo e medidor de meta, além dos dez tipos anteriores. Árvore/funil/medidor usam uma medida; radar permite as séries existentes.
- Funil mostra volumes proporcionais ao maior valor, sem inferir conversão. Radar exige três categorias não negativas. Árvore exige valores positivos. Medidor exige uma meta positiva, mostra o percentual real acima de 100% e limita apenas o arco visual.
- Os novos tipos usam os mesmos cálculos e filtros existentes. A lupa continua oferecendo exploração dos registros.

## Criar uma conta sem escolher a senha pelo usuário

O esquema privado `drivevision` continua separado das demais aplicações. A migração `20260926020000` concede somente `UPDATE(password_hash)` ao papel privado da aplicação. Não modifica os esquemas `public`, `auth` ou `licita`.

Depois da instalação inicial do banco, execute uma vez:

```powershell
npm run db:activation
```

Com `.env.local` configurado e o nome/e-mail corretos:

```powershell
npm run account:create -- "Nome do usuário" "email@empresa.com" "https://dominio-da-aplicacao"
```

Para prévia local, o último argumento pode ser `http://127.0.0.1:5173`. Use o domínio real ao entregar acesso à produção.

O comando cria uma conta e seu workspace privado. Gera em `work/` um HTML privado com link de ativação válido por 72 horas. O link é de uso único; o token original não fica no banco e é removido do endereço pelo cliente ao abrir. A conta não aceita login por senha enquanto estiver pendente. O usuário define uma senha de pelo menos 12 caracteres. Contas existentes nunca são sobrescritas pelo comando.

Não publique esse HTML nem envie seu link a terceiros. O diretório `work/` está ignorado no Git. O comando não envia e-mail. Para um convite expirado, é necessária intervenção do operador; não há recuperação automática de senha nesta versão.

## Validação desta entrega

- TypeScript e build de produção.
- Regressões de importação, preparação, cálculo, exploração e editor.
- Testes de biblioteca: cópias independentes, filtros, ordenação, 125 dashboards, metadados e limites de redimensionamento.
- Integração PostgreSQL: pastas, favoritos, tamanhos e transformações preservados após salvar/carregar; isolamento entre contas, RLS e revisões concorrentes.
- Ativação: token inexistente/expirado, origem não autorizada, senha curta, duas ativações concorrentes, uso único, sessão autenticada e preservação de contas existentes.
- A inspeção visual automatizada ficou pendente: a ferramenta do navegador bloqueou a seleção da aba por política de URL. Isso não comprova comportamento visual nem gestos em dispositivos reais.

Esta entrega amplia o workspace; não equivale à abrangência do Power BI. Modelo semântico com relacionamentos, medidas avançadas, conectores com atualização agendada, colaboração e paginação de dados no servidor continuam fora desta etapa.

Referências técnicas consultadas: [Recharts Treemap](https://recharts.github.io/en-US/api/Treemap/), [Recharts RadarChart](https://recharts.github.io/en-US/api/RadarChart/), [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles).
