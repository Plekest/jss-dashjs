# Plano de Implementação: Persistência + Seção "Data" (Datasets compartilhados)

## Visão Geral

Hoje o app é 100% client-side e **não persiste dados**: planilhas vivem só em memória (`sheetsStore.tsx:28`) e dashboards em `localStorage` (`dashboardsStorage.ts:3`). Este plano introduz um **backend Node + Express + PostgreSQL** (via `docker-compose`) e o conceito de **Dataset** — uma base de dados enviada uma única vez na nova seção **"Data"** e compartilhada por **Planilhas** e **Dashboards** sem reenvio.

Fluxo alvo:
1. Usuário abre a seção **Data** no menu lateral e sobe um arquivo (CSV, `.xlsx`, JSON ou TSV).
2. O arquivo é parseado no browser, normalizado para `{ name, sourceType, columns, data }` e salvo no Postgres via API.
3. O dataset aparece na lista da seção Data, podendo ser **mantido ou apagado**.
4. Em **Planilhas**, o usuário escolhe um dataset, edita as células e clica **Salvar** → o dataset é reescrito no banco (round-trip).
5. Em **Dashboards**, o mesmo dataset aparece no seletor de fonte e alimenta os charts.
6. Tudo sobrevive a reloads e é compartilhado entre as duas seções.

---

## Análise do Estado Atual

### Não há backend nem persistência real
- **Nenhum servidor existe.** O projeto é só Vite + React (`package.json:6-9`, `vite.config.ts`).
- **Planilhas em memória:** `src/stores/sheetsStore.tsx:28` (`useState<Sheet[]>([])`) — recarregar a página zera tudo.
- **Dashboards em `localStorage`:** `src/lib/dashboardsStorage.ts:3` (chave `jss_dashboards`) — preso ao navegador, não compartilhável.
- **Upload só CSV:** `src/pages/SheetsPage.tsx:21-45` parseia CSV com `papaparse` no browser.

### Sheets e Dashboards já se conectam — mas de forma frágil
- `src/pages/DashboardEditorPage.tsx:36-42` lê o `sheetsStore` e seleciona `sheet:<id>`.
- `src/lib/buildDataSource.ts:54` converte um `Sheet` em `DashJsDataSource` (`listFields` + `getChartData`).
- Como a fonte mora em memória, ao recarregar o editor de dashboard perde os dados.

### Menu lateral
- `src/layout/AppShell.tsx:24-27` define `navItems` com apenas **Planilhas** e **Dashboards**. Não há entrada "Data".

### Tipos relevantes do dashjs
- `buildDataSource.ts:1` importa `DashJsDataSource, DataField, ChartDataSeries, DashboardChartRecord, DashboardFilter` de `dashjs`.
- `dashboardsStorage.ts:1` importa `DashboardFull` de `dashjs` — é o objeto que o `onSave` do dashjs entrega e que será persistido como `jsonb`.

---

## Estado Final Desejado

- `docker-compose up` sobe **Postgres** (e a **API**) com o schema já criado.
- A API expõe CRUD de `/api/datasets` e `/api/dashboards`.
- O menu lateral tem **3 itens**: Data, Planilhas, Dashboards.
- A seção **Data** lista datasets do banco, permite upload multi-tipo e delete.
- **Planilhas** carrega um dataset, edita e salva de volta no banco.
- **Dashboards** consome datasets via API e persiste a definição no banco.
- Reload do navegador **não perde nada**; datasets são compartilhados entre as seções.

### Como verificar o estado final
- `docker-compose up -d` sobe sem erro; `docker-compose ps` mostra `db` (e `api`) saudáveis.
- `curl localhost:3001/api/datasets` retorna `[]` (ou os datasets existentes).
- Subir um `.xlsx` em Data → aparece na lista → aparece no seletor de Planilhas **e** de Dashboards.
- Editar planilha + Salvar → recarregar → edição persistiu.
- Criar gráfico no dashboard usando o dataset → recarregar → dashboard e dados persistem.

### Descobertas Chave
- `src/components/JssMount.tsx:23-50` monta o grid com `deps: []` e usa `key={activeSheet.id}` no pai (`SheetsPage.tsx:215`) para forçar re-montagem ao trocar de fonte — manteremos esse padrão usando `key={dataset.id}`.
- `src/components/DashjsMount.tsx:18-24` monta o dashjs com `deps: []` e `optionsRef` — o `onSave` em `options` deve apontar para a função de PUT na API.
- `buildDataSource.ts` usa colunas no formato `col_<index>` — a estrutura `{ columns, data }` do Dataset deve preservar essa convenção para não quebrar `getChartData`.
- O parsing multi-tipo fica **no cliente** (reaproveita `papaparse`; adiciona `xlsx` para Excel); o backend só **armazena** o payload normalizado — backend fino e sem dependências de parsing.

---

## Arquitetura Alvo

```
docker-compose
├── db   (postgres:16)         → volume pgdata, init.sql aplicado no boot
└── api  (node:20, server/)    → Express + pg, porta 3001

server/
├── Dockerfile
├── db/init.sql                → CREATE TABLE datasets, dashboards
├── src/
│   ├── index.ts               → bootstrap Express, CORS, json
│   ├── db.ts                  → pool pg (DATABASE_URL)
│   └── routes/
│       ├── datasets.ts        → GET/POST/PUT/DELETE /api/datasets
│       └── dashboards.ts      → GET/POST/PUT/DELETE /api/dashboards

src/ (frontend)
├── lib/
│   ├── api.ts                 → fetch wrappers tipados
│   ├── parseFile.ts           → CSV/TSV/XLSX/JSON → { columns, data }
│   └── buildDataSource.ts     → (existente) agora recebe Dataset
├── stores/
│   └── datasetsStore.tsx      → estado async via API (substitui sheetsStore)
├── pages/
│   ├── DataPage.tsx           → NOVA seção: upload + lista + delete
│   ├── SheetsPage.tsx         → usa datasetsStore + botão Salvar
│   ├── DashboardsPage.tsx     → CRUD via API
│   └── DashboardEditorPage.tsx→ fonte = dataset da API; onSave = PUT
└── layout/AppShell.tsx        → + nav item "Data"
```

### Modelo de dados (Dataset central)

```ts
interface Dataset {
  id: string                 // uuid (gerado pelo banco)
  name: string
  sourceType: 'csv' | 'xlsx' | 'json' | 'tsv'
  columns: { title: string }[]
  data: (string | number)[][]
  rowCount: number
  createdAt: string
  updatedAt: string
}
```

`Planilha` e `Dashboard` **não duplicam dados** — referenciam `dataset.id`.

---

## Fases de Implementação

### Fase 1 — Infra: docker-compose + Postgres + schema

**Objetivo**: Subir o Postgres em container com o schema criado no boot.

**Mudanças**:

1. `docker-compose.yml` (raiz) — serviços `db` e `api`:
   ```yaml
   services:
     db:
       image: postgres:16
       environment:
         POSTGRES_USER: jss
         POSTGRES_PASSWORD: jss
         POSTGRES_DB: jss_dashjs
       ports: ["5432:5432"]
       volumes:
         - pgdata:/var/lib/postgresql/data
         - ./server/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U jss -d jss_dashjs"]
         interval: 5s
         retries: 10
     api:
       build: ./server
       environment:
         DATABASE_URL: postgres://jss:jss@db:5432/jss_dashjs
         PORT: 3001
       ports: ["3001:3001"]
       depends_on:
         db: { condition: service_healthy }
   volumes:
     pgdata:
   ```

2. `server/db/init.sql` — schema:
   ```sql
   CREATE EXTENSION IF NOT EXISTS "pgcrypto";

   CREATE TABLE IF NOT EXISTS datasets (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name        text NOT NULL,
     source_type text NOT NULL,
     columns     jsonb NOT NULL DEFAULT '[]',
     data        jsonb NOT NULL DEFAULT '[]',
     row_count   integer NOT NULL DEFAULT 0,
     created_at  timestamptz NOT NULL DEFAULT now(),
     updated_at  timestamptz NOT NULL DEFAULT now()
   );

   CREATE TABLE IF NOT EXISTS dashboards (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name        text NOT NULL,
     definition  jsonb NOT NULL,          -- DashboardFull do dashjs
     dataset_id  uuid REFERENCES datasets(id) ON DELETE SET NULL,
     created_at  timestamptz NOT NULL DEFAULT now(),
     updated_at  timestamptz NOT NULL DEFAULT now()
   );
   ```

**Critérios de Sucesso**:

Automatizados:
- [x] `docker-compose up -d db` sobe sem erro
- [x] `docker-compose exec db psql -U jss -d jss_dashjs -c "\dt"` lista `datasets` e `dashboards`

Manuais:
- [x] `docker-compose ps` mostra `db` com status `healthy`

---

### Fase 2 — Backend API (Express + pg)

**Objetivo**: CRUD de datasets e dashboards sobre o Postgres.

**Mudanças**:

1. `server/package.json` — deps: `express`, `pg`, `cors`; dev: `tsx`, `typescript`, `@types/express`, `@types/pg`, `@types/cors`. Scripts: `"dev": "tsx watch src/index.ts"`, `"start": "tsx src/index.ts"`.

2. `server/Dockerfile`:
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm install
   COPY . .
   EXPOSE 3001
   CMD ["npm", "start"]
   ```

3. `server/src/db.ts` — pool:
   ```ts
   import { Pool } from 'pg'
   export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
   ```

4. `server/src/index.ts` — bootstrap:
   ```ts
   import express from 'express'
   import cors from 'cors'
   import datasets from './routes/datasets'
   import dashboards from './routes/dashboards'

   const app = express()
   app.use(cors())
   app.use(express.json({ limit: '50mb' })) // datasets podem ser grandes
   app.use('/api/datasets', datasets)
   app.use('/api/dashboards', dashboards)
   app.get('/api/health', (_req, res) => res.json({ ok: true }))
   app.listen(Number(process.env.PORT ?? 3001))
   ```

5. `server/src/routes/datasets.ts` — endpoints:
   - `GET /` → lista metadados (sem `data`, para ser leve): `SELECT id,name,source_type,row_count,created_at,updated_at`
   - `GET /:id` → dataset completo (com `data`)
   - `POST /` → body `{ name, sourceType, columns, data }`; calcula `row_count = data.length`; `INSERT ... RETURNING *`
   - `PUT /:id` → reescreve `name,columns,data,row_count,updated_at = now()` (usado pelo "Salvar" da planilha)
   - `DELETE /:id`

6. `server/src/routes/dashboards.ts` — endpoints análogos:
   - `GET /` (metadados), `GET /:id` (definition completa), `POST /`, `PUT /:id`, `DELETE /:id`
   - `definition` guarda o `DashboardFull` do dashjs; `dataset_id` referencia o dataset usado.

**Critérios de Sucesso**:

Automatizados:
- [x] `curl -s localhost:3001/api/health` → `{"ok":true}`
- [x] `curl -XPOST localhost:3001/api/datasets -H 'content-type: application/json' -d '{"name":"t","sourceType":"csv","columns":[{"title":"a"}],"data":[[1]]}'` retorna o registro com `id`
- [x] `curl -s localhost:3001/api/datasets` lista o registro criado
- [x] `curl -XDELETE localhost:3001/api/datasets/<id>` remove (GET seguinte some)

Manuais:
- [ ] Reiniciar o container `api` → dados persistem (volume `pgdata`)

---

### Fase 3 — Cliente API + datasetsStore

**Objetivo**: Substituir o `sheetsStore` em memória e o `localStorage` por chamadas ao backend.

**Mudanças**:

1. `vite.config.ts` — proxy para a API:
   ```ts
   server: {
     port: 5173,
     proxy: { '/api': 'http://localhost:3001' },
   }
   ```

2. `src/lib/api.ts` — wrappers tipados:
   ```ts
   export interface DatasetMeta { id: string; name: string; sourceType: string; rowCount: number; updatedAt: string }
   export interface Dataset extends DatasetMeta { columns: { title: string }[]; data: (string|number)[][] }

   export const datasetsApi = {
     list: () => fetch('/api/datasets').then(r => r.json()) as Promise<DatasetMeta[]>,
     get: (id: string) => fetch(`/api/datasets/${id}`).then(r => r.json()) as Promise<Dataset>,
     create: (d: Omit<Dataset,'id'|'rowCount'|'updatedAt'>) =>
       fetch('/api/datasets', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(d) }).then(r => r.json()) as Promise<Dataset>,
     update: (id: string, d: Partial<Dataset>) =>
       fetch(`/api/datasets/${id}`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(d) }).then(r => r.json()) as Promise<Dataset>,
     remove: (id: string) => fetch(`/api/datasets/${id}`, { method:'DELETE' }),
   }
   // dashboardsApi análogo
   ```

3. `src/stores/datasetsStore.tsx` — Context async (substitui `sheetsStore.tsx`):
   - Estado: `datasets: DatasetMeta[]`, `activeDatasetId`, `activeDataset: Dataset | null` (carregado sob demanda via `datasetsApi.get`).
   - Ações: `refresh()`, `createDataset(payload)`, `updateDataset(id, {columns,data})`, `removeDataset(id)`, `setActiveDataset(id)`.
   - `useEffect` no provider chama `refresh()` no mount.

4. `src/App.tsx:14` — trocar `SheetsProvider` por `DatasetsProvider`.

5. `src/lib/dashboardsStorage.ts` → migrar funções para usar `dashboardsApi` (manter assinaturas `listDashboards/loadDashboard/saveDashboard/deleteDashboard/createEmptyDashboard`, agora assíncronas). `createEmptyDashboard` continua puro (não persiste).

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run build` compila sem erros de tipo

Manuais:
- [ ] DevTools → Network mostra `GET /api/datasets` ao carregar o app
- [ ] Nenhuma escrita em `localStorage` para datasets/dashboards

---

### Fase 4 — Seção "Data" (upload multi-tipo + lista + delete)

**Objetivo**: Nova área no menu lateral para subir, listar, manter e apagar bases de dados.

**Mudanças**:

1. `src/layout/AppShell.tsx:24-27` — adicionar nav item (ícone `StorageIcon`):
   ```tsx
   const navItems = [
     { label: 'Data', path: '/data', icon: <StorageIcon /> },
     { label: 'Planilhas', path: '/sheets', icon: <TableChartIcon /> },
     { label: 'Dashboards', path: '/dashboards', icon: <DashboardIcon /> },
   ]
   ```

2. `src/App.tsx` — rota `<Route path="data" element={<DataPage />} />` e redirect inicial para `/data`.

3. `src/lib/parseFile.ts` — parser multi-tipo → `{ sourceType, columns, data }`:
   ```ts
   // .csv  → Papa.parse(delimiter: ',')
   // .tsv  → Papa.parse(delimiter: '\t')
   // .json → JSON.parse → array de objetos: headers = chaves do 1º; data = valores
   // .xlsx → import * as XLSX (SheetJS): sheet_to_json(header:1)
   ```
   - Reaproveita a lógica de coerção numérica de `SheetsPage.tsx:30-33`.
   - Adicionar dependência `xlsx` (SheetJS) ao `package.json`.

4. `src/pages/DataPage.tsx` — UI:
   ```
   ┌───────────────────────────────────────────────┐
   │ Data                         [↑ Enviar arquivo] │
   ├───────────────────────────────────────────────┤
   │  Nome          Tipo   Linhas   Atualizado   🗑  │
   │  vendas.xlsx   xlsx   1.240    há 2 min     🗑  │
   │  leads.csv     csv    830      ontem        🗑  │
   └───────────────────────────────────────────────┘
   ```
   - `<input type="file" accept=".csv,.tsv,.json,.xlsx">` → `parseFile` → `datasetsStore.createDataset` → `refresh`.
   - Cada linha tem botão de remover com `confirm()` → `datasetsStore.removeDataset`.
   - Estado vazio com call-to-action "Envie sua primeira base de dados".

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run build` sem erros

Manuais:
- [ ] Menu lateral mostra **Data / Planilhas / Dashboards**
- [ ] Subir `.csv`, `.tsv`, `.json` e `.xlsx` → todos aparecem na lista com tipo e nº de linhas corretos
- [ ] Apagar um dataset → some da lista e do banco; recarregar confirma

---

### Fase 5 — Planilhas ↔ Dataset (carregar + Salvar)

**Objetivo**: Planilhas passa a ler datasets do banco e gravar edições com um botão **Salvar**.

**Mudanças**:

1. `src/pages/SheetsPage.tsx` — refatorar:
   - Sidebar lista **datasets** (de `datasetsStore.datasets`), não mais sheets em memória.
   - Selecionar um dataset → `setActiveDataset(id)` carrega `activeDataset` (com `data`) via API.
   - `<JssMount key={activeDataset.id} data={...} columns={...} onDataChange={...}>` — mantém o padrão de `key` por id (hoje em `SheetsPage.tsx:215`).
   - **Remover** o upload de CSV daqui (migra para a seção Data); manter botão "Abrir Data" que navega para `/data`.
   - Adicionar **botão "Salvar"** no topo: pega o `data` atual do grid (estado local atualizado via `onDataChange`) e chama `datasetsStore.updateDataset(id, { columns, data })`. Indicar estado "salvo / não salvo".

2. `onDataChange` continua atualizando um estado local (`pendingData`); o **Salvar** é explícito (decisão do usuário), evitando PUT a cada tecla.

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run build` sem erros

Manuais:
- [ ] Abrir Planilhas → escolher um dataset enviado em Data → grid carrega os dados
- [ ] Editar célula → indicador muda para "não salvo"
- [ ] Clicar **Salvar** → recarregar a página → edição persistiu
- [ ] O mesmo dataset editado reflete no Dashboard (após reabrir)

---

### Fase 6 — Dashboards ↔ Dataset (fonte compartilhada + persistência DB)

**Objetivo**: Dashboards consome datasets via API e persiste a definição no Postgres.

**Mudanças**:

1. `src/pages/DashboardsPage.tsx` — trocar as chamadas síncronas de `dashboardsStorage` por `dashboardsApi` (`reload` async; `handleCreate` faz POST e navega; `handleDelete` faz DELETE).

2. `src/pages/DashboardEditorPage.tsx`:
   - Seletor de fonte lista **datasets** (de `datasetsStore`), valor `dataset:<id>`.
   - Ao escolher, carrega o `Dataset` completo via `datasetsApi.get` e monta `dataSource` com `buildDataSource`.
   - `buildDataSource.ts:54` — ajustar a assinatura para receber `Dataset` (mesma forma `{ columns, data }` que `Sheet`; mudança mínima ou só troca de tipo).
   - `options.onSave` → `dashboardsApi.update(id, { definition: d, datasetId })` (substitui `saveDashboard` localStorage em `DashboardEditorPage.tsx:48`).
   - `dashboard` inicial vem de `dashboardsApi.get(id)`; manter `key={id}` no `DashjsMount`.

3. Remover a opção GA4 desabilitada ou mantê-la — **manter** (fora de escopo deste plano; não conflita).

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run build` sem erros

Manuais:
- [ ] Criar dashboard → recarregar → dashboard persiste (vindo do banco, não localStorage)
- [ ] No editor, selecionar um dataset enviado em Data → campos aparecem no painel de dados do dashjs
- [ ] Criar gráfico de barras com colunas do dataset → barras renderizam
- [ ] Salvar no dashjs → recarregar → gráfico e fonte persistem
- [ ] Dataset enviado uma vez aparece **tanto** em Planilhas **quanto** no seletor do Dashboard, sem reenvio

---

## Notas de Implementação

- **Parsing no cliente, storage fino no servidor**: o backend nunca interpreta arquivos — recebe `{ columns, data }` já normalizado. Isso evita libs de parsing no servidor e mantém o `papaparse`/`xlsx` no front, onde já há infraestrutura.
- **Tamanho de payload**: datasets grandes podem estourar o default do `express.json`. Por isso `limit: '50mb'`. Para bases muito grandes (>50MB), uma fase futura migraria de `jsonb` único para tabela de linhas — fora de escopo aqui.
- **Convenção `col_<index>`**: `buildDataSource.ts` depende de IDs `col_0, col_1, ...`. O Dataset preserva ordem de colunas em `columns[]`, então a convenção continua válida sem mudanças no dashjs.
- **`key` por id**: tanto `JssMount` quanto `DashjsMount` montam com `deps: []`. Trocar de dataset exige `key={id}` no componente pai para forçar re-montagem limpa (padrão já usado em `SheetsPage.tsx:215`).
- **CORS**: em dev o Vite faz proxy de `/api`; em produção a API serve com `cors()` aberto. Restringir origem é endurecimento futuro.
- **StrictMode**: o `useEffect` de carregamento no `datasetsStore` roda 2x em dev — `refresh()` é idempotente (só re-lê a lista), então é seguro.
- **Migração de dados existentes**: dashboards hoje em `localStorage` **não** são migrados automaticamente (escopo: começar limpo no banco). Se necessário, um script de importação pode ser adicionado depois.

---

## Questões em Aberto

Nenhuma — todas as decisões foram tomadas (stack PostgreSQL, tipos CSV/XLSX/JSON/TSV, dataset central compartilhado, Salvar reescreve o dataset).
