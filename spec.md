# Plano de Implementação: Conector Postgres, Templates/Galeria, Brand Kit (paleta por dashboard)

## Visão Geral

Implementar as 3 próximas features do `ROADMAP-studio.md` ("Próximos 3 (nova rodada)"): (1) um segundo conector de dados SQL genérico — Postgres — generalizando a arquitetura hoje acoplada a BigQuery; (2) uma galeria de templates de dashboard com dado de exemplo embutido, como ponto de partida além de "em branco"; (3) uma paleta de cores de série por dashboard ("brand kit"), que vira o default de todo gráfico do dashboard que não tiver cor própria.

**Decisões tomadas (confirmadas com o usuário antes deste plano):**
1. Conector novo: **Postgres** (reaproveita driver `pg` já instalado no server, mesmo modelo de SQL arbitrário do BigQuery).
2. Templates vêm **com dado de exemplo embutido** — dashboard funciona sozinho assim que criado, sem exigir dataset do usuário.
3. Templates ficam **hardcoded no app** (biblioteca estática TS), sem tabela nova no banco nem UI de gerenciamento.
4. Brand kit = **paleta de séries por dashboard** (lista de cores que vira default de todo gráfico sem paleta própria). Não mexe nas cores de chrome do editor (`--dashjs-accent` etc).

## Análise do Estado Atual

Arquitetura: app React em `/home/fernandes/jss_dashjs` (rotas, CRUD, MUI chrome) + core package `dashjs` em `/home/fernandes/jspreadsheet/dashjs` (editor/engine, mounted via `src/components/DashjsMount.tsx`) + server Express em `/home/fernandes/jss_dashjs/server`.

**Conectores — o que existe e o que está acoplado a BigQuery:**
- `server/db/init.sql` — tabela `connections` já é agnóstica de tipo: `id, name, type text, config jsonb, credentials text`. Nenhuma migração de schema é necessária para o novo conector.
- `server/src/crypto.ts` — AES-256-GCM sobre uma string plana (JSON serializado). Já reutilizável para qualquer shape de credencial.
- `server/src/bigquery.ts` — único client hoje. `clientFor(connectionId)` busca a connection, decripta credenciais, instancia `new BigQuery(...)`. `runQuery(connectionId, sql, maxRows)` retorna `{ columns: {title}[], data: (string|number)[][] }` — formato de retorno já é agnóstico de fonte.
- `server/src/routes/connections.ts:29-66` (`POST /`) — parsing de credenciais **hardcoded para shape service-account** (exige `project_id`, `client_email`, `private_key`). `POST /:id/ingest` (linha 99-114, pós Fase 2) chama `insertDataset(name, 'bigquery', ...)` — **`'bigquery'` é um literal fixo**, não deriva do tipo real da conexão.
- `server/src/routes/datasets.ts` — `refreshDataset(id)` (adicionado na rodada anterior) importa `runQuery` direto de `./bigquery.js` — o refresh agendado só funciona pra BigQuery hoje, mesmo a tabela `datasets` já guardando `connection_id` de forma agnóstica.
- `src/lib/api.ts:54-61` — `ConnectionMeta.config: { projectId?, clientEmail?, location? }` tipado só com campos BigQuery. `connectionsApi.create` (linha 66) tem `type: 'bigquery'` como literal fixo, não union.
- `src/pages/ConnectionsPage.tsx` — formulário sem seletor de tipo (`form = {name, credentials, location}`, linha 32); título fixo "Nova conexão BigQuery" (linha 311); `handleCreate` (linha 99-121) manda `type: 'bigquery'` fixo (linha 109); painel de detalhe mostra `config.projectId`/`config.clientEmail` fixos (linhas 258-265).
- `src/components/ImportBigQueryDialog.tsx:56` — filtra conexões com `c.type === 'bigquery'`; resto do fluxo (preview → tabela → nome do dataset → refresh interval) já é 100% agnóstico de conector, só a UI/nome do componente é acoplada.
- `server/package.json` — `pg ^8.13.0` já instalado (usado hoje só para o Postgres **interno** da própria app, via `server/src/db.ts`). Nenhuma dependência nova precisa ser instalada.

**Templates/galeria — o que existe:**
- `src/pages/DashboardsPage.tsx:154-178` — dialog "Novo Dashboard" pede só um nome (`TextField`, linha 157-165); `handleCreate` (linha 52-63) chama `createAndSaveDashboard(newName.trim())` e navega pro editor. Não há escolha de ponto de partida.
- `src/lib/dashboardsStorage.ts:36-50` — `createEmptyDashboard(name)` gera um `DashboardFull` com `dashboard_id: Date.now()`, uma página vazia (`charts: []`), sem dataset embutido. `createAndSaveDashboard(name)` (linha 52-56) chama isso e persiste via `dashboardsApi.create`.
- `/home/fernandes/jspreadsheet/dashjs/src/core/domain.ts:328-343` — `DashboardFull` exige só `pages: DashboardPageRecord[]` (herdado de `DashboardRecord`, que exige `dashboard_id`/`dashboard_name`); `dataset?: DashboardDataset` é opcional e pode vir com `rows` embutidas (linha 339) — é o mecanismo que o modo CSV/import já usa (`this.csvData` em `DashboardEditor.ts`), então um template com dataset embutido funciona exatamente como um dashboard que importou um CSV.
- Não existe nenhum dataset de demonstração no repo hoje (confirmado por busca — zero arquivos de seed/sample/demo em `src/` ou `server/`).
- `server/db/init.sql` / `server/src/routes/dashboards.ts:22-32` (`POST /`) — `definition jsonb` já aceita qualquer `DashboardFull`, incluindo um clonado de um template. Nenhuma mudança de schema necessária.

**Brand kit — o que existe:**
- Dois sistemas de cor **completamente independentes** hoje:
  1. Chrome do editor: 9 CSS custom properties (`--dashjs-bg`, `--dashjs-accent` etc.) definidas em `/home/fernandes/jspreadsheet/dashjs/src/styles/dashjs.css:6-41`, binário light/dark via atributo `data-dashjs-theme`. **Fora do escopo desta feature** (não mexer).
  2. Cores de série: `ChartConfig.colors?: { palette: string[] }` (`domain.ts:210`, aprox.) — já existe **por gráfico individual**, editado via swatches em `DashboardEditor.ts:3925-3937` (`data-style="palette"` inputs, escreve em `cfg.colors.palette[idx]`). Consumido por `paletteFor(config)` em `/home/fernandes/jspreadsheet/dashjs/src/core/charts/palette.ts:15-18`: retorna `config.colors.palette` se não vazio, senão `DEFAULT_PALETTE` (array fixo de 8 hex, linha 4-13).
- `paletteFor` é chamado ~15x em `renderChart.ts`, sempre com `chart.dashboard_chart_config` — não há nenhum ponto hoje onde a cor "cai" pro nível do dashboard inteiro; cada gráfico sem paleta própria usa sempre o mesmo `DEFAULT_PALETTE` global do pacote.
- `menuModel.ts:179-186` (menu "Resource") já tem um padrão pronto pra pendurar essa feature: `manageBlends`, `manageFilters`, `calcFields` e `theme` (esse último é só o toggle light/dark, apesar do nome "Theme and layout" — não confundir com brand kit) — todos abrem modais/popovers via `MenuActions` injetadas em `DashboardEditor.ts:706-755`.

## Estado Final Desejado

Um usuário pode: (1) cadastrar uma conexão Postgres do mesmo jeito que cadastra BigQuery hoje (formulário muda os campos conforme o tipo escolhido), rodar preview/ingest de SQL arbitrário e ter refresh agendado funcionando igual; (2) ao criar um dashboard, escolher entre "Em branco" ou um dos templates prontos (com dado de exemplo já carregado, gráficos já montados); (3) abrir "Chart color palette" no menu Resource de qualquer dashboard, definir uma lista de cores, e ver todo gráfico daquele dashboard que não tenha uma paleta própria (setada manualmente na aba Style) usar essas cores.

Verificação: ver "Critérios de Sucesso" em cada fase abaixo.

## Fases de Implementação

---

### Fase 1: Conector Postgres

**Objetivo**: segundo conector de dados SQL, ao lado do BigQuery, reaproveitando o máximo de infraestrutura já existente (schema `connections`, criptografia, UI de preview/ingest, refresh agendado).

**Mudanças:**

1. `server/src/postgres.ts` (novo arquivo) — client Postgres simétrico a `bigquery.ts`:
   ```ts
   import pg from 'pg'
   import { pool } from './db.js'
   import { decrypt } from './crypto.js'

   interface PostgresCredentials {
     host: string; port: number; user: string; password: string; database: string; ssl?: boolean
   }

   async function clientFor(connectionId: string): Promise<pg.Client> {
     const { rows } = await pool.query('SELECT * FROM connections WHERE id=$1', [connectionId])
     if (!rows.length) throw new Error('connection not found')
     const creds = JSON.parse(decrypt(rows[0].credentials)) as PostgresCredentials
     return new pg.Client({
       host: creds.host, port: creds.port, user: creds.user, password: creds.password,
       database: creds.database, ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
     })
   }

   function coerce(value: unknown): string | number {
     if (value === null || value === undefined) return ''
     if (typeof value === 'number') return value
     if (value instanceof Date) return value.toISOString()
     return String(value)
   }

   export async function runQuery(connectionId: string, sql: string, maxRows = 50_000) {
     const client = await clientFor(connectionId)
     await client.connect()
     try {
       // Postgres não tem um "maxResults" de client como o BigQuery — envolve a
       // query do usuário numa subquery com LIMIT pra garantir o mesmo teto,
       // mesmo que o SQL original não tenha (ou tenha) um LIMIT próprio.
       const capped = `SELECT * FROM (${sql.replace(/;\s*$/, '')}) AS dashjs_subquery LIMIT $1`
       const result = await client.query(capped, [maxRows])
       const columns = result.fields.map((f) => ({ title: f.name }))
       const data = result.rows.map((row) => columns.map((c) => coerce(row[c.title])))
       return { columns, data }
     } finally {
       await client.end()
     }
   }
   ```

2. `server/src/queryEngine.ts` (novo arquivo) — dispatcher por `type`, único ponto que os callers (`connections.ts`, `datasets.ts`) devem importar daqui pra frente em vez de `bigquery.ts` direto:
   ```ts
   import { pool } from './db.js'
   import * as bigquery from './bigquery.js'
   import * as postgres from './postgres.js'

   export async function runQuery(connectionId: string, sql: string, maxRows = 50_000) {
     const { rows } = await pool.query('SELECT type FROM connections WHERE id = $1', [connectionId])
     if (!rows.length) throw new Error('connection not found')
     switch (rows[0].type) {
       case 'bigquery': return bigquery.runQuery(connectionId, sql, maxRows)
       case 'postgres': return postgres.runQuery(connectionId, sql, maxRows)
       default: throw new Error(`unsupported connection type: ${rows[0].type}`)
     }
   }
   ```

3. `server/src/routes/connections.ts`:
   - Trocar o import `import { runQuery } from '../bigquery.js'` por `import { runQuery } from '../queryEngine.js'`.
   - `POST /` (hoje linhas 29-66) — branch de validação/montagem de `config`/`credentials` por `type`:
     ```ts
     let config: Record<string, unknown>
     let credsToEncrypt: string
     if (type === 'bigquery') {
       // ...lógica atual de service-account (project_id/client_email/private_key), inalterada
     } else if (type === 'postgres') {
       const { host, port, user, password, database, ssl } = credentials as Record<string, unknown>
       if (!host || !user || !database) {
         return res.status(400).json({ error: 'credentials must contain host, user, database' })
       }
       config = { host, port: port ?? 5432, database, ssl: !!ssl }
       credsToEncrypt = JSON.stringify({ host, port: port ?? 5432, user, password, database, ssl: !!ssl })
     } else {
       return res.status(400).json({ error: `unsupported connection type: ${type}` })
     }
     ```
     Nota: pra Postgres, `credentials` chega do frontend como objeto (não string JSON colada como no BigQuery) — o form muda de "cole o JSON" pra campos separados (host/port/user/senha/database/ssl).
   - `POST /:id/ingest` (hoje linha 99-114) — buscar o `type` real da conexão antes de chamar `insertDataset`, em vez do literal `'bigquery'`:
     ```ts
     const { rows: connRows } = await pool.query('SELECT type FROM connections WHERE id=$1', [req.params.id])
     const connType = connRows[0]?.type ?? 'unknown'
     const dataset = await insertDataset(name, connType, columns, data, { connectionId: req.params.id, sourceSql: sql, refreshIntervalMinutes: refreshIntervalMinutes ?? null })
     ```

4. `server/src/routes/datasets.ts` — trocar `import { runQuery } from '../bigquery.js'` por `import { runQuery } from '../queryEngine.js'` em `refreshDataset()`, pra que o refresh agendado funcione também pra datasets vindos de Postgres (a função já é agnóstica de tipo — só lê `connection_id`/`source_sql` da tabela `datasets`).

5. `src/lib/api.ts`:
   - `ConnectionMeta.config` vira `Record<string, unknown>` (deixa de ser tipado só pra campos BigQuery — cada tela lê os campos que espera pro seu `type`).
   - `connectionsApi.create(d: { name: string; type: 'bigquery' | 'postgres'; credentials: string | Record<string, unknown>; location?: string })`.

6. `src/pages/ConnectionsPage.tsx`:
   - Novo `Select` de tipo (`bigquery` / `postgres`) no dialog de criação, antes dos campos de credencial.
   - Quando `type === 'postgres'`: troca a `TextField` multiline de "Service Account JSON" por campos `host`, `port`, `user`, `password` (type="password"), `database`, checkbox `ssl`.
   - Painel de detalhe: mostra `config.projectId`/`config.clientEmail` só se `selected.type === 'bigquery'`; mostra `config.host`/`config.database` se `selected.type === 'postgres'`.

7. `src/components/ImportBigQueryDialog.tsx` → renomear para `ImportSqlDialog.tsx`:
   - Linha 56: trocar `connections.filter((c) => c.type === 'bigquery')` por `connections.filter((c) => c.type === 'bigquery' || c.type === 'postgres')`.
   - Título do dialog e textos de estado vazio deixam de mencionar só "BigQuery" (ex: "Importar via SQL", "Nenhuma conexão SQL cadastrada").
   - `src/pages/DataPage.tsx` — atualizar o import e o label do botão ("Importar do BigQuery" → "Importar via SQL").

**Critérios de Sucesso:**

Automatizados:
- [x] `tsc --noEmit` no server sem erros
- [x] `tsc --noEmit` e `npm run build` no React app sem erros

Manuais:
- [x] Cadastrar uma conexão Postgres real (host/porta/user/senha/database de um banco de teste) → "Testar conexão" retorna sucesso
- [x] Preview de uma query SQL nessa conexão retorna linhas/colunas certas
- [x] Ingest cria um dataset com `sourceType: 'postgres'` (não `'bigquery'`)
- [x] `POST /:id/refresh-now` funciona pra um dataset originado de Postgres (não só BigQuery)
- [x] Conexão BigQuery existente continua funcionando sem regressão (test/preview/ingest/refresh)

**Status: Fase 1 completa, 5/5 verificações manuais confirmadas em 2026-07-03.**

**Nota operacional**: o container `api` builda o código no `docker build` (`Dockerfile` faz `COPY . .`), sem hot-reload/volume — qualquer mudança em `server/src/*` só entra em produção local rodando `docker compose up -d --build api`. Banco de teste criado no mesmo container Postgres da app (`jss_dashjs-db-1`): database `connector_test`, tabela `sales` (6 linhas), user/senha `jss`/`jss`, host `db` (nome do serviço docker, não `localhost`, pois `api` e `db` estão na mesma rede docker-compose).

---

### Fase 2: Templates / Galeria de Dashboard

**Objetivo**: ao criar um dashboard, oferecer pontos de partida prontos (com dado de exemplo) além de "em branco".

**Mudanças:**

1. `src/lib/templates/types.ts` (novo arquivo):
   ```ts
   import type { DashboardFull } from 'dashjs'

   export interface DashboardTemplate {
     id: string
     name: string
     description: string
     /** Gera um DashboardFull fresco (novo dashboard_id) toda vez que é chamado —
      *  evita duas instâncias do mesmo template compartilharem referência. */
     build: () => DashboardFull
   }
   ```

2. `src/lib/templates/salesTemplate.ts`, `marketingTemplate.ts`, `npsTemplate.ts` (novos arquivos) — 3 templates curados, cada um exportando um `DashboardTemplate` cujo `build()` retorna um `DashboardFull` com:
   - `dataset: { source: 'import', fileName: 'demo.csv', rows: [...] }` — dado de exemplo embutido (10-30 linhas, mesmo mecanismo que o import de CSV já usa).
   - 1 página com 2-3 gráficos (ex: bar + line + kpi) já com `dashboard_chart_config.slots.dimension/metric` apontando pros campos do `rows` embutido, então renderizam de verdade assim que o dashboard abre.
   - Exemplo de estrutura (sales):
     ```ts
     export const salesTemplate: DashboardTemplate = {
       id: 'sales',
       name: 'Vendas',
       description: 'Receita por região e por mês, com KPI de total.',
       build: () => ({
         dashboard_id: Date.now(),
         dashboard_name: 'Vendas',
         pages: [{
           dashboard_page_id: 1,
           dashboard_page_name: 'Página 1',
           charts: [ /* bar (região x receita), line (mês x receita), kpi (total) */ ],
         }],
         dataset: {
           source: 'import',
           fileName: 'vendas-exemplo.csv',
           rows: [ /* linhas de exemplo */ ],
         },
       }),
     }
     ```

3. `src/lib/templates/index.ts` (novo arquivo):
   ```ts
   export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [salesTemplate, marketingTemplate, npsTemplate]
   ```

4. `src/lib/dashboardsStorage.ts` — novo `createAndSaveDashboardFromTemplate`:
   ```ts
   export async function createAndSaveDashboardFromTemplate(
     name: string,
     template: DashboardTemplate,
   ): Promise<{ id: string; dashboard: DashboardFull }> {
     const dashboard = { ...template.build(), dashboard_name: name }
     const row = await dashboardsApi.create({ name, definition: dashboard })
     return { id: row.id, dashboard }
   }
   ```

5. `src/pages/DashboardsPage.tsx` — reformular o dialog "Novo Dashboard" (hoje linhas 154-178, só um `TextField`) numa galeria:
   - Grid de cards: primeiro card "Em branco" (ícone `DashboardIcon`, fluxo atual inalterado), depois um card por item de `DASHBOARD_TEMPLATES` (nome + descrição).
   - Selecionar um card abre (ou mantém) o campo de nome, pré-preenchido com `template.name`, e no confirmar chama `createAndSaveDashboardFromTemplate(name, template)` em vez de `createAndSaveDashboard(name)` quando um template foi escolhido.

**Critérios de Sucesso:**

Automatizados:
- [x] `tsc --noEmit` e `npm run build` no React app sem erros

Manuais:
- [ ] Dashboards → Novo Dashboard → galeria mostra "Em branco" + 3 templates
- [ ] Escolher um template → editor abre com gráficos já populados com dado de exemplo (sem precisar escolher fonte de dados)
- [ ] Dashboard criado a partir de template é editável e salvável normalmente (trocar dataset, adicionar gráfico, etc — não é somente-leitura)
- [ ] Fluxo "Em branco" continua idêntico ao de hoje (sem regressão)

---

### Fase 3: Brand Kit (paleta de séries por dashboard)

**Objetivo**: uma paleta de cores salva no nível do dashboard, usada como default por todo gráfico que não tenha uma paleta própria.

**Mudanças:**

1. `/home/fernandes/jspreadsheet/dashjs/src/core/domain.ts` — novo campo em `DashboardFull` (perto da linha 343, ao lado de `dataset`/`filters`):
   ```ts
   /** Brand kit — paleta de cores default para todo gráfico do dashboard que
    *  não tiver uma paleta própria (ChartConfig.colors.palette). Editado via
    *  menu Resource ▸ Chart color palette. */
   colors?: { palette: string[] }
   ```

2. `/home/fernandes/jspreadsheet/dashjs/src/core/pages/menuModel.ts`:
   - `MenuActions` (perto da linha 88, ao lado de `theme()`): adicionar `editBrandPalette(): void`.
   - Menu `resource` (linha 179-186): novo item antes de `params`:
     ```ts
     { id: 'brandkit', label: 'Chart color palette', icon: 'palette', action: a.editBrandPalette },
     ```

3. `/home/fernandes/jspreadsheet/dashjs/src/core/pages/DashboardEditor.ts`:
   - Linha ~741 (junto de `calcFields: () => this.openCalcFieldEditor()`): adicionar `editBrandPalette: () => this.openBrandPaletteEditor(),`.
   - Novo método `openBrandPaletteEditor()` — modal via `openNativeModal` (mesmo padrão de `openCalcFieldEditor`/`openBlendBuilder`): lista de swatches (`<input type="color">` + hex), botões adicionar/remover cor, inicializado com `this.dashboard.colors?.palette ?? [...DEFAULT_PALETTE]`. Ao salvar: `this.dashboard.colors = { palette: [...cores] }`, `this.markDirty()`, `this.rerenderAllCharts()`.
   - Novo método privado, usado só internamente antes de cada `renderChart(...)`:
     ```ts
     /** Se o chart não tem paleta própria mas o dashboard tem um brand kit,
      *  injeta a paleta do dashboard na view antes de renderizar — sem
      *  mutar o chart real (this.dashboard.pages[...].charts[...]), então
      *  o fallback continua dinâmico se o brand kit mudar depois. */
     private applyBrandPalette(view: DashboardChartRecord): DashboardChartRecord {
       const hasOwnPalette = (view.dashboard_chart_config?.colors?.palette?.length ?? 0) > 0
       const brandPalette = this.dashboard.colors?.palette
       if (hasOwnPalette || !brandPalette?.length) return view
       return {
         ...view,
         dashboard_chart_config: { ...(view.dashboard_chart_config ?? {}), colors: { palette: brandPalette } },
       }
     }
     ```
   - Nos 4 pontos de `mountChart()` que chamam `renderChart(body/liveBody, view, this.renderOptionsFor(chart))` (mesmos 4 tocados na Fase 3 da rodada anterior, cross-filter), envolver `view` com `this.applyBrandPalette(view)` antes de passar pro `renderChart`.
   - Nenhuma mudança em `renderChart.ts` ou `palette.ts` — `paletteFor` já lê `config.colors.palette`, só está recebendo um valor pré-preenchido agora.

**Critérios de Sucesso:**

Automatizados:
- [x] `tsc --noEmit` no core package sem erros
- [x] Teste unitário de `applyBrandPalette`: retorna a view inalterada quando o chart já tem paleta própria; injeta a paleta do dashboard quando o chart não tem uma e o dashboard tem brand kit; retorna a view inalterada quando nem chart nem dashboard têm paleta (cai no `DEFAULT_PALETTE` de sempre)

Manuais:
- [ ] Menu Resource ▸ "Chart color palette" abre modal, define uma paleta custom, salva
- [ ] Todo gráfico do dashboard sem cor própria passa a usar as cores novas
- [ ] Um gráfico com paleta própria (setada na aba Style, swatches individuais) mantém sua cor, ignora o brand kit
- [ ] Brand kit é persistido (salvar dashboard, recarregar página, paleta continua aplicada)

## Notas de Implementação

- Nenhuma migração de banco é necessária em nenhuma das 3 fases: `connections`/`datasets` já têm schema agnóstico de tipo (rodada anterior), e o brand kit vive dentro do `definition jsonb` já existente de `dashboards`.
- Nenhuma dependência nova é instalada — `pg` já está no `server/package.json` (usado hoje só pro banco interno da app).
- A ordem das fases é independente — nenhuma depende de outra. Podem ser implementadas e verificadas em qualquer ordem, ou em paralelo.
- Risco aceito conscientemente na Fase 1: envolver a query do usuário numa subquery (`SELECT * FROM (${sql}) LIMIT $1`) pra Postgres assume que o SQL é uma única instrução `SELECT`/CTE-com-SELECT-no-final — não suporta múltiplas instruções separadas por `;` nem comandos que não sejam leitura (o que é consistente com o uso esperado: preview/ingest read-only, igual ao BigQuery hoje).

## Questões em Aberto

Nenhuma — as 4 decisões de produto que exigiam julgamento humano foram resolvidas com as opções recomendadas (ver topo do documento).
