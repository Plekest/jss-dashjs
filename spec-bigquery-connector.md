# Plano de Implementação: Conector BigQuery (Service Account) → Datasets

## Visão Geral

Adicionar um **novo modelo de ingestão de dados** ao app: um **conector BigQuery** que roda
no backend, autentica via **service account JSON** (já em posse do usuário), executa uma
**query SQL** e materializa o resultado como um **Dataset** (`sourceType: 'bigquery'`) —
o mesmo objeto `{ columns, data }` que hoje alimenta Planilhas e Dashboards.

Diferente do modelo atual (parsing **no cliente** → `POST /api/datasets`), o BigQuery
**precisa rodar no servidor**: o JSON é segredo (não pode ir ao browser) e o client
`@google-cloud/bigquery` é Node-only. Portanto o conector vive em `server/`.

Decisões travadas com o usuário:

| Decisão | Escolha |
|---|---|
| Biblioteca | `@google-cloud/bigquery` direto (sem openetl — não há adapter BQ oficial) |
| Credenciais | Upload do JSON na UI → salvo no Postgres **cifrado** (AES-256-GCM) |
| Modo de ingestão | SQL custom → **snapshot** (resultado vira Dataset persistido) |
| Escopo | Só BigQuery agora, mas tabela `connections` + UI **genéricas** (Postgres/MySQL depois) |

---

## Análise do Estado Atual

### Backend fino, dataset-cêntrico (já implementado em `spec-data-persistence.md`)
- Express + Postgres em `server/`. `server/src/index.ts:11-12` monta `/api/datasets` e `/api/dashboards`.
- `server/db/init.sql:3-12` — tabela `datasets` com `source_type` (hoje `csv|xlsx|json|tsv`), `columns jsonb`, `data jsonb`, `row_count`.
- `server/src/routes/datasets.ts:22-34` — `POST /api/datasets` recebe `{ name, sourceType, columns, data }` já normalizado e faz `INSERT ... RETURNING *`. É esse formato exato que a ingestão BigQuery vai produzir.
- `server/src/db.ts:4` — `pool` único (`pg`) via `DATABASE_URL`.

### Fonte de dados → charts
- `src/lib/buildDataSource.ts` converte `{ columns, data }` em `DashJsDataSource`, usando a convenção de IDs `col_<index>` **derivada da ordem das colunas**. Logo, basta que a ingestão BQ devolva `columns` na ordem certa — **nenhuma mudança no `buildDataSource` é necessária**.
- `src/stores/datasetsStore.tsx:45-52` — `createDataset` faz `POST` e `refresh()`. A ingestão BQ produzirá um dataset que aparece aqui automaticamente.

### Já há precedente de "conector server-side com service account"
- `src/connectors/ga4Connector.ts:9-12` documenta exatamente o padrão: *"Auth: service account JSON no servidor (nunca exposto ao browser)"*. O conector BigQuery concretiza esse padrão.

### O que falta hoje
- Nenhuma tabela de **conexões/credenciais**. Nenhuma cifragem. Nenhuma rota BigQuery.
- `@google-cloud/bigquery` **não** está em `server/package.json:10-14`.
- O JSON do service account **não** está no repositório (será fornecido pelo usuário via UI).

---

## Estado Final Desejado

- Uma seção **Conexões** no menu lateral onde o usuário cadastra uma conexão BigQuery
  colando/subindo o service account JSON. A conexão é testada e listada (sem nunca
  reexibir o segredo).
- Na seção **Data**, além de "Enviar arquivo", um botão **"Importar do BigQuery"** abre um
  diálogo: escolhe a conexão → escreve SQL → **pré-visualiza** as primeiras linhas →
  nomeia → **importa**, criando um Dataset `sourceType: 'bigquery'`.
- O dataset importado aparece na lista de Data e está disponível em Planilhas e Dashboards
  exatamente como um CSV — sobrevive a reload (Postgres).

### Como verificar o estado final
- `docker-compose up` sobe `db` + `api` sem erro; a tabela `connections` existe.
- `curl localhost:3001/api/connections` → `[]` (ou conexões cadastradas, **sem** o campo de credenciais).
- Cadastrar a conexão na UI → "Testar" retorna sucesso.
- No diálogo de importação, rodar `SELECT 1 AS um, 'a' AS letra` → preview mostra 1 linha, 2 colunas → "Importar" cria um dataset.
- O dataset BQ aparece em Data, abre em Planilhas e vira gráfico em Dashboards, persistindo após reload.

### Descobertas Chave
- `server/src/routes/datasets.ts:27-32` — o `INSERT` em `datasets` é o ponto de reuso: a ingestão BQ fará o mesmo insert (extraído para um helper `insertDataset`).
- `server/src/routes/datasets.ts:68-79` — `toCamel` é o padrão de serialização snake→camel; a rota de connections seguirá o mesmo estilo.
- `src/lib/api.ts:35-58` — `datasetsApi` é o padrão de wrapper fetch tipado; `connectionsApi` será análogo.
- `src/layout/AppShell.tsx` define `navItems` (Data/Planilhas/Dashboards) — adicionar **Conexões**.
- `@google-cloud/bigquery` v8.x autentica com `new BigQuery({ projectId, credentials })`, onde `credentials` é o objeto do service account JSON (`client_email` + `private_key`). Não precisa de arquivo em disco.

---

## Arquitetura Alvo

```
server/
├── src/
│   ├── crypto.ts                 → NOVO: encrypt/decrypt AES-256-GCM (CONNECTIONS_SECRET)
│   ├── bigquery.ts               → NOVO: client factory + runQuery → { columns, data }
│   ├── routes/
│   │   ├── datasets.ts           → exporta helper insertDataset (reuso)
│   │   └── connections.ts        → NOVO: CRUD + /test + /preview + /ingest
│   └── index.ts                  → + app.use('/api/connections', ...)
└── db/init.sql                   → + CREATE TABLE connections

src/ (frontend)
├── lib/api.ts                    → + connectionsApi (list/create/remove/test/preview/ingest)
├── pages/
│   ├── ConnectionsPage.tsx       → NOVO: lista + cadastro (paste/upload JSON) + testar + apagar
│   └── DataPage.tsx              → + botão "Importar do BigQuery" + ImportBigQueryDialog
├── components/
│   └── ImportBigQueryDialog.tsx  → NOVO: escolher conexão → SQL → preview → importar
├── layout/AppShell.tsx           → + nav item "Conexões"
└── App.tsx                       → + rota /connections
```

### Modelo de dados — `connections` (genérico)

```sql
CREATE TABLE IF NOT EXISTS connections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  type         text NOT NULL,                  -- 'bigquery' (extensível: 'postgres', ...)
  config       jsonb NOT NULL DEFAULT '{}',    -- NÃO-secreto: { projectId, location, clientEmail }
  credentials  text,                           -- service account JSON CIFRADO (AES-256-GCM)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

- `config` guarda só metadados não-sensíveis para exibir na UI (`projectId`, `clientEmail`).
- `credentials` é o JSON **inteiro cifrado**. **Nunca** é devolvido por nenhuma rota.

---

## Fases de Implementação

### Fase 1 — Schema `connections` + cifragem + dependência

**Objetivo**: Persistir conexões com segredo cifrado em repouso e ter o client BQ disponível.

**Mudanças**:

1. `server/db/init.sql` — adicionar a tabela `connections` (DDL acima).
   > **Migração**: `init.sql` só roda em volume novo. Para um volume existente, aplicar o
   > `CREATE TABLE connections` manualmente (`docker-compose exec db psql -U jss -d jss_dashjs -f ...`)
   > ou recriar o volume (`docker-compose down -v`). O `CREATE TABLE IF NOT EXISTS` é idempotente.

2. `server/package.json` — adicionar dependência `@google-cloud/bigquery@^8`.
   ```bash
   cd server && npm install @google-cloud/bigquery
   ```

3. `server/src/crypto.ts` — cifragem simétrica usando o módulo `crypto` nativo:
   ```ts
   import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

   const KEY = createHash('sha256')
     .update(process.env.CONNECTIONS_SECRET ?? 'dev-insecure-secret')
     .digest() // 32 bytes

   export function encrypt(plain: string): string {
     const iv = randomBytes(12)
     const cipher = createCipheriv('aes-256-gcm', KEY, iv)
     const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
     const tag = cipher.getAuthTag()
     return Buffer.concat([iv, tag, enc]).toString('base64') // iv(12)+tag(16)+ct
   }

   export function decrypt(payload: string): string {
     const buf = Buffer.from(payload, 'base64')
     const iv = buf.subarray(0, 12)
     const tag = buf.subarray(12, 28)
     const enc = buf.subarray(28)
     const decipher = createDecipheriv('aes-256-gcm', KEY, iv)
     decipher.setAuthTag(tag)
     return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
   }
   ```

4. `docker-compose.yml` — adicionar `CONNECTIONS_SECRET` ao serviço `api`:
   ```yaml
   api:
     environment:
       DATABASE_URL: postgres://jss:jss@db:5432/jss_dashjs
       PORT: 3001
       CONNECTIONS_SECRET: ${CONNECTIONS_SECRET:-dev-insecure-secret}
   ```

**Critérios de Sucesso**:

Automatizados:
- [x] `cd server && npm ls @google-cloud/bigquery` mostra a dep instalada
- [x] `docker-compose up -d db && docker-compose exec db psql -U jss -d jss_dashjs -c "\dt"` lista `connections`
- [x] Node REPL: `decrypt(encrypt('x')) === 'x'` (round-trip da cifragem)

Manuais:
- [ ] `CONNECTIONS_SECRET` documentado para produção (não usar o default inseguro)

---

### Fase 2 — Backend: CRUD de Conexões

**Objetivo**: Cadastrar, listar, testar e remover conexões — **sem nunca devolver o segredo**.

**Mudanças**:

1. `server/src/routes/datasets.ts` — extrair o INSERT atual para um helper reutilizável e exportá-lo:
   ```ts
   export async function insertDataset(
     name: string, sourceType: string,
     columns: unknown[], data: unknown[][],
   ) {
     const { rows } = await pool.query(
       `INSERT INTO datasets (name, source_type, columns, data, row_count)
        VALUES ($1,$2,$3,$4,$5) RETURNING *`,
       [name, sourceType, JSON.stringify(columns), JSON.stringify(data), data.length],
     )
     return toCamel(rows[0])
   }
   ```
   O handler `POST /` passa a chamar `insertDataset(...)`. (Exportar também `toCamel` se útil.)

2. `server/src/routes/connections.ts` — rotas:
   - `GET /` → `SELECT id, name, type, config, created_at, updated_at` (**sem** `credentials`) → `toCamel`.
   - `POST /` → body `{ name, type: 'bigquery', credentials: <objeto ou string JSON> }`:
     - parse do JSON; extrair `project_id` → `config.projectId` e `client_email` → `config.clientEmail`; `location` opcional do body.
     - validar campos essenciais (`project_id`, `client_email`, `private_key`); 400 se faltar.
     - `INSERT` com `credentials = encrypt(JSON.stringify(saJson))`.
     - resposta: metadados (sem `credentials`).
   - `DELETE /:id`.
   - `POST /:id/test` → carrega a conexão, decifra, roda `SELECT 1` (ver Fase 3) → `{ ok: true }` ou 400 com mensagem amigável.

3. `server/src/index.ts:12` — `app.use('/api/connections', connectionsRouter)`.

**Critérios de Sucesso**:

Automatizados:
- [x] `curl -XPOST localhost:3001/api/connections -H 'content-type: application/json' -d @sa.json.wrapper` cria e retorna metadados **sem** `credentials`
- [x] `curl -s localhost:3001/api/connections` lista a conexão e o JSON **não** contém `private_key` nem `credentials`
- [x] `curl -XPOST localhost:3001/api/connections/<id>/test` → `{"ok":true}` (com JSON válido)
- [x] `curl -XDELETE localhost:3001/api/connections/<id>` → 204

Manuais:
- [ ] Logs do servidor **não** imprimem `private_key` em nenhum momento

---

### Fase 3 — Backend: BigQuery (client + query → preview/ingest)

**Objetivo**: Executar SQL no BigQuery e normalizar para `{ columns, data }`; expor preview (volátil) e ingest (cria dataset).

**Mudanças**:

1. `server/src/bigquery.ts`:
   ```ts
   import { BigQuery } from '@google-cloud/bigquery'
   import { pool } from './db.js'
   import { decrypt } from './crypto.js'

   async function clientFor(connectionId: string) {
     const { rows } = await pool.query('SELECT * FROM connections WHERE id=$1', [connectionId])
     if (!rows.length) throw new Error('connection not found')
     const sa = JSON.parse(decrypt(rows[0].credentials))
     const location = rows[0].config?.location
     return {
       bq: new BigQuery({ projectId: sa.project_id, credentials: sa }),
       location,
     }
   }

   // BQ type → tipo de campo do dashjs ('number' | 'string')
   function coerce(value: unknown): string | number {
     if (value === null || value === undefined) return ''
     if (typeof value === 'number') return value
     if (typeof value === 'object' && value !== null && 'value' in (value as any)) {
       return String((value as any).value) // BigQueryTimestamp/Date/Numeric wrappers
     }
     return typeof value === 'bigint' ? Number(value) : String(value)
   }

   export async function runQuery(connectionId: string, sql: string, maxRows = 50_000) {
     const { bq, location } = await clientFor(connectionId)
     const [job] = await bq.createQueryJob({ query: sql, location, maximumBytesBilled: undefined })
     const [rows, , response] = await job.getQueryResults({ maxResults: maxRows })
     const fields = response?.schema?.fields ?? []
     const columns = fields.map((f) => ({ title: f.name }))
     const order = fields.map((f) => f.name as string)
     const data = (rows as Record<string, unknown>[]).map((r) => order.map((k) => coerce(r[k])))
     return { columns, data }
   }
   ```
   > Ordem das colunas vem de `response.schema.fields` (não das chaves do objeto), garantindo
   > a convenção `col_<index>` do `buildDataSource`. `test` (Fase 2) reusa `runQuery(id,'SELECT 1')`.

2. `server/src/routes/connections.ts` — acrescentar:
   - `POST /:id/preview` → body `{ sql }` → `runQuery(id, sql, 50)` → `{ columns, data }` (não persiste).
   - `POST /:id/ingest` → body `{ sql, name }` → `runQuery(id, sql)` → `insertDataset(name, 'bigquery', columns, data)` → 201 com o dataset.

**Segurança/custo**:
- O service account deve ter permissão **somente leitura** (BigQuery Data Viewer + Job User) — essa é a fronteira real; o app não tenta validar SQL read-only.
- `preview` limita a 50 linhas; `ingest` limita a 50k (proteção contra payload gigante no `jsonb`/Express `50mb`). Limite documentado.
- Erros do BQ (sintaxe, permissão) são capturados e retornados como 400 com a mensagem do BigQuery (sem vazar credenciais).

**Critérios de Sucesso**:

Automatizados:
- [x] `curl -XPOST .../connections/<id>/preview -d '{"sql":"SELECT 1 AS a, 2 AS b"}'` → `{"columns":[{"title":"a"},{"title":"b"}],"data":[[1,2]]}`
- [x] `curl -XPOST .../connections/<id>/ingest -d '{"sql":"SELECT 1 AS a","name":"teste_bq"}'` → 201 com dataset `sourceType:"bigquery"`
- [x] `curl -s localhost:3001/api/datasets` lista o dataset `teste_bq`
- [x] SQL inválido em `/preview` → 400 com mensagem do BigQuery (não 500)

Manuais:
- [ ] Query com TIMESTAMP/DATE retorna strings legíveis (não `[object Object]`)

---

### Fase 4 — Frontend: cliente API + página Conexões

**Objetivo**: UI para gerenciar conexões.

**Mudanças**:

1. `src/lib/api.ts` — tipos + `connectionsApi`:
   ```ts
   export interface ConnectionMeta {
     id: string; name: string; type: string
     config: { projectId?: string; clientEmail?: string; location?: string }
     createdAt: string; updatedAt: string
   }

   export const connectionsApi = {
     list: () => fetch('/api/connections').then(json<ConnectionMeta[]>),
     create: (d: { name: string; type: 'bigquery'; credentials: string; location?: string }) =>
       fetch('/api/connections', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(d) }).then(json<ConnectionMeta>),
     remove: (id: string) => fetch(`/api/connections/${id}`, { method:'DELETE' }),
     test: (id: string) =>
       fetch(`/api/connections/${id}/test`, { method:'POST' }).then(json<{ ok: boolean }>),
     preview: (id: string, sql: string) =>
       fetch(`/api/connections/${id}/preview`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ sql }) }).then(json<{ columns:{title:string}[]; data:(string|number)[][] }>),
     ingest: (id: string, sql: string, name: string) =>
       fetch(`/api/connections/${id}/ingest`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ sql, name }) }).then(json<Dataset>),
   }
   ```

2. `src/pages/ConnectionsPage.tsx` — layout estilo `DataPage`:
   - Lista de conexões (nome, `type`, `projectId`, `clientEmail`, atualizado) + botão "Testar" por linha + remover.
   - Botão "Nova conexão" → diálogo: `name`, `location` (opcional), e um campo grande para **colar** o JSON **ou** `<input type="file" accept=".json">` que lê o arquivo com `FileReader` e preenche o campo. Submete via `connectionsApi.create({ name, type:'bigquery', credentials, location })`.
   - Após criar, oferece "Testar conexão".

3. `src/layout/AppShell.tsx` — adicionar nav item **Conexões** (ícone `CableIcon` ou `LinkIcon`), apontando para `/connections`.

4. `src/App.tsx` — `<Route path="connections" element={<ConnectionsPage />} />`.

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run build` sem erros de tipo

Manuais:
- [ ] Menu lateral mostra **Data / Conexões / Planilhas / Dashboards**
- [ ] Colar o JSON real → criar conexão → aparece com o `projectId`/`clientEmail` corretos
- [ ] "Testar" → sucesso (verde); JSON inválido → erro amigável (vermelho)
- [ ] O JSON colado **nunca** reaparece após salvar (campo limpo; lista não traz segredo)

---

### Fase 5 — Frontend: fluxo de importação (SQL → preview → Dataset)

**Objetivo**: Importar dados do BigQuery para um Dataset a partir da seção Data.

**Mudanças**:

1. `src/components/ImportBigQueryDialog.tsx`:
   - Select de conexão (de `connectionsApi.list`, filtrando `type==='bigquery'`).
   - `TextField` multiline para o SQL.
   - Botão **"Pré-visualizar"** → `connectionsApi.preview` → renderiza tabela com as primeiras 50 linhas (ou erro).
   - Campo **Nome do dataset** (default sugerido, ex. `bigquery_import`).
   - Botão **"Importar"** → `connectionsApi.ingest` → ao sucesso, fecha e dispara `datasetsStore.refresh()`.
   - Estados de loading/erro reusando o padrão de `DataPage.tsx:34-35`.

2. `src/pages/DataPage.tsx`:
   - Ao lado de "Enviar arquivo", botão **"Importar do BigQuery"** (ícone `CloudDownloadIcon`) que abre o diálogo.
   - Se não houver conexões, o botão leva o usuário a `/connections` (ou abre o diálogo com aviso "cadastre uma conexão primeiro").
   - O badge de `sourceType` na tabela já renderiza `bigquery` automaticamente (`DataPage.tsx:163`).

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run build` sem erros

Manuais:
- [ ] "Importar do BigQuery" → escolher conexão → SQL → "Pré-visualizar" mostra linhas
- [ ] "Importar" cria o dataset; ele aparece na lista de Data com tipo `bigquery`
- [ ] Abrir o dataset em Planilhas → dados carregam; usar em Dashboards → vira gráfico
- [ ] Reload → o dataset BQ persiste (veio do Postgres)

---

### Fase 6 — Verificação E2E com o JSON real

**Objetivo**: Validar o caminho completo com a conta de serviço e dados reais do usuário.

**Mudanças**: nenhuma (apenas verificação).

**Critérios de Sucesso**:

Manuais:
- [ ] Cadastrar a conexão real → "Testar" verde
- [ ] Rodar uma query real do projeto do usuário → preview correto
- [ ] Importar → dataset com nº de linhas/colunas esperado
- [ ] Construir um dashboard sobre o dataset BQ e salvar; recarregar → tudo persiste
- [ ] Em repouso, `SELECT credentials FROM connections` retorna texto cifrado (não JSON legível)

---

## Notas de Implementação

- **openetl descartado**: a v1.0.12 só traz adapters HubSpot e PostgreSQL; um adapter BQ
  seria código novo sobre `@google-cloud/bigquery` de qualquer forma. Para "rodar query →
  armazenar snapshot", o client direto é mais simples. A estrutura de `connections` deixa a
  porta aberta para um modelo de conectores mais rico (incl. um runtime ETL) no futuro.
- **Segredo nunca trafega de volta**: nenhuma rota retorna `credentials`; a UI só recebe
  `config` (projectId/clientEmail). O JSON é cifrado com AES-256-GCM antes do `INSERT`.
- **`CONNECTIONS_SECRET`**: em produção deve ser um segredo forte injetado por env. O default
  `dev-insecure-secret` só serve para desenvolvimento local.
- **Convenção `col_<index>`**: a ingestão devolve `columns` na ordem do schema do BQ, então
  `buildDataSource.ts` continua funcionando sem alteração.
- **Limites**: preview = 50 linhas; ingest = 50k linhas (alinhado ao `express.json({limit:'50mb'})`).
  Datasets maiores ficam para uma fase futura (paginação/streaming, fora de escopo).
- **Permissão da SA**: a fronteira de segurança real é a permissão do service account —
  recomenda-se conceder **somente leitura** ao BigQuery.
- **Coerção de tipos**: wrappers do BQ (`BigQueryTimestamp`, `BigQueryDate`, `BigQueryInt`,
  `Numeric`) são objetos `{ value }`; `coerce()` os reduz a string/number para o `jsonb`.

## Questões em Aberto

Nenhuma — todas as decisões foram tomadas (client direto, credenciais cifradas no banco,
SQL→snapshot, estrutura de connections genérica).
