# Plano de Implementação: Auth + Multi-tenant (RLS) + Versionamento de Dashboards

## Visão Geral

Hoje o app não tem nenhum conceito de usuário: qualquer request em `/api/*` vê e edita todos os dados de todo mundo (`server/db/init.sql` não tem tabela de user/role/tenant). Este plano adiciona autenticação por sessão, isolamento multi-tenant (cada empresa só vê seus próprios datasets/dashboards/conexões), 3 papéis (owner/editor/viewer), convite de membros por e-mail, e — aproveitando a mesma fundação — versionamento explícito de dashboards (snapshot nomeado + restore). Escopo é só o app (`server/` + `src/`); a lib `dashjs` (vendored em `node_modules/dashjs`) não é alterada — reusa a opção `readOnly` que ela já expõe.

## Análise do Estado Atual

**Zero auth hoje:**
- `server/src/index.ts:10-19` — Express sem nenhum middleware de sessão/auth. `cors()` sem allowlist, `express.json({ limit: '450mb' })`.
- `server/package.json:10-15` — sem `bcrypt`/`express-session`/`connect-pg-simple`/qualquer lib de auth.
- `server/src/routes/{datasets,dashboards,connections}.ts` — toda query usa `pool.query` direto, sem filtro de tenant (não existe a coluna).
- `server/src/routes/public.ts:9-16` — leitura pública por slug, sem auth (deve continuar assim).

**Save do dashboard é manual (achado da pesquisa)**: o host **não** liga `ctx.autosave` da lib (`src/pages/DashboardEditorPage.tsx:188-203`, sem campo `autosave` no `options`) — o único save é o clique no botão da toolbar da lib, que chama `onSave` → `dashboardsApi.update(id, { definition, datasetId })` (`DashboardEditorPage.tsx:169-175`). Isso importa pro versionamento: não existe autosave "ruidoso" criando saves a cada poucos segundos — cada `PUT /api/dashboards/:id` já é uma ação deliberada do usuário. A versão, porém, deve ser **um passo além do save normal** (confirmado com o usuário: botão explícito "Salvar versão", não uma versão a cada save).

**Lib expõe `readOnly` nativamente**: `node_modules/dashjs/dist/types/core/types.d.ts:119` — `DashJsOptions.readOnly?: boolean`. Passar essa flag da `DashboardEditorPage` cobre o caso "viewer não edita" sem tocar a lib.

**Toolbar do host (não da lib) já tem um espaço de ações**: `src/pages/DashboardEditorPage.tsx:322-333` — `Box` com `flexGrow:1` seguido do botão "Compartilhar". O botão "Versões" entra ao lado desse, no mesmo `Box` (linha 258-334), fora do canvas da lib.

**Fetches do frontend não mandam nenhum header de auth**: `src/lib/api.ts` — todo `fetch('/api/...')` é relativo, sem `credentials`/`Authorization`. Como `vite.config.ts:9-11` faz proxy de `/api` pro backend (dev) e a app serve tudo same-origin, **cookie de sessão funciona sem tocar em nenhum dos ~30 call-sites existentes** — o browser manda o cookie automaticamente em request same-origin. Esse foi o motivo de escolher sessão em vez de JWT (JWT exigiria adicionar header em cada call-site).

**Botões que precisam ficar viewer-read-only** (acharam durante a leitura, com linha exata):
- `src/pages/DashboardsPage.tsx:119-125` (topo) e `:148-150` (empty state) — "Novo Dashboard"/"Criar primeiro dashboard"; `:183-187` — botão remover no card.
- `src/pages/DataPage.tsx:113-115` (topo) e `:143-145` (empty state) — "Nova fonte de dados"; `:298-307` — botão "Remover" dataset.
- `src/pages/ConnectionsPage.tsx:213-215` (topo) e `:235-237` (empty state) — "Nova conexão"; `:373-380` — botão "Remover" conexão. Botão "Testar conexão" (`:365-372`) fica liberado pra viewer (não muta nada persistente).
- `src/pages/DashboardEditorPage.tsx:324-333` — botão "Compartilhar" (publish muda estado persistido).

**`connections.ts` tem 3 rotas que rodam query contra a credencial sem checar dono** (`/:id/test`, `/:id/preview`, `/:id/ingest` — `server/src/routes/connections.ts:144-185`): hoje chamam `runQuery(req.params.id, ...)` direto. Depois do multi-tenant, sem correção isso permite adivinhar um UUID de conexão de outro tenant e rodar query contra a credencial dele. Precisa checar posse antes de cada chamada — tratado explicitamente na Fase 2.

**Nenhuma infra de e-mail**: sem `nodemailer`/`resend`/qualquer SDK. Convite e reset de senha precisam disso do zero (Fase 3).

## Estado Final Desejado

- Usuário sem conta não acessa nada em `/api/*` (exceto `/api/public/*` e `/api/health`) — recebe 401 e é redirecionado pra `/login` no frontend.
- Signup cria um tenant novo + usuário owner. Se for o **primeiro tenant já criado no banco**, adota todo dado pré-existente (`tenant_id IS NULL`) pra esse tenant — sem esse passo, os dados de antes da migração ficam órfãos e inacessíveis.
- Toda query de `datasets`/`dashboards`/`connections` filtra por `tenant_id` da sessão ativa — usuário de um tenant nunca lê/edita linha de outro, mesmo sabendo o UUID.
- 3 papéis por tenant: **owner** (tudo + gerencia membros/convites/conexões), **editor** (cria/edita/remove datasets/dashboards/conexões, não gerencia membros), **viewer** (só lê — UI e servidor bloqueiam toda mutação).
- Owner convida membro por e-mail (Resend); convidado clica no link, cria senha (ou faz login se já tiver conta em outro tenant) e entra automaticamente no tenant com o papel definido no convite.
- Esqueci-minha-senha funciona por e-mail (mesmo mecanismo de envio do convite).
- Dashboard ganha um botão "Versões" (visível a todo papel; salvar/restaurar só pra owner/editor): salva snapshot nomeado da `definition` atual; lista snapshots por data; restaura um snapshot (gerando automaticamente um snapshot de segurança do estado atual antes de sobrescrever, pra nada se perder).

### Descobertas Chave
- `PUT /api/dashboards/:id` sempre sobrescreve `definition` inteiro (`server/src/routes/dashboards.ts:38-58`) — versão é um `INSERT` simples numa tabela separada, sem merge/diff.
- `connect-pg-simple` cria a própria tabela de sessão sozinho (`createTableIfMissing: true`) — não precisa de DDL manual no `init.sql`.
- `server/db/init.sql` usa o padrão `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pra colunas novas em tabela existente (idempotente, roda toda vez que o container sobe) — as colunas `tenant_id` seguem esse mesmo padrão.
- `insertDataset()` (`server/src/routes/datasets.ts:113-137`) é chamada tanto por `POST /api/datasets` quanto por `POST /api/connections/:id/ingest` (`connections.ts:175`) — precisa ganhar um parâmetro `tenantId` usado nos dois call-sites.

## Fases de Implementação

### Fase 1: Schema + auth core (signup/login/logout/me)

**Objetivo**: banco com tabelas de tenant/user/role, sessão funcionando, usuário consegue criar conta e logar. Nada ainda filtra dados por tenant (isso é a Fase 2) — esta fase só estabelece identidade.

**Mudanças**:

1. `server/db/init.sql` — adiciona ao final:
   ```sql
   CREATE TABLE IF NOT EXISTS tenants (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name       text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   );

   CREATE TABLE IF NOT EXISTS users (
     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     email         text NOT NULL UNIQUE,
     password_hash text NOT NULL,
     name          text NOT NULL,
     created_at    timestamptz NOT NULL DEFAULT now(),
     updated_at    timestamptz NOT NULL DEFAULT now()
   );

   CREATE TABLE IF NOT EXISTS tenant_memberships (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role       text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
     created_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (tenant_id, user_id)
   );

   ALTER TABLE datasets ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
   ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
   ALTER TABLE connections ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;

   CREATE INDEX IF NOT EXISTS idx_datasets_tenant ON datasets(tenant_id);
   CREATE INDEX IF NOT EXISTS idx_dashboards_tenant ON dashboards(tenant_id);
   CREATE INDEX IF NOT EXISTS idx_connections_tenant ON connections(tenant_id);
   ```
   `tenant_id` fica nullable no schema (não `NOT NULL`) — a adoção do dado legado (item 4) e o fato de toda rota daqui em diante sempre inserir com tenant_id garantem a integridade na prática, sem precisar de uma migração de dado bloqueante no boot.

2. `server/package.json` — adiciona dependencies `bcrypt`, `express-session`, `connect-pg-simple`; devDependencies `@types/bcrypt`, `@types/express-session`, `@types/connect-pg-simple`.

3. `server/src/auth.ts` (novo) — sessão + middlewares:
   ```ts
   import session from 'express-session'
   import connectPgSimple from 'connect-pg-simple'
   import type { Request, Response, NextFunction } from 'express'
   import { pool } from './db.js'

   const PgSession = connectPgSimple(session)

   export const sessionMiddleware = session({
     store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
     secret: process.env.SESSION_SECRET ?? 'dev-insecure-secret',
     resave: false,
     saveUninitialized: false,
     rolling: true,
     cookie: {
       httpOnly: true,
       sameSite: 'lax',
       secure: process.env.NODE_ENV === 'production',
       maxAge: 30 * 24 * 60 * 60 * 1000,
     },
   })

   declare module 'express-session' {
     interface SessionData {
       userId?: string
       tenantId?: string
     }
   }

   export type Role = 'owner' | 'editor' | 'viewer'
   export interface AuthedRequest extends Request {
     auth: { userId: string; tenantId: string; role: Role; email: string; name: string }
   }

   // Carrega user+role da sessão ativa. Falha (401) se a sessão não tem
   // tenantId ainda selecionado (ver POST /api/auth/select-tenant).
   export async function requireAuth(req: Request, res: Response, next: NextFunction) {
     const { userId, tenantId } = req.session
     if (!userId || !tenantId) return res.status(401).json({ error: 'not authenticated' })
     const { rows } = await pool.query(
       `SELECT u.email, u.name, tm.role FROM users u
        JOIN tenant_memberships tm ON tm.user_id = u.id
        WHERE u.id = $1 AND tm.tenant_id = $2`,
       [userId, tenantId],
     )
     if (!rows.length) return res.status(401).json({ error: 'not authenticated' })
     ;(req as AuthedRequest).auth = { userId, tenantId, role: rows[0].role, email: rows[0].email, name: rows[0].name }
     next()
   }

   export function requireRole(...roles: Role[]) {
     return (req: Request, res: Response, next: NextFunction) => {
       if (!roles.includes((req as AuthedRequest).auth.role)) {
         return res.status(403).json({ error: 'forbidden' })
       }
       next()
     }
   }
   ```

4. `server/src/routes/auth.ts` (novo) — endpoints públicos de identidade (o resto dos endpoints de convite entra na Fase 3, junta com o e-mail):
   - `POST /signup` `{ name, email, password, tenantName }`: hash com `bcrypt.hash(password, 12)`; `INSERT INTO tenants`; `INSERT INTO users`; `INSERT INTO tenant_memberships (..., role: 'owner')`; **adoção de dado legado**: dentro da mesma transação, se `SELECT count(*) FROM tenants` (antes do insert) `= 0`, faz `UPDATE datasets/dashboards/connections SET tenant_id = $novoTenantId WHERE tenant_id IS NULL`; seta `req.session.userId`/`req.session.tenantId`; responde `{ user, tenant, role: 'owner' }`.
   - `POST /login` `{ email, password }`: busca `users` por email, `bcrypt.compare`; busca `tenant_memberships` do user — se 1 só, seta `tenantId` na sessão direto e responde `{ user, tenant, role }`; se mais de 1, seta só `userId` na sessão e responde `{ needsTenantSelection: true, tenants: [{id, name}] }`.
   - `POST /select-tenant` `{ tenantId }`: exige `req.session.userId` setado (não exige `requireAuth` completo, que pede os dois); confirma que existe `tenant_memberships` pra esse par; seta `req.session.tenantId`; responde `{ tenant, role }`.
   - `POST /logout`: `req.session.destroy()`.
   - `GET /me`: usa `requireAuth`; responde `{ user: {id,email,name}, tenant: {id,name}, role }`.

5. `server/src/index.ts`:
   ```ts
   import { sessionMiddleware } from './auth.js'
   import authRouter from './routes/auth.js'
   // ...
   app.use(sessionMiddleware)
   // ...
   app.use('/api/auth', authRouter)
   ```
   Monta **antes** dos outros routers (sessão precisa existir pra todo o resto). `authRouter` não leva `requireAuth` — cada rota decide o que exige.

**Critérios de Sucesso**:

Automatizados:
- [ ] `cd server && npx tsc --noEmit` sem erros
- [ ] `cd server && npm install` resolve as libs novas sem conflito

Manuais:
- [ ] Banco limpo (`docker compose down -v && docker compose up`): `POST /api/auth/signup` cria tenant+user+membership, cookie de sessão vem no `Set-Cookie` da resposta
- [ ] `GET /api/auth/me` com o cookie retorna o usuário certo; sem cookie retorna 401
- [ ] Banco com dado pré-existente (dataset/dashboard/conexão de antes desta feature, `tenant_id` NULL): primeiro signup adota tudo — `SELECT tenant_id FROM datasets` não retorna NULL depois
- [ ] Segundo signup (segundo tenant): não re-adota nada — dado do primeiro tenant continua com o `tenant_id` do primeiro
- [ ] `POST /api/auth/login` com senha errada → 401; senha certa → sessão criada
- [ ] `POST /api/auth/logout` seguido de `GET /api/auth/me` → 401

---

### Fase 2: Tenant scoping + roles nas rotas existentes

**Objetivo**: `datasets`/`dashboards`/`connections` passam a exigir sessão e filtrar tudo por `tenant_id`; mutações exigem `owner`/`editor`.

**Mudanças**:

1. `server/src/routes/dashboards.ts` — `router.use(requireAuth)` logo após `const router = Router()`. Toda query ganha `tenant_id`:
   - `GET /` → `WHERE tenant_id = $1`, param `[auth.tenantId]`.
   - `GET /:id` → `WHERE id = $1 AND tenant_id = $2`.
   - `POST /` → `requireRole('owner','editor')`; `INSERT ... (name, definition, dataset_id, tenant_id) VALUES (..., $4)`.
   - `PUT /:id`, `DELETE /:id`, `/:id/publish`, `/:id/unpublish`, `/:id/pin`, `/:id/unpin` → `requireRole('owner','editor')`; toda query ganha `AND tenant_id = $N` na cláusula `WHERE` (impede um editor de outro tenant sobrescrever um id adivinhado).

2. `server/src/routes/datasets.ts` — mesmo padrão: `router.use(requireAuth)`; `GET /` e `GET /:id` filtram por `tenant_id`; `POST /`, `PUT /:id`, `DELETE /:id`, `/:id/refresh-schedule`, `/:id/refresh-now` exigem `requireRole('owner','editor')` e escopam por `tenant_id`. `insertDataset()` (linha 113) ganha parâmetro `tenantId: string` (obrigatório, não opcional) e inclui na coluna `tenant_id` do `INSERT`; os dois call-sites (`datasets.ts` `POST /` e `connections.ts` `/:id/ingest`) passam `auth.tenantId`.

3. `server/src/routes/connections.ts` — `router.use(requireAuth)`; `GET /` filtra por `tenant_id`; `POST /` exige `requireRole('owner','editor')` e insere `tenant_id`; `DELETE /:id` escopa a query de contagem de datasets afetados e o `DELETE` em si por `tenant_id`, exige `requireRole('owner','editor')`.
   - **Correção de segurança** nas 3 rotas que chamam `runQuery(id, ...)` sem checar dono (`/:id/test`, `/:id/preview`, `/:id/ingest`): adiciona helper local
     ```ts
     async function assertOwnedByTenant(id: string, tenantId: string) {
       const { rows } = await pool.query('SELECT 1 FROM connections WHERE id = $1 AND tenant_id = $2', [id, tenantId])
       if (!rows.length) throw new Error('connection not found')
     }
     ```
     chamado no início de cada uma das 3 rotas antes de `runQuery`/`insertDataset`. `/:id/test` e `/:id/preview` só exigem `requireAuth` (viewer pode explorar/testar, não muta nada persistido); `/:id/ingest` exige `requireRole('owner','editor')` (cria dataset novo).
   - `test-adhoc`/`preview-adhoc` não tocam em linha nenhuma do banco (credenciais vêm no body, não persistidas) — mantêm só `requireAuth`, sem checagem de tenant (nada a checar).

4. `server/src/routes/public.ts` — **sem mudança**. Permanece sem `requireAuth`; o link público (`slug` + `published = true`) é intencionalmente cross-tenant-agnostic — é o mecanismo de compartilhamento externo, não uma rota autenticada.

5. `server/src/refreshScheduler.ts` — **sem mudança**. É um processo interno de servidor, não uma request de usuário; opera por `dataset.id` direto (já unicamente identificado), sem contexto de tenant.

**Critérios de Sucesso**:

Automatizados:
- [ ] `cd server && npx tsc --noEmit` sem erros

Manuais:
- [ ] Criar 2 tenants (2 signups). Tenant A cria um dataset e um dashboard. Logado como tenant B: `GET /api/datasets` e `GET /api/dashboards` não retornam nada do tenant A
- [ ] Tenant B tenta `GET /api/dashboards/:idDoTenantA>` (id copiado manualmente) → 404 (não 200, não leak de existência)
- [ ] Usuário `viewer` (criar via convite na Fase 3, ou promover/rebaixar role direto no banco pra testar antes da Fase 5 de UI): `POST /api/dashboards` → 403; `GET /api/dashboards` → 200
- [ ] Tenant B com um UUID de conexão do tenant A (copiado do banco): `POST /api/connections/:id/preview` com esse id → erro "connection not found", não expõe dado do tenant A
- [ ] Link público (`/api/public/:slug`) continua acessível sem cookie de sessão nenhum

---

### Fase 3: E-mail (Resend) — convite de membro + esqueci-senha

**Objetivo**: owner convida um e-mail pro tenant; convidado aceita e ganha acesso. Usuário esquecido de senha se recupera. Ambos os fluxos usam o mesmo helper de envio.

**Mudanças**:

1. `server/db/init.sql` — mais duas tabelas:
   ```sql
   CREATE TABLE IF NOT EXISTS invites (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     email       text NOT NULL,
     role        text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
     token       text NOT NULL UNIQUE,
     invited_by  uuid NOT NULL REFERENCES users(id),
     expires_at  timestamptz NOT NULL,
     accepted_at timestamptz,
     created_at  timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);

   CREATE TABLE IF NOT EXISTS password_resets (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token      text NOT NULL UNIQUE,
     expires_at timestamptz NOT NULL,
     used_at    timestamptz,
     created_at timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
   ```

2. `server/package.json` — dependency `resend`.

3. `server/src/email.ts` (novo):
   ```ts
   import { Resend } from 'resend'

   const resend = new Resend(process.env.RESEND_API_KEY)
   const FROM = process.env.EMAIL_FROM ?? 'JSS Dashjs <onboarding@resend.dev>'

   export async function sendInviteEmail(to: string, tenantName: string, inviterName: string, link: string) {
     await resend.emails.send({
       from: FROM, to,
       subject: `${inviterName} convidou você para o time "${tenantName}" no JSS Dashjs`,
       html: `<p>${inviterName} convidou você para colaborar no tenant <b>${tenantName}</b>.</p><p><a href="${link}">Aceitar convite</a></p>`,
     })
   }

   export async function sendPasswordResetEmail(to: string, link: string) {
     await resend.emails.send({
       from: FROM, to,
       subject: 'Redefinir senha — JSS Dashjs',
       html: `<p>Clique para redefinir sua senha (expira em 1 hora):</p><p><a href="${link}">Redefinir senha</a></p>`,
     })
   }
   ```

4. `server/src/routes/auth.ts` — mais 4 rotas públicas:
   - `POST /forgot-password` `{ email }`: sempre responde `200 { ok: true }` (não revela se o e-mail existe); se existir user, cria `password_resets` (token `randomBytes(24).toString('base64url')`, `expires_at = now() + 1h`) e chama `sendPasswordResetEmail(email, `${APP_URL}/reset-password/${token}`)`.
   - `POST /reset-password` `{ token, password }`: busca token não expirado/não usado; se inválido → 400; senão `UPDATE users SET password_hash = $1`, marca `used_at = now()`.
   - `GET /invites/:token`: busca `invites` por token não expirado/não aceito; 404 se inválido; responde `{ email, tenantName, role, hasAccount }` (`hasAccount` = existe `users` com esse email) — frontend decide entre "criar senha" ou "faça login".
   - `POST /invites/:token/accept` `{ name, password }` (conta nova): valida invite; se já existe `users` com esse email → 409 (deveria usar `accept-existing`); cria `users` + `tenant_memberships` (role do invite) + marca `accepted_at`; loga (seta sessão).
   - `POST /invites/:token/accept-existing` (autenticado via `requireAuth` parcial — só `userId`, sem exigir tenant ainda selecionado): confirma que `req.session` tem `userId` e que o email do user logado bate com `invites.email`; cria `tenant_memberships`; marca `accepted_at`; seta `req.session.tenantId` pro tenant do convite.

5. `server/src/routes/members.ts` (novo) — gestão autenticada de membros do tenant ativo, `router.use(requireAuth)`:
   - `GET /`: lista `tenant_memberships` + `users` do `tenantId` ativo (qualquer papel pode ver o time).
   - `GET /invites`: convites pendentes do tenant — `requireRole('owner')`.
   - `POST /invites` `{ email, role }`: `requireRole('owner')`; gera token, `expires_at = now() + 7 days`; `INSERT INTO invites`; `sendInviteEmail(email, tenantName, auth.name, `${APP_URL}/accept-invite/${token}`)`.
   - `DELETE /invites/:id`: `requireRole('owner')` — revoga (delete a linha).
   - `PUT /:userId/role` `{ role }`: `requireRole('owner')`; **guarda**: se `role` novo ≠ `'owner'` e o membro é o único owner do tenant (`SELECT count(*) FROM tenant_memberships WHERE tenant_id=$1 AND role='owner'`), rejeita com 400 `"tenant precisa de pelo menos um owner"`.
   - `DELETE /:userId`: `requireRole('owner')`; mesma guarda do último-owner.

6. `server/src/index.ts` — monta `membersRouter` em `/api/members`.

7. `docker-compose.yml` (serviço `api`) e `.env.example` (raiz) — novas env vars: `SESSION_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` (ex: `http://localhost:5173` em dev — usado pra montar os links de convite/reset).

**Critérios de Sucesso**:

Automatizados:
- [ ] `cd server && npx tsc --noEmit` sem erros

Manuais:
- [ ] Owner chama `POST /api/members/invites` com um e-mail real (usando `RESEND_API_KEY` de teste) — e-mail chega com link
- [ ] Abrir o link: `GET /api/auth/invites/:token` retorna os dados certos do convite
- [ ] `POST /api/auth/invites/:token/accept` com nome+senha cria o usuário, sessão fica ativa, `GET /api/members` no tenant mostra o novo membro com o papel certo
- [ ] Convite expirado (forçar `expires_at` no passado direto no banco) → `GET /invites/:token` retorna 404
- [ ] `POST /api/auth/forgot-password` pra e-mail existente dispara e-mail; pra e-mail inexistente responde 200 igual (sem leak)
- [ ] `POST /api/auth/reset-password` com token válido troca a senha; login com senha antiga passa a falhar
- [ ] Tentar rebaixar/remover o único owner do tenant → 400 com a guarda de último-owner

---

### Fase 4: Frontend — telas de auth + rotas protegidas

**Objetivo**: app pede login antes de mostrar qualquer coisa; usuário navega entre login/signup/convite/reset sem cair em rota autenticada sem sessão.

**Mudanças**:

1. `src/lib/api.ts` — novo `authApi` (`signup`, `login`, `logout`, `me`, `selectTenant`, `forgotPassword`, `resetPassword`, `getInvite(token)`, `acceptInvite(token, data)`, `acceptInviteExisting(token)`) e `membersApi` (`list`, `listInvites`, `invite`, `revokeInvite`, `updateRole`, `remove`). O helper `json<T>()` (linha 63-69) ganha uma checagem: se `res.status === 401`, dispara `window.dispatchEvent(new Event('auth:unauthorized'))` antes de lançar o erro — é assim que uma sessão expirada em qualquer chamada existente (sem tocar nos ~30 call-sites) avisa o resto do app.

2. `src/stores/authStore.tsx` (novo) — `AuthProvider`/`useAuth()`: estado `{ user, tenant, role, loading }`; no mount chama `authApi.me()`; escuta `auth:unauthorized` (do item 1) pra limpar o estado; expõe `login`, `logout`, `signup`, `selectTenant`.

3. `src/components/ProtectedRoute.tsx` (novo) — `useAuth()`; `loading` → spinner; sem `user` → `<Navigate to="/login" replace />`; senão renderiza `children`/`<Outlet/>`.

4. Páginas novas: `src/pages/LoginPage.tsx`, `SignupPage.tsx`, `AcceptInvitePage.tsx` (rota `/accept-invite/:token` — chama `GET /invites/:token`, decide entre form de senha nova ou "faça login" + botão continuar), `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx` (rota `/reset-password/:token`). Mesmo estilo visual das páginas existentes (MUI, `Box`/`TextField`/`Button`, sem layout novo).

5. `src/App.tsx` — reestrutura:
   ```tsx
   <AuthProvider>
     <BrowserRouter>
       <Routes>
         <Route path="/login" element={<LoginPage />} />
         <Route path="/signup" element={<SignupPage />} />
         <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
         <Route path="/forgot-password" element={<ForgotPasswordPage />} />
         <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
         <Route path="/view/:slug" element={<PublicDashboardView />} />
         <Route element={<ProtectedRoute />}>
           <Route path="/" element={
             <DatasetsProvider>
               <CommandPaletteProvider>
                 <AppShell />
               </CommandPaletteProvider>
             </DatasetsProvider>
           }>
             <Route index element={<HomePage />} />
             <Route path="data" element={<DataPage />} />
             <Route path="connections" element={<ConnectionsPage />} />
             <Route path="sheets" element={<SheetsPage />} />
             <Route path="dashboards" element={<DashboardsPage />} />
             <Route path="dashboards/:id" element={<DashboardEditorPage />} />
             <Route path="settings/members" element={<MembersPage />} />
           </Route>
         </Route>
       </Routes>
     </BrowserRouter>
   </AuthProvider>
   ```
   `DatasetsProvider`/`CommandPaletteProvider` saem de fora de tudo (posição atual, `App.tsx:24-25`) pra dentro da árvore protegida — hoje eles disparam fetch assim que a app monta, mesmo antes de logar; um usuário sem sessão bateria em `/api/datasets` só pra receber 401 de graça.

**Critérios de Sucesso**:

Automatizados:
- [ ] `npm run build` (ou `tsc --noEmit`) sem erros de tipo

Manuais:
- [ ] Sem sessão, abrir `/` redireciona pra `/login`
- [ ] Login com credenciais válidas leva pra `/` (Home) com os dados do próprio tenant
- [ ] Logout limpa a sessão e volta pra `/login`; tentar `/dashboards` direto na URL depois do logout também redireciona
- [ ] `/view/:slug` (link público) continua acessível sem estar logado
- [ ] Signup com tenant novo, depois logout, depois login como outro tenant: nenhum dado do primeiro aparece
- [ ] Fluxo de convite completo pela UI: link do e-mail → `AcceptInvitePage` → criar conta → cai logado dentro do tenant certo
- [ ] Fluxo de esqueci-senha completo pela UI

---

### Fase 5: Gestão de membros + viewer read-only na UI

**Objetivo**: owner administra o time pela UI; viewer não vê/aciona nenhum botão de criar/editar/remover em nenhuma página, e abre dashboards em modo somente-leitura.

**Mudanças**:

1. `src/pages/MembersPage.tsx` (novo, rota `settings/members`) — lista membros (`membersApi.list`) com papel e um `Select` de role por linha (só habilitado se `role === 'owner'`, chama `membersApi.updateRole`), botão remover (idem), seção de convites pendentes + form "Convidar" (`email` + `Select` de role) restrita a `role === 'owner'`.

2. `src/layout/AppShell.tsx` — item de nav "Membros" (ícone `PeopleIcon`) adicionado a `navItems` (linha 29-33), visível só se `role !== 'viewer'` (filtra o array antes do `.map`, linha 96-97); menu de usuário na `AppBar` (novo `IconButton`+`Menu` ao lado do toggle de tema, linha 74-78) mostrando `user.name`/`tenant.name` e ação "Sair" (`useAuth().logout()`).

3. `src/pages/DashboardsPage.tsx` — botões de criar (`:119-125`, `:148-150`) e remover (`:183-187`) envolvidos em `{role !== 'viewer' && (...)}` (usa `useAuth()`).

4. `src/pages/DataPage.tsx` — botão "Nova fonte de dados" (`:113-115`, `:143-145`) e "Remover" (`:298-307`) com o mesmo guard.

5. `src/pages/ConnectionsPage.tsx` — botão "Nova conexão" (`:213-215`, `:235-237`) e "Remover" (`:373-380`) com o mesmo guard; "Testar conexão" (`:365-372`) fica visível pra todo papel.

6. `src/pages/DashboardEditorPage.tsx` — `options.readOnly: role === 'viewer'` dentro do `useMemo` (linha 188-203); botão "Compartilhar" (`:324-333`) só renderiza se `role !== 'viewer'`.

**Critérios de Sucesso**:

Automatizados:
- [ ] `npm run build` sem erros de tipo

Manuais:
- [ ] Owner acessa `/settings/members`, convida um e-mail com papel `viewer`, convite aparece na lista de pendentes
- [ ] Logado como `viewer`: item "Membros" não aparece no rail; nenhum botão de criar/remover aparece em Dados/Conexões/Dashboards; abrir um dashboard mostra a toolbar da lib em modo leitura (sem botão de salvar/editar dentro do canvas), botão "Compartilhar" não aparece
- [ ] Logado como `editor`: cria/edita/remove normalmente, mas não vê nada de gestão de membro (ou vê a lista e não consegue mudar role/remover — `Select`/botão desabilitado)
- [ ] Owner tenta remover a si mesmo sendo o único owner → mensagem de erro da guarda de último-owner (Fase 3) aparece na UI

---

### Fase 6: Versionamento de dashboards

**Objetivo**: usuário salva um checkpoint nomeado do dashboard e volta pra ele depois, sem depender do autosave/save normal.

**Mudanças**:

1. `server/db/init.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS dashboard_versions (
     id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
     tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     name         text,
     definition   jsonb NOT NULL,
     created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
     created_at   timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS idx_dashboard_versions_dashboard ON dashboard_versions(dashboard_id);
   ```

2. `server/src/routes/dashboards.ts` — mais 4 rotas (mesmo arquivo, junto de publish/pin — mesmo padrão de recurso aninhado):
   - `GET /:id/versions`: `requireAuth`; lista `id, name, created_at, created_by` (sem `definition` — mantém a listagem leve) `WHERE dashboard_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`.
   - `GET /:id/versions/:versionId`: `requireAuth`; retorna a linha completa (com `definition`), escopado por `dashboard_id`+`tenant_id`.
   - `POST /:id/versions` `{ name? }`: `requireRole('owner','editor')`; lê `definition` atual de `dashboards WHERE id=$1 AND tenant_id=$2`, insere em `dashboard_versions` com `created_by = auth.userId`.
   - `POST /:id/versions/:versionId/restore`: `requireRole('owner','editor')`; dentro de uma transação: (a) snapshota o estado *atual* do dashboard como versão automática (`name: 'Antes de restaurar'`) — rede de segurança pra não perder nada; (b) copia `dashboard_versions.definition` da versão escolhida pra `dashboards.definition`, `updated_at = now()`.

3. `src/lib/api.ts` — `dashboardVersionsApi` (`list`, `get`, `create`, `restore`).

4. `src/pages/DashboardEditorPage.tsx` — botão "Versões" ao lado de "Compartilhar" (`:322-333`, mesmo `Box`), abre um `Drawer`/`Dialog` novo (`VersionsPanel`, componente inline ou `src/components/VersionsPanel.tsx`): lista versões (nome + data + quem salvou), botão "Salvar versão atual" (abre `TextField` de nome opcional, chama `dashboardVersionsApi.create`) e botão "Restaurar" por item (confirma com `confirm(...)`, chama `restore`, depois recarrega a página — mais simples que tentar sincronizar o estado in-memory da lib com o novo `definition`, já que a lib não expõe um "reload dashboard" além de re-montar). "Salvar versão"/"Restaurar" só aparecem se `role !== 'viewer'` (viewer só vê a lista, herda o guard da Fase 5).

**Critérios de Sucesso**:

Automatizados:
- [ ] `cd server && npx tsc --noEmit` e `npm run build` (raiz) sem erros

Manuais:
- [ ] Editar um dashboard, clicar "Salvar versão" com nome "v1" → aparece na lista com data certa
- [ ] Editar mais, salvar de novo sem versão nova (save normal da lib) → lista de versões não ganha entrada nova (só o "Salvar versão" explícito cria)
- [ ] Mudar o dashboard bastante, restaurar "v1" → conteúdo volta ao estado de "v1", e uma versão automática "Antes de restaurar" aparece no topo da lista com o estado que existia antes do restore
- [ ] `viewer` abre "Versões": vê a lista, não vê botão de salvar/restaurar
- [ ] Versão de outro tenant (id copiado manualmente) → `GET /:id/versions/:versionId` 404

## Notas de Implementação

- **RLS é aplicado na camada de app, não Postgres nativo**: toda query dos 3 routers ganha `WHERE tenant_id = $N` manualmente. `CREATE POLICY`/`SET LOCAL app.tenant_id` de verdade exigiria troca de `pool.query` (que pega uma conexão do pool por chamada) por um client dedicado por request em toda rota — mudança de infraestrutura bem maior que o escopo pedido. Se o volume de dado sensível justificar depois, isso é um follow-up isolado, não regride nada deste plano.
- **Sessão via cookie, não JWT** — decisão confirmada com o usuário: zero mudança nos ~30 call-sites de `src/lib/api.ts`, porque tanto dev (`vite.config.ts` proxy) quanto produção servem front+API same-origin, e o browser manda o cookie sozinho.
- **Legado**: dado criado antes desta feature (`tenant_id IS NULL`) é adotado automaticamente pelo primeiro signup depois do deploy. Isso só roda uma vez (checagem `count(tenants) = 0` antes do insert) — nenhum tenant criado depois disso reclama dado de ninguém.
- **Refresh scheduler** (`server/src/refreshScheduler.ts`) continua operando sem contexto de tenant — é processo interno, não request de usuário; nenhuma mudança necessária.
- **`/api/public/:slug`** continua deliberadamente sem auth — é o mecanismo de link público, cross-tenant por natureza.
- **E-mail em dev**: sem `RESEND_API_KEY` configurada, os `resend.emails.send(...)` vão falhar — nas rotas de convite/reset isso deve logar o erro mas não vazar detalhe pro response (já é o padrão dos catches existentes no projeto, ex. `server/src/routes/connections.ts:95-98`).

## Questões em Aberto

Nenhuma.
