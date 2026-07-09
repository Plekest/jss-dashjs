# Plano de Implementação: Unificar Conexões + Data Sets + Planilha num fluxo só

## Visão Geral

Hoje o app tem 3 abas de nav lado a lado — Conexões, Data (datasets), Planilhas — e criar um dataset a partir de SQL exige sair da aba Data, ir pra Conexões, criar a conexão lá, voltar pra Data, abrir "Importar via SQL" e escolher a conexão num dropdown. Um usuário novo testando BigQuery se perdeu exatamente nesse salto entre abas. Este plano funde os 3 pontos de entrada num wizard único ("+ Nova fonte de dados"), rebaixa Conexões a uma tela de gerenciamento secundária (não mais item de nav principal) e faz Planilha virar uma aba dentro do dataset em vez de destino de nav global.

## Análise do Estado Atual

Arquitetura: SPA Vite+React+MUI em `src/` + API Express em `server/src/` + Postgres via `server/db/init.sql`. As 3 entidades já são agnósticas de tipo no schema — o problema é 100% de nav/wizard, não de dado.

**Nav e rotas:**
- `src/layout/AppShell.tsx:29-34` — array de nav rail: `Data` (`/data`), `Conexões` (`/connections`), `Planilhas` (`/sheets`), `Dashboards`. Renderizado como rail de ícones em `AppShell.tsx:92-118`.
- `src/App.tsx:24-34` — tabela de rotas: `/data` → `DataPage`, `/connections` → `ConnectionsPage`, `/sheets` → `SheetsPage`, `/dashboards`(+`:id`), `/view/:slug`.
- `src/components/CommandPalette.tsx:34-38,67,113-118` — busca Cmd/Ctrl+K cruza dashboards/datasets/connections; resultado de connection navega pra `/connections?select=id`, dataset pra `/data?select=id`.

**Data Sets ("Data"):**
- `src/pages/DataPage.tsx` — list+detail (211-247, 250-345). Upload de arquivo (`handleFileChange` 80-99, via `parseFile`), botão "Importar via SQL" abrindo `ImportSqlDialog` (142-147, 158), delete (101-105), refresh manual/agendado (107-125, 301-317), botão "Abrir em Planilhas" (322-334) que faz `setActiveDataset` + navega pra `/sheets`.
- `src/stores/datasetsStore.tsx` — contexto com `datasets`, `activeDataset`, `createDataset`/`updateDataset`/`removeDataset`/`setActiveDataset`.
- `src/components/ImportSqlDialog.tsx` — escolhe conexão existente (linha 56, filtra `bigquery`/`postgres`), "Pré-visualizar" via `connectionsApi.preview` (72-85), "Importar" via `connectionsApi.ingest` (87-100), empty-state linkando pra `/connections` (108-116). **Não permite criar conexão nova sem sair do dialog** — esse é o ponto exato da confusão relatada.
- `src/lib/api.ts:1-38,109-142` — tipos `Dataset`/`DatasetMeta`/`DatasetWorksheet` e `datasetsApi`.

**Conexões:**
- `src/pages/ConnectionsPage.tsx` — CRUD completo: list+detail (244-378), dialog "Nova conexão" (381-496) com seletor de tipo (384-394), campos BigQuery (402-431) e Postgres (432-484), "Testar conexão" (178-192, via `connectionsApi.test`), delete (194-198, 366-373, **sem nenhum guard hoje** — apaga direto).
- `src/lib/api.ts:70-107` — `ConnectionMeta` e `connectionsApi` (list/create/remove/test/preview/ingest).

**Planilhas:**
- `src/pages/SheetsPage.tsx` — sidebar própria de datasets (88-150) + área de grid via `JssMount` (222-240); hoje é destino de nav **independente**, não amarrado a um dataset específico até o usuário escolher na sidebar interna ou chegar via `setActiveDataset` (como o botão "Abrir em Planilhas" do DataPage já faz).
- `src/components/JssMount.tsx` — encapsula Jspreadsheet: monta worksheets (`toJssWorksheet` 45-61), extrai edição (`extractWorksheets` 65-75), modo simples (96-119) vs modo pro/multi-aba (120-150).
- Não existe entidade "spreadsheet" separada: o estado do grid vive em `datasets.meta.worksheets` (modo pro) ou `datasets.columns`/`data` (modo simples) — é a mesma linha da tabela `datasets`.

**Backend:**
- `server/src/index.ts:15-18` — monta `/api/datasets`, `/api/dashboards`, `/api/connections`, `/api/public`.
- `server/src/routes/connections.ts`: `GET /` (21-26), `POST /` (29-81, valida/monta credenciais por `type`), `DELETE /:id` (84-87, sem guard), `POST /:id/test` (90-98, exige conexão já salva), `POST /:id/preview` (101-111, idem), `POST /:id/ingest` (114-131).
- `server/src/routes/datasets.ts`: `GET /`/`GET /:id`/`POST /`/`PUT /:id`/`DELETE /:id` (8-65), `refresh-schedule`/`refresh-now` (68-91), `insertDataset` (113-137), `refreshDataset` (143-172).
- `server/src/queryEngine.ts` — dispatcher por `connections.type`, delega pra `bigquery.runQuery`/`postgres.runQuery`.
- `server/src/bigquery.ts` / `server/src/postgres.ts` — cada um tem `clientFor(connectionId)` que busca a linha em `connections`, decripta credenciais (`crypto.ts`), monta o client, e `runQuery(connectionId, sql, maxRows)`. **Sempre exigem uma connection já persistida** — não existe hoje um caminho de "testar/rodar SQL sem salvar antes".
- `server/db/init.sql`: `datasets` (3-21), `dashboards` (23-34, `dataset_id` FK `ON DELETE SET NULL`), `connections` (36-44), `datasets.connection_id` FK **`ON DELETE SET NULL`** (49-54) — hoje apagar uma conexão órfã silenciosamente os datasets que dependem dela; refresh agendado desses datasets passa a falhar sem aviso nenhum na hora do delete (só aparece depois em `last_refresh_error`).

**Decisões tomadas (confirmadas com o usuário antes deste plano):**
1. Arquétipo de layout: **merge total** (estilo Looker Studio) — um item de nav "Dados" substitui Conexões+Data; Conexões vira tela secundária "Gerenciar conexões"; Planilha vira aba dentro do dataset.
2. Timing de persistência no wizard: conexão só é gravada no banco **no save final** (passo 4), não ao testar (passo 2) — evita conexão órfã se o usuário cancelar no meio. Exige endpoints novos de teste/preview "adhoc" (sem `connectionId`).
3. Nav de Planilhas: **remove** da nav rail; vira só aba dentro do dataset aberto em Dados (reusa a rota/mecanismo `/sheets` existente por trás da aba, não precisa embutir o grid inline).
4. Exclusão de conexão em uso: **avisa com contagem** de datasets afetados antes de apagar, exige confirmação explícita (parâmetro `force`).

## Estado Final Desejado

Um usuário abre "Dados" (único item de nav pra tudo isso), clica "+ Nova fonte de dados", escolhe BigQuery/Postgres/Upload, informa credenciais (novas ou reaproveitando uma conexão salva) e testa sem nada ser persistido ainda, escreve/confere o SQL com preview, e só ao clicar Salvar a conexão (se nova) e o dataset são gravados. O dataset aberto mostra uma aba "Overview" (metadados, "criado de: Conexão X" linkando pra gerenciamento) e uma aba "Planilha" (abre o grid). Conexões não aparece mais na nav principal; existe uma tela "Gerenciar conexões" só de leitura/exclusão, acessível por link, cujo delete avisa quantos datasets quebram antes de confirmar.

Verificação: ver "Critérios de Sucesso" em cada fase abaixo.

## Fases de Implementação

As fases têm dependência sequencial (ao contrário da rodada anterior): a Fase 2 (wizard) precisa dos endpoints da Fase 1; a Fase 3 (nav) precisa do wizard da Fase 2 pronto pra virar o botão principal do Data; a Fase 5 (limpeza) só deve rodar depois de Fases 3/4 verificadas manualmente.

---

### Fase 1: Backend — teste/preview sem persistir + guard de exclusão

**Objetivo**: viabilizar "testar e prever SQL antes de salvar a conexão" e impedir exclusão silenciosa de conexão em uso.

**Mudanças:**

1. `server/src/bigquery.ts` — hoje `clientFor(connectionId)` (linhas 5-14) busca+decripta e retorna `{ bq, location }`, onde `location` vem de `config.location` (não das credenciais) e é usado em `createQueryJob({query, location})` (linha 28). Separar isso preservando o `location` no caminho adhoc, já que sem ele uma query num projeto BigQuery multi-region se comporta diferente no teste/preview (sem location) do que no ingest real pós-save (com location):
   ```ts
   type ServiceAccountCredentials = Record<string, string>

   function clientForCredentials(creds: ServiceAccountCredentials, location?: string) {
     return { bq: new BigQuery({ projectId: creds.project_id, credentials: creds }), location }
   }

   async function clientFor(connectionId: string) {
     const { rows } = await pool.query('SELECT * FROM connections WHERE id=$1', [connectionId])
     if (!rows.length) throw new Error('connection not found')
     const creds = JSON.parse(decrypt(rows[0].credentials)) as ServiceAccountCredentials
     const location = (rows[0].config as Record<string, string>)?.location
     return clientForCredentials(creds, location)
   }

   export async function runQueryWithCredentials(creds: ServiceAccountCredentials, location: string | undefined, sql: string, maxRows = 50_000) {
     const { bq } = clientForCredentials(creds, location)
     // mesmo corpo de runQuery hoje (createQueryJob + getQueryResults), usando `location` daqui
   }

   export async function runQuery(connectionId: string, sql: string, maxRows = 50_000) {
     const { bq, location } = await clientFor(connectionId)
     return runQueryWithCredentials(/* extrair creds já decriptadas de clientFor, ou refatorar clientFor pra devolver creds+location e montar bq só dentro de runQueryWithCredentials */ creds, location, sql, maxRows)
   }
   ```

2. `server/src/postgres.ts` — mesma separação: `clientForCredentials(creds: PostgresCredentials)` + `runQueryWithCredentials(creds, sql, maxRows)` (Postgres não tem conceito de `location`, então não precisa desse parâmetro extra), com `runQuery(connectionId, ...)` virando um wrapper fino que busca+decripta e chama `runQueryWithCredentials`.

3. `server/src/queryEngine.ts` — novo export `runQueryAdhoc`, com `location` como parâmetro opcional (só relevante pra `bigquery`; `postgres` ignora):
   ```ts
   export async function runQueryAdhoc(type: string, credentials: unknown, sql: string, maxRows = 50, location?: string) {
     switch (type) {
       case 'bigquery': return bigquery.runQueryWithCredentials(credentials as ServiceAccountCredentials, location, sql, maxRows)
       case 'postgres': return postgres.runQueryWithCredentials(credentials as PostgresCredentials, sql, maxRows)
       default: throw new Error(`unsupported connection type: ${type}`)
     }
   }
   ```

4. `server/src/routes/connections.ts` — extrair a validação de shape de credenciais por `type` (hoje só dentro de `POST /`, linhas 39-66) pra uma função reusada pelos 3 endpoints que lidam com credencial crua (`POST /`, `test-adhoc`, `preview-adhoc`), pra não duplicar/divergir a regra "BigQuery exige project_id/client_email/private_key" / "Postgres exige host/user/database" em 3 lugares:
   ```ts
   function parseCredentials(type: string, credentials: unknown): Record<string, unknown> {
     if (type === 'bigquery') {
       const sa = typeof credentials === 'string' ? JSON.parse(credentials) : credentials as Record<string, unknown>
       if (!sa.project_id || !sa.client_email || !sa.private_key) {
         throw new Error('credentials must contain project_id, client_email, private_key')
       }
       return sa
     }
     if (type === 'postgres') {
       const { host, user, database } = credentials as Record<string, unknown>
       if (!host || !user || !database) throw new Error('credentials must contain host, user, database')
       return credentials as Record<string, unknown>
     }
     throw new Error(`unsupported connection type: ${type}`)
   }
   ```
   `POST /` (linhas 39-66) passa a chamar `parseCredentials` antes de montar `config`/`credsToEncrypt`, em vez de repetir a validação inline.

5. Dois endpoints novos, antes das rotas existentes, ambos usando `parseCredentials` pra validar antes de rodar:
   ```ts
   router.post('/test-adhoc', async (req, res) => {
     const { type, credentials, location } = req.body
     try {
       const parsed = parseCredentials(type, credentials)
       await runQueryAdhoc(type, parsed, 'SELECT 1', 1, location)
       res.json({ ok: true })
     } catch (err) {
       res.status(400).json({ ok: false, error: (err as Error).message })
     }
   })

   router.post('/preview-adhoc', async (req, res) => {
     const { type, credentials, sql, location } = req.body
     try {
       const parsed = parseCredentials(type, credentials)
       res.json(await runQueryAdhoc(type, parsed, sql, 50, location))
     } catch (err) {
       res.status(400).json({ error: (err as Error).message })
     }
   })
   ```

6. `server/src/routes/connections.ts` — `DELETE /:id` (hoje linhas 84-87) ganha guard:
   ```ts
   router.delete('/:id', async (req, res) => {
     const force = req.query.force === 'true'
     const { rows } = await pool.query(
       'SELECT count(*)::int AS count FROM datasets WHERE connection_id = $1',
       [req.params.id],
     )
     if (rows[0].count > 0 && !force) {
       return res.status(409).json({ datasetsAffected: rows[0].count })
     }
     await pool.query('DELETE FROM connections WHERE id = $1', [req.params.id])
     res.status(204).end()
   })
   ```

7. `src/lib/api.ts` — novas funções em `connectionsApi`, seguindo o mesmo padrão posicional/fetch já usado pelas outras (ex.: `preview(id, sql)` linha 94, `ingest(id, sql, name, refreshIntervalMinutes?)` linha 101 — não é forma de objeto único):
   ```ts
   testAdhoc: (type: 'bigquery' | 'postgres', credentials: string | Record<string, unknown>, location?: string) =>
     fetch('/api/connections/test-adhoc', {
       method: 'POST',
       headers: { 'content-type': 'application/json' },
       body: JSON.stringify({ type, credentials, location }),
     }).then(json<{ ok: boolean; error?: string }>),

   previewAdhoc: (type: 'bigquery' | 'postgres', credentials: string | Record<string, unknown>, sql: string, location?: string) =>
     fetch('/api/connections/preview-adhoc', {
       method: 'POST',
       headers: { 'content-type': 'application/json' },
       body: JSON.stringify({ type, credentials, sql, location }),
     }).then(json<{ columns: { title: string }[]; data: (string | number)[][] }>),
   ```
   `remove(id: string, opts?: { force?: boolean })` passa a montar `?force=true` na URL quando `opts?.force`, e o caller precisa tratar um retorno 409 (ver Fase 4) em vez de assumir sempre sucesso.

**Critérios de Sucesso:**

Automatizados:
- [x] `tsc --noEmit` no server sem erros
- [ ] Teste unitário de `runQueryAdhoc`: dispatch correto por `type`, erro em `type` desconhecido — pulado: repo não tem framework de teste configurado (nem server nem front têm vitest/jest); avisar se quiser que eu monte isso

Manuais:
- [ ] `POST /api/connections/test-adhoc` com credenciais válidas de Postgres retorna `{ok:true}` sem criar linha em `connections`
- [ ] `POST /api/connections/preview-adhoc` com SQL válido retorna colunas/linhas sem criar linha em `datasets` nem `connections`
- [ ] `DELETE /api/connections/:id` numa conexão usada por 2 datasets retorna 409 com `{datasetsAffected: 2}`; repetir com `?force=true` apaga de fato
- [ ] Conexões e datasets já existentes (BigQuery e Postgres) continuam funcionando sem regressão (test/preview/ingest/refresh nos endpoints antigos)

---

### Fase 2: Wizard único "+ Nova fonte de dados"

**Objetivo**: um único componente substitui o dialog "Nova conexão" do `ConnectionsPage` e o `ImportSqlDialog`, cobrindo os 3 caminhos (BigQuery, Postgres, Upload) sem o usuário sair da tela.

**Mudanças:**

1. `src/components/AddDataSourceWizard.tsx` (novo arquivo) — modal com 4 passos (MUI `Stepper` ou equivalente já usado no projeto):
   - **Passo 1 — Tipo**: BigQuery / Postgres / Upload de arquivo. Escolher Upload pula direto pro passo 4 (file picker + preview via `parseFile.ts`, mesmo código hoje em `DataPage.tsx:80-99`).
   - **Passo 2 — Credenciais**: toggle "usar conexão existente" (select populado por `connectionsApi.list()` filtrado pelo `type` escolhido) vs "nova conexão" (campos idênticos aos hoje em `ConnectionsPage.tsx:402-431` pra BigQuery, incl. `location` opcional, e `432-484` pra Postgres). Botão "Testar": se existente, `connectionsApi.test(id)`; se nova, `connectionsApi.testAdhoc(type, credentials, location)` — nada é persistido neste passo.
   - **Passo 3 — SQL + preview**: textarea de SQL (reusa a UI de `ImportSqlDialog.tsx`) + botão "Pré-visualizar": se conexão existente, `connectionsApi.preview(id, sql)`; se nova, `connectionsApi.previewAdhoc(type, credentials, sql, location)` — mesmo `location` coletado no passo 2, pra teste/preview e ingest real se comportarem igual em projetos BigQuery multi-region.
   - **Passo 4 — Salvar**: nome do dataset + intervalo de refresh (reusa campos de `ImportSqlDialog.tsx:87-100`). Ao confirmar:
     - Upload: `datasetsApi.create(...)` direto (sem tocar em `connections`).
     - Conexão existente: `connectionsApi.ingest(id, sql, name, refreshIntervalMinutes)` — igual ao fluxo de hoje (assinatura posicional, `src/lib/api.ts:101`).
     - Conexão nova: `connectionsApi.create({name, type, credentials, location})` → pega o `id` retornado → `connectionsApi.ingest(id, sql, name, refreshIntervalMinutes)`. Se o `ingest` falhar (SQL inválido, timeout etc), o wizard chama `connectionsApi.remove(newConnectionId)` antes de mostrar o erro — sem esse rollback, uma conexão nova sobrevive no banco sem nenhum dataset associado, o que contradiz a decisão de "sem resíduo ao cancelar". Só depois do `ingest` confirmar sucesso é que a conexão nova conta como persistida de verdade.

2. `src/pages/DataPage.tsx` — troca os botões separados "Upload" / "Importar via SQL" (hoje ao redor de 80-147) por um único botão "+ Nova fonte de dados" que abre `AddDataSourceWizard`.

3. `src/components/ImportSqlDialog.tsx` — apagar (lógica absorvida pelo wizard; ver Fase 5).

**Critérios de Sucesso:**

Automatizados:
- [x] `tsc --noEmit` e `npm run build` no React app sem erros

Manuais:
- [ ] Fluxo completo "BigQuery novo" ponta a ponta: tipo → credenciais novas → testar (sem nada salvo ainda, conferir no `GET /api/connections`) → SQL → preview → salvar → dataset aparece em Dados, conexão aparece em Gerenciar conexões
- [ ] Fluxo "Postgres reaproveitando conexão existente": passo 2 lista conexões já salvas, pula direto pro preview sem pedir credencial de novo
- [ ] Fluxo "Upload de CSV": pula passos 2/3, vai direto pro preview do arquivo
- [ ] Cancelar o wizard depois de testar uma conexão nova (antes do passo 4) não deixa linha órfã em `connections`
- [ ] Conexão nova + SQL inválido no passo 4 (ingest falha): confirmar que a conexão criada no início do passo 4 é removida (`GET /api/connections` não mostra ela depois do erro)
- [ ] Conexão BigQuery nova com `location` preenchido: preview no passo 3 e o dataset ingerido no passo 4 rodam contra a mesma region (não há diferença de comportamento entre pré-save e pós-save)

---

### Fase 3: Nav e rotas

**Objetivo**: nav rail reflete o merge; Planilha some como destino global.

**Mudanças:**

1. `src/layout/AppShell.tsx:29-34` — array de nav rail passa a ter só `Dados` (`/data`) e `Dashboards`; remove as entradas `Conexões` e `Planilhas`.

2. `src/App.tsx:24-34` — rotas `/connections` e `/sheets` continuam existindo (nenhum código que dependa delas quebra), só deixam de estar na nav principal — viram acessíveis só por link.

3. `src/pages/DataPage.tsx` — painel de detalhe (hoje 250-345) ganha `Tabs`: **Overview** (conteúdo atual do painel) e **Planilha** (clique navega pra `/sheets` fazendo `setActiveDataset(dataset)` antes — mesmo mecanismo que o botão "Abrir em Planilhas" já faz hoje em 322-334, só reembalado como aba em vez de botão solto).

4. `src/pages/ConnectionsPage.tsx` — vira "Gerenciar conexões": mantém list+detail+delete, mas sem o dialog "Nova conexão" (ver Fase 5) — só acessível a partir de um link dentro de Dados, não mais item de nav.

**Critérios de Sucesso:**

Automatizados:
- [x] `tsc --noEmit` e `npm run build` sem erros

Manuais:
- [ ] Nav rail mostra só Dados/Dashboards
- [ ] Dentro de um dataset, aba "Planilha" abre o grid daquele dataset especificamente (não de outro)
- [ ] `/connections` e `/sheets` continuam acessíveis via URL direta e via `CommandPalette`, mesmo fora da nav rail

---

### Fase 4: Religação e transparência

**Objetivo**: fechar o vínculo visual entre dataset e conexão de origem, e usar o guard de exclusão da Fase 1 na UI.

**Mudanças:**

1. `src/pages/DataPage.tsx` (aba Overview) — se `dataset.connectionId` existir, busca a lista de conexões (`connectionsApi.list()`, já carregada em outros pontos do app) e mostra "Criado de: Conexão {nome}" linkando pra `/connections?select={connectionId}`.

2. `src/pages/ConnectionsPage.tsx` — `handleDelete` (hoje 194-198) passa a chamar `connectionsApi.remove(id)` sem `force`; se a resposta for 409, mostra um `Dialog` de confirmação "Esta conexão alimenta N dataset(s); removê-la vai quebrar o refresh deles. Continuar?" e só then re-chama `connectionsApi.remove(id, {force: true})`.

3. `src/components/CommandPalette.tsx` — resultado de tipo "connection" continua navegando pra `/connections?select=id`; ajustar label do grupo se ainda disser algo como "Conexões" lado a lado com "Datasets" de um jeito que sugira paridade de nav (cosmético, conferir `GROUP_LABELS` em 34-38).

**Critérios de Sucesso:**

Automatizados:
- [x] `tsc --noEmit` e `npm run build` sem erros

Manuais:
- [ ] Dataset criado via SQL mostra o nome real da conexão de origem, link funciona
- [ ] Dataset de upload (sem `connectionId`) não mostra essa linha
- [ ] Excluir conexão usada por datasets mostra o aviso com contagem certa antes de apagar; excluir conexão sem uso não mostra aviso nenhum

---

### Fase 5: Limpeza

**Objetivo**: remover código duplicado agora redundante depois que Fases 2-4 estão verificadas — mas preservando um caminho de pré-provisionar conexão sem exigir dataset junto (o schema já modela `connection 1→N datasets`; um admin cadastrando uma conexão compartilhada pra outra pessoa reusar depois é um uso legítimo que o wizard sozinho não cobre, já que o wizard sempre termina num `ingest`).

**Mudanças:**

1. `src/pages/ConnectionsPage.tsx` — o dialog "Nova conexão" (hoje 381-496) não é removido, mas **encolhe**: perde os campos de SQL/preview/nome-de-dataset (que já não existem nele hoje) e vira só "cadastrar + testar credencial" (`connectionsApi.create` + `connectionsApi.test`), sem gerar dataset nenhum — puramente pra deixar a conexão disponível pro passo 2 do wizard escolher como "conexão existente" depois. Continua fora da nav principal, só dentro de "Gerenciar conexões".
2. `src/components/ImportSqlDialog.tsx` — apagar o arquivo (substituído por `AddDataSourceWizard.tsx`).
3. `src/pages/DataPage.tsx` — remove o botão solto "Abrir em Planilhas" (absorvido pela aba Planilha da Fase 3).

**Critérios de Sucesso:**

Automatizados:
- [x] `tsc --noEmit` e `npm run build` sem erros, sem imports órfãos de `ImportSqlDialog`

Manuais:
- [ ] "Gerenciar conexões" ainda permite cadastrar+testar uma conexão nova sem criar dataset nenhum (pré-provisionamento)
- [ ] Conexão pré-provisionada dessa forma aparece no passo 2 do wizard como "conexão existente"
- [ ] Nenhuma regressão nos fluxos verificados nas Fases 2-4 depois da remoção

## Notas de Implementação

- Nenhuma migração de banco é necessária — `connections`/`datasets`/`dashboards` já têm o schema agnóstico de tipo necessário; a mudança é só de wizard/nav/rota.
- Uma aba adicional "Preview gráfico" dentro do dataset foi cogitada durante a decisão de layout mas fica fora de escopo deste plano — Overview + Planilha cobrem o pedido original; pode virar um plano futuro separado se fizer falta.
- `SheetsPage.tsx` mantém sua sidebar interna de troca de dataset (88-150) intacta — deixa de ser alcançável por nav global, mas continua útil pra trocar de dataset sem voltar pra Dados enquanto já se está numa planilha.
- Fase 1 deve ser implementada e verificada isoladamente antes da Fase 2 (o wizard depende dos endpoints `test-adhoc`/`preview-adhoc`); Fase 5 só deve rodar depois de Fases 2-4 confirmadas manualmente, pra não remover os dialogs antigos antes do substituto estar 100% funcional.

## Questões em Aberto

Nenhuma — as 4 decisões de produto que exigiam julgamento humano (arquétipo de layout, timing de persistência da conexão no wizard, destino da aba Planilhas, guard de exclusão) foram resolvidas com as opções recomendadas (ver topo do documento).
