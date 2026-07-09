# Plano de Implementação: Templates de dashboard salvos pelo tenant

## Visão Geral

O roadmap (`ROADMAP-studio.md:19`) lista "Templates / galeria de dashboard" como não implementado ("só dá pra criar dashboard em branco"), mas isso está desatualizado: o commit `f3f7cae` (2026-07-03) já entregou uma galeria com 3 templates fixos (Vendas/Marketing/NPS) no dialog "Novo Dashboard". O que falta de fato é **o tenant conseguir salvar seu próprio dashboard como template** e reutilizá-lo — hoje só existem os 3 templates hardcoded no código-fonte, sem persistência nem forma de criar novos sem editar `src/lib/templates/`. Este plano adiciona um recurso `dashboard_templates` por tenant (mesmo padrão de `dashboard_versions`), um botão "Salvar como template" no editor, e funde os templates customizados com os 3 fixos na galeria existente.

## Análise do Estado Atual

**Templates fixos já funcionam de ponta a ponta:**
- `src/lib/templates/index.ts` — `DASHBOARD_TEMPLATES` = `[salesTemplate, marketingTemplate, npsTemplate]`.
- `src/lib/templates/{sales,marketing,nps}Template.ts` — cada um exporta `{ id, name, description, build() }`; `build()` retorna um `DashboardFull` com `charts` prontos e um `dataset: { source: 'import', fileName, rows }` embutido (dado de exemplo, sem depender de dataset salvo no servidor).
- `node_modules/dashjs/dist/types/core/domain.d.ts:420-423` — `DashboardFull.dataset` é o campo oficial da lib pra dataset importado auto-contido; é isso que os templates fixos usam.
- `src/pages/DashboardsPage.tsx:204-247` — dialog "Novo Dashboard" já tem 2 passos: `gallery` (cards "Em branco" + um card por `DASHBOARD_TEMPLATES`) → `name` (define o nome, chama `handleCreate`).
- `src/lib/dashboardsStorage.ts:59-66` — `createAndSaveDashboardFromTemplate(name, template)` chama `template.build()`, sobrescreve `dashboard_name`, e persiste via `dashboardsApi.create({ name, definition })`.

**O que não existe:** nenhuma forma de o usuário criar um template a partir de um dashboard que ele já montou. Os únicos 3 templates existem porque alguém editou `src/lib/templates/` e fez deploy — não há tabela, rota, nem botão de UI pra isso.

**Precedente exato a seguir — `dashboard_versions`** (`server/src/routes/dashboards.ts:113-200`, tabela em `server/db/init.sql:113-122`): recurso aninhado, escopado por `tenant_id`, que faz snapshot de `definition` sob demanda via `POST`, listagem leve sem `definition` (`GET /:id/versions`) e detalhe completo com `definition` (`GET /:id/versions/:versionId`). O novo recurso `dashboard_templates` segue o mesmo formato, mas como rota de topo (`/api/dashboard-templates`) em vez de aninhada em `/:id`, porque não pertence a um dashboard específico — é uma coleção do tenant.

**Toolbar do editor já tem o espaço e o padrão de botão certos** (`src/pages/DashboardEditorPage.tsx:329-351`): `Box` com `flexGrow: 1` seguido de "Versões" (`:331-340`, visível pra todo papel) e "Compartilhar" (`:342-351`, só `!isViewer`). O botão novo "Salvar como template" entra no mesmo grupo, com a mesma condição `!isViewer` de "Compartilhar" (é uma mutação, então segue `requireRole('owner','editor')` no servidor, igual toda mutação de dashboard).

**`DashJsInstance` não expõe o estado atual em memória** (`node_modules/dashjs/dist/types/core/types.d.ts:135-150`): só tem `save()`, `flushDraft()`, `isDirty()` — nenhum `getState()`/`getDashboard()`. Pra salvar como template o estado **persistido mais recente**, e não um estado desatualizado, o botão precisa forçar `save()` se `isDirty()` antes de abrir o dialog — mesmo padrão já usado em `handleSaveAndLeave` (`DashboardEditorPage.tsx:99-114`).

**Padrão de mutação com guarda de papel** (repetido em `dashboards.ts`, `datasets.ts`, `connections.ts`, `members.ts`): `router.use(requireAuth)` no topo do arquivo; cada rota de escrita ganha `requireRole('owner', 'editor')`; toda query inclui `AND tenant_id = $N`.

### Descobertas Chave
- `dashboards.dataset_id` usa `ON DELETE SET NULL` (`init.sql:27`) — `dashboard_templates.dataset_id` segue o mesmo padrão, pra não travar a exclusão de um dataset só porque um template referencia ele.
- `POST /:id/versions` (`dashboards.ts:137-152`) lê `definition` **do banco**, não do body — evita que o cliente mande um payload divergente do que está realmente salvo. `POST /api/dashboard-templates` faz o mesmo: recebe só `{ dashboardId, name, description? }` e lê `definition`/`dataset_id` da linha atual de `dashboards`.
- `selectedStart` em `DashboardsPage.tsx:44` hoje é `'blank' | DashboardTemplate | null`; `DashboardTemplate` (`src/lib/templates/types.ts`) tem `build: () => DashboardFull`. Templates customizados vêm do servidor sem `build` (têm `id`/`datasetId` pra buscar sob demanda) — o discriminador entre os dois tipos no União é a presença da chave `'build'`.

## Estado Final Desejado

- Dono/editor abre um dashboard, clica "Salvar como template", dá nome (+ descrição opcional) → template fica disponível pra qualquer membro do tenant.
- Dialog "Novo Dashboard" mostra: "Em branco" + os 3 templates fixos + os templates customizados do tenant (com indicação visual de que são "da equipe" e, se `canEdit`, um botão de remover).
- Criar a partir de um template customizado gera um dashboard novo com a `definition` e o `dataset_id` do template no momento em que foi salvo (não uma referência viva ao dashboard original — editar o dashboard original depois não altera o template).
- Remover um template customizado não afeta o dashboard original nem dashboards já criados a partir dele.
- Viewer não vê o botão "Salvar como template" nem os botões de remover template na galeria.
- Template de um tenant nunca aparece nem é acessível (id copiado manualmente) por outro tenant.

## Fases de Implementação

### Fase 1: Schema + API de templates

**Objetivo**: tabela `dashboard_templates` e rotas REST (`list`/`get`/`create`/`delete`), escopadas por tenant e papel.

**Mudanças**:

1. `server/db/init.sql` — adiciona ao final:
   ```sql
   CREATE TABLE IF NOT EXISTS dashboard_templates (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     name        text NOT NULL,
     description text,
     definition  jsonb NOT NULL,
     dataset_id  uuid REFERENCES datasets(id) ON DELETE SET NULL,
     created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
     created_at  timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS idx_dashboard_templates_tenant ON dashboard_templates(tenant_id);
   ```

2. `server/src/routes/dashboardTemplates.ts` (novo):
   ```ts
   import { Router } from 'express'
   import { pool } from '../db.js'
   import { requireAuth, requireRole, type AuthedRequest } from '../auth.js'

   const router = Router()
   router.use(requireAuth)

   // Listagem leve — sem `definition`.
   router.get('/', async (req, res) => {
     const { auth } = req as unknown as AuthedRequest
     const { rows } = await pool.query(
       `SELECT dt.id, dt.name, dt.description, dt.dataset_id, dt.created_at, u.name AS created_by_name
        FROM dashboard_templates dt LEFT JOIN users u ON u.id = dt.created_by
        WHERE dt.tenant_id = $1 ORDER BY dt.created_at DESC`,
       [auth.tenantId],
     )
     res.json(rows.map((r) => toCamel(r)))
   })

   // Detalhe completo — com `definition`, usado ao instanciar um dashboard novo.
   router.get('/:id', async (req, res) => {
     const { auth } = req as unknown as AuthedRequest
     const { rows } = await pool.query('SELECT * FROM dashboard_templates WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
     if (!rows.length) return res.status(404).json({ error: 'not found' })
     res.json(toCamel(rows[0], true))
   })

   // Cria a partir do estado salvo de um dashboard existente (lê do banco, não do body).
   router.post('/', requireRole('owner', 'editor'), async (req, res) => {
     const { auth } = req as unknown as AuthedRequest
     const { dashboardId, name, description } = req.body as { dashboardId?: string; name?: string; description?: string }
     if (!dashboardId || !name?.trim()) return res.status(400).json({ error: 'dashboardId and name are required' })

     const { rows: dashRows } = await pool.query(
       'SELECT definition, dataset_id FROM dashboards WHERE id = $1 AND tenant_id = $2',
       [dashboardId, auth.tenantId],
     )
     if (!dashRows.length) return res.status(404).json({ error: 'dashboard not found' })

     const { rows } = await pool.query(
       `INSERT INTO dashboard_templates (tenant_id, name, description, definition, dataset_id, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, description, dataset_id, created_at`,
       [auth.tenantId, name.trim(), description?.trim() || null, dashRows[0].definition, dashRows[0].dataset_id, auth.userId],
     )
     res.status(201).json(toCamel(rows[0]))
   })

   router.delete('/:id', requireRole('owner', 'editor'), async (req, res) => {
     const { auth } = req as unknown as AuthedRequest
     await pool.query('DELETE FROM dashboard_templates WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
     res.status(204).end()
   })

   function toCamel(row: Record<string, unknown>, withDefinition = false) {
     return {
       id: row.id,
       name: row.name,
       description: row.description,
       datasetId: row.dataset_id,
       createdAt: row.created_at,
       createdByName: row.created_by_name ?? null,
       ...(withDefinition ? { definition: row.definition } : {}),
     }
   }

   export default router
   ```

3. `server/src/index.ts` — monta o router:
   ```ts
   import dashboardTemplatesRouter from './routes/dashboardTemplates.js'
   // ...
   app.use('/api/dashboard-templates', dashboardTemplatesRouter)
   ```

**Critérios de Sucesso**:

Automatizados:
- [x] `cd server && npx tsc --noEmit` sem erros

Manuais:
- [ ] Criar um dashboard, salvar (`PUT /api/dashboards/:id`), depois `POST /api/dashboard-templates` com `{dashboardId, name: "Meu template"}` → 201 com metadata (sem `definition`)
- [ ] `GET /api/dashboard-templates` lista o template criado
- [ ] `GET /api/dashboard-templates/:id` retorna `definition` igual à do dashboard original no momento do save
- [ ] `dashboardId` de outro tenant (id copiado manualmente) → 404, template não é criado
- [ ] Segundo tenant: `GET /api/dashboard-templates` não retorna o template do primeiro; `GET /api/dashboard-templates/:idDoPrimeiro>` → 404
- [ ] `DELETE /:id` remove; dashboard original que serviu de base pro template continua intacto
- [ ] Usuário `viewer` (role trocada direto no banco pra testar): `POST /api/dashboard-templates` → 403; `GET /` → 200

---

### Fase 2: Cliente API + helper de instanciação

**Objetivo**: frontend consegue listar/criar/remover templates customizados e instanciar um dashboard novo a partir de um.

**Mudanças**:

1. `src/lib/api.ts` — novas interfaces e client:
   ```ts
   export interface DashboardTemplateMeta {
     id: string
     name: string
     description: string | null
     datasetId: string | null
     createdAt: string
     createdByName: string | null
   }

   export interface DashboardTemplateRecord extends DashboardTemplateMeta {
     definition: object
   }

   export const dashboardTemplatesApi = {
     list: () => fetch('/api/dashboard-templates').then(json<DashboardTemplateMeta[]>),

     get: (id: string) => fetch(`/api/dashboard-templates/${id}`).then(json<DashboardTemplateRecord>),

     create: (dashboardId: string, d: { name: string; description?: string }) =>
       fetch('/api/dashboard-templates', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ dashboardId, ...d }),
       }).then(json<DashboardTemplateMeta>),

     remove: (id: string) => fetch(`/api/dashboard-templates/${id}`, { method: 'DELETE' }),
   }
   ```

2. `src/lib/dashboardsStorage.ts` — helper de instanciação, ao lado de `createAndSaveDashboardFromTemplate`:
   ```ts
   export async function createAndSaveDashboardFromSavedTemplate(
     name: string,
     templateId: string,
   ): Promise<{ id: string; dashboard: DashboardFull }> {
     const template = await dashboardTemplatesApi.get(templateId)
     const dashboard = { ...(template.definition as DashboardFull), dashboard_name: name }
     const row = await dashboardsApi.create({ name, definition: dashboard, datasetId: template.datasetId })
     return { id: row.id, dashboard }
   }
   ```
   (precisa importar `dashboardTemplatesApi` de `./api` no topo do arquivo, ao lado do `dashboardsApi` já importado.)

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run build` (ou `tsc --noEmit`) sem erros de tipo

Manuais: cobertos pela Fase 3 (ainda não há UI pra exercitar isso isoladamente).

---

### Fase 3: UI — salvar como template + galeria unificada

**Objetivo**: botão "Salvar como template" no editor; galeria de "Novo Dashboard" mostra templates fixos + customizados, com remoção pra quem pode editar.

**Mudanças**:

1. `src/pages/DashboardEditorPage.tsx`:
   - Novo estado: `saveTemplateOpen`, `templateName`, `templateDescription`, `savingTemplate`.
   - Novo botão no mesmo grupo de `:331-351`, mesma condição de `!isViewer` que "Compartilhar":
     ```tsx
     {id && !isViewer && (
       <Button size="small" variant="outlined" startIcon={<BookmarkAddIcon />} onClick={handleOpenSaveTemplate}>
         Salvar como template
       </Button>
     )}
     ```
   - `handleOpenSaveTemplate`: se `instanceRef.current?.isDirty()`, chama `await instanceRef.current.save()` e checa `isDirty()` de novo (mesmo padrão de `handleSaveAndLeave`, `:99-114`) — se continuar sujo, aborta (save falhou, não abre o dialog). Senão abre o dialog com campos "Nome" (preenchido com `dashboard?.dashboard_name` por padrão) e "Descrição" (opcional).
   - `handleSaveTemplate`: `await dashboardTemplatesApi.create(idRef.current!, { name: templateName.trim(), description: templateDescription.trim() || undefined })`, fecha o dialog.
   - Import `BookmarkAddIcon` de `@mui/icons-material/BookmarkAdd` e `dashboardTemplatesApi` de `../lib/api`.

2. `src/pages/DashboardsPage.tsx`:
   - Novo estado `customTemplates: DashboardTemplateMeta[]`, carregado junto de `reload()` (ou lazy no primeiro `openNewDialog`) via `dashboardTemplatesApi.list()`.
   - `selectedStart` amplia o tipo: `'blank' | DashboardTemplate | DashboardTemplateMeta | null`. Discrimina no `handleCreate` e no render via `'build' in selectedStart` (built-in) vs. objeto sem `build` (customizado, tem `id`).
   - Novo `chooseCustomTemplate(template: DashboardTemplateMeta)`: mesmo shape de `chooseTemplate` (`:87-91`), seta `newName = template.name`, avança pro passo `'name'`.
   - Grid da galeria (`:225-241`) ganha, depois dos `DASHBOARD_TEMPLATES.map(...)`, um bloco `customTemplates.map(...)` com o mesmo `Card`/`CardActionArea`, um `Chip` pequeno "Da equipe", e — se `canEdit` — um `IconButton` de remover (`DeleteOutlineIcon`, `stopPropagation`, `confirm(...)`, chama `dashboardTemplatesApi.remove(id)` e recarrega a lista de templates) posicionado como o botão de remover já existe nos cards de dashboard (`:184-197`, mesmo padrão `position: absolute`).
   - `handleCreate` (`:93-107`): branch novo —
     ```ts
     const { id } =
       selectedStart === 'blank'
         ? await createAndSaveDashboard(newName.trim())
         : 'build' in selectedStart
           ? await createAndSaveDashboardFromTemplate(newName.trim(), selectedStart)
           : await createAndSaveDashboardFromSavedTemplate(newName.trim(), selectedStart.id)
     ```
   - Import `dashboardTemplatesApi`, `type DashboardTemplateMeta` de `../lib/api`; `createAndSaveDashboardFromSavedTemplate` de `../lib/dashboardsStorage`.

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run build` sem erros de tipo

Manuais:
- [ ] Editar um dashboard com mudanças não salvas, clicar "Salvar como template" → salva sozinho antes de abrir o dialog (conferir `GET /api/dashboards/:id` reflete o save)
- [ ] Preencher nome "Meu template" + descrição, salvar → dialog fecha sem erro
- [ ] Abrir "Novo Dashboard": galeria mostra "Em branco", os 3 templates fixos, e "Meu template" com o chip "Da equipe"
- [ ] Criar a partir de "Meu template" → novo dashboard abre com os mesmos charts/dataset do original; editar o novo dashboard depois não altera o template nem o dashboard de origem
- [ ] Remover "Meu template" (ícone de lixeira no card) → some da galeria; dashboards já criados a partir dele continuam intactos
- [ ] Logado como `viewer`: botão "Salvar como template" não aparece no editor; cards de template customizado na galeria não mostram ícone de remover
- [ ] Segundo tenant não vê "Meu template" na galeria dele

## Notas de Implementação

- **Sem versionamento de template**: salvar como template de novo com o mesmo nome cria um registro novo (não há "update" de template nesta fase) — evita complexidade de decidir se atualizar um template quebra dashboards já criados a partir dele. Cobre o caso de uso pedido; um fluxo de "atualizar template existente" fica pra depois, se pedido.
- **Sem template cross-tenant/global**: todo template criado é privado ao tenant que o criou, mesma política de `dashboards`/`datasets`/`connections`. Os 3 templates fixos (`src/lib/templates/`) continuam sendo os únicos visíveis por todo tenant, por serem código, não dado.
- **`dataset_id` do template pode ficar órfão**: se o dataset referenciado for removido depois (`ON DELETE SET NULL`, igual `dashboards.dataset_id`), instanciar o template ainda funciona — só nasce sem fonte de dados selecionada, mesmo comportamento que já existe hoje pra dashboards cujo dataset foi apagado.

## Questões em Aberto

Nenhuma.