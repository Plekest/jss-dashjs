# Security Review — jss_dashjs (full project)

Scope: full codebase (`src/` frontend, `server/` backend). Methodology: structural map of auth/authz/crypto/DB/connectors/email surfaces, followed by targeted vulnerability hunting and independent false-positive filtering per finding (only findings scoring ≥8/10 confidence are reported).

**Status: all 4 findings below have been fixed.** See `git log` for the corresponding commits/diffs. Descriptions kept as-is (pre-fix state) for audit-trail purposes.

---

# Vuln 1: Hardcoded insecure fallback secrets (session signing key & credential encryption key): `server/src/auth.ts:10`, `server/src/crypto.ts:3-5`

* Severity: High
* Category: `hardcoded-credentials` / `insecure-default-secret` (CWE-798 / CWE-1188)
* Description: Both the Express session-signing secret and the AES-256-GCM key used to encrypt every tenant's stored data-connection credentials (Postgres passwords, BigQuery service-account JSON) fall back to the identical hardcoded literal `'dev-insecure-secret'` if their respective env vars are unset:
  ```js
  // server/src/auth.ts:10
  secret: process.env.SESSION_SECRET ?? 'dev-insecure-secret',

  // server/src/crypto.ts:3-5
  const KEY = createHash('sha256')
    .update(process.env.CONNECTIONS_SECRET ?? 'dev-insecure-secret')
    .digest()
  ```
  `docker-compose.yml:24-25` reinforces the same insecure default (`${SESSION_SECRET:-dev-insecure-secret}`, `${CONNECTIONS_SECRET:-dev-insecure-secret}`), and `.env.example` documents `SESSION_SECRET=` as blank with no mention of `CONNECTIONS_SECRET` at all — an operator following the example file has no signal that this is a required, must-be-random secret. There is no startup check anywhere in `server/src/index.ts` that refuses to boot (or even warns) when either env var is missing — the app silently runs with the known-constant key.
* Exploit Scenario: If either env var is absent in a real deployment (misconfigured environment, forgotten in a new staging/prod instance, or left at the docker-compose default), an attacker who knows the source (this is the shipped default in a versioned repo) can: (1) forge valid signed session cookies using the known `SESSION_SECRET`, achieving full authentication bypass into any tenant; and/or (2) derive the exact AES-256-GCM key from the known `CONNECTIONS_SECRET` string and decrypt every stored connection's credentials (raw DB passwords, BigQuery service-account private keys) directly from the `connections.credentials` column if the database is ever exposed or exfiltrated.
* Recommendation: Fail fast at startup (`process.exit(1)` or throw) if `SESSION_SECRET` or `CONNECTIONS_SECRET` is unset or equals the placeholder value, instead of silently falling back. Document both as required secrets in `.env.example` with a note to generate them via a strong random generator (e.g. `openssl rand -base64 32`). Remove the shared docker-compose default so local dev either generates a random value or is forced to set one explicitly.
* **Status: FIXED.** Added `server/src/env.ts` (`requireSecret()`) — `process.exit(1)` with a clear error if `SESSION_SECRET`/`CONNECTIONS_SECRET` is unset or still `'dev-insecure-secret'`; `auth.ts` and `crypto.ts` now call it instead of falling back. `docker-compose.yml` uses the `${VAR:?err}` mandatory-variable syntax (compose itself refuses to start without it). `.env.example` documents `CONNECTIONS_SECRET` and both `openssl rand -base64 32` generation notes.

---

# Vuln 2: SSRF + missing authorization on adhoc connection test/preview routes: `server/src/routes/connections.ts:117,130`

* Severity: High
* Category: `ssrf` / `broken_access_control`
* Description: `router.use(requireAuth)` (`connections.ts:10`) gates the whole router to any authenticated tenant member, but individual mutating routes additionally require `requireRole('owner','editor')` (lines 70, 145, 188). Two routes — `POST /test-adhoc` (line 117) and `POST /preview-adhoc` (line 130) — only have the router-level `requireAuth`, with no role check, so a `viewer`-role user (explicitly barred from creating/editing connections elsewhere in the app) can reach them:
  ```js
  router.post('/test-adhoc', async (req, res) => {
    const { type, credentials, location } = req.body
    const parsed = parseCredentials(type, credentials)
    await runQueryAdhoc(type, parsed, 'SELECT 1 AS ok', 1, location)
    ...
  })
  router.post('/preview-adhoc', async (req, res) => {
    const { type, credentials, sql, location } = req.body
    const parsed = parseCredentials(type, credentials)
    res.json(await runQueryAdhoc(type, parsed, sql, 50, location))
    ...
  })
  ```
  For `type: 'postgres'`, these flow into `runQueryWithCredentials` (`server/src/postgres.ts:27-49`), which opens a raw `pg.Client` directly against attacker-supplied `creds.host`/`creds.port`/`creds.user`/`creds.password`/`creds.database` and executes attacker-supplied `sql` (for `preview-adhoc`). `parseCredentials` (`connections.ts:36-57`) only checks required-key presence — no host/port allowlist, no format validation, and — unlike every credential-backed route (`/:id/test`, `/:id/preview`) — no `assertOwnedByTenant` check, since there's no persisted row to own.
* Exploit Scenario: An authenticated `viewer` (or any tenant member) POSTs `{"type":"postgres","credentials":{"host":"169.254.169.254","port":5432,"user":"x","password":"x","database":"x"}}` (or any internal IP/port reachable from the app server) to `/api/connections/test-adhoc`. The server itself opens the TCP connection, using itself as a network proxy to probe hosts on its internal network that the attacker cannot reach directly. Connection success/failure and Postgres protocol error text returned in the response let the attacker fingerprint internal services (open ports, DB banners); `preview-adhoc` further allows running arbitrary SQL against any reachable Postgres instance the attacker can authenticate to (e.g. one with default/weak credentials on an internal host), fully bypassing the owner/editor authorization boundary enforced on every other connection-management route.
* Recommendation: Add `requireRole('owner','editor')` to both `/test-adhoc` and `/preview-adhoc` to match the authorization level of every other connection-mutating route. Additionally, validate/allowlist `credentials.host` to reject loopback, link-local (`169.254.0.0/16`), and RFC1918 private ranges unless explicitly intended for on-prem connector use, to close the SSRF vector even for authorized roles.
* **Status: FIXED.** `requireRole('owner','editor')` added to both `/test-adhoc` and `/preview-adhoc` (`server/src/routes/connections.ts`). Added `server/src/network.ts` (`isBlockedHost()`) rejecting loopback/`localhost`/`0.0.0.0`, RFC1918 (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`, incl. cloud metadata IP), and IPv6 link-local/unique-local — applied to the `postgres` branch of both adhoc routes before any connection is attempted.

---

# Vuln 3: Unescaped HTML injection in outbound transactional emails: `server/src/email.ts:13,29,33,46-47`

* Severity: Medium
* Category: `html-injection` / `content-injection` (CWE-79 variant — injection into recipient-rendered HTML outside this app's own frontend)
* Confiança: 8/10
* Description: All four email-sending functions in `server/src/email.ts` build HTML by directly interpolating user-controlled strings into template literals with **no escaping**:
  ```js
  // sendInviteEmail — email.ts:13
  html: `<p>${inviterName} convidou você para colaborar no tenant <b>${tenantName}</b>.</p>...`,

  // sendReportEmail — email.ts:29,32-33
  const rows = metrics.map((m) => `<tr><td>${m.label}</td><td><b>${m.value}</b></td></tr>`).join('')
  html: `<p>Resumo agendado do dashboard <b>${dashboardName}</b>:</p>...`,

  // sendAlertEmail — email.ts:46-47
  html: `<p>O alerta <b>${alertName}</b> no dataset <b>${datasetName}</b> foi disparado.</p>...`,
  ```
  Every interpolated field is attacker-settable with only presence/`.trim()` checks and no DB-level constraint:
  - `inviterName` = the caller's own profile `name` (`server/src/routes/auth.ts:162`, `PUT /me`, only `name.trim()` checked) and `tenantName` = `tenants.name` (`auth.ts:34-37`, signup, presence-only) — both flow into `sendInviteEmail` via `server/src/routes/members.ts:89`, where the invite `email` recipient (line 76) is **also unvalidated** (any string, not required to be an existing user or tenant member).
  - `alertName`/`datasetName` = `alerts.name`/`datasets.name` (`server/src/routes/alerts.ts:47`, presence-only; flows via `server/src/alertScheduler.ts:55,63`).
  - `reportName`/`dashboardName`/`m.label` = `scheduled_reports.name` and dashboard/metric labels (`server/src/routes/scheduledReports.ts:36`, presence-only; flows via `server/src/reportScheduler.ts:59`).
  - `server/db/init.sql` confirms `users.name`, `tenants.name`, `alerts.name`, `scheduled_reports.name` are all plain `text NOT NULL` with no `CHECK` constraint restricting content.
  - Recipient arrays (`alerts.recipients`, `scheduled_reports.recipients`) are only checked with `Array.isArray(...) && .length` — no email-format validation, so any tenant editor/owner can target arbitrary external addresses.
* Cenário de exploração: An attacker with (or who signs up for, since signup is open) any tenant account sets their own profile `name` (via `PUT /api/auth/me`) or their tenant's `name` (via `PUT /api/members/tenant`, owner-only but trivial to obtain as the tenant's first/only owner) to a crafted HTML payload (e.g. fake "your account was compromised, click here" content, spoofed sender-look-alike branding, or embedded tracking/phishing links via `<a>`/`<img>` tags). They then invite an arbitrary external email address via `POST /api/members/invites`. Resend delivers the resulting HTML email — built from the attacker's raw injected content — to the victim's mail client, framed as a legitimate "you've been invited to JSS Dashjs" notification. The same technique applies to alert/report emails by naming an alert/dataset/report with injected HTML, then setting `recipients` to an arbitrary external address. Realistic impact is phishing-quality content and link injection inside a legitimately-sent transactional email (exact script execution depends on the recipient's mail client HTML sanitization, which varies), not guaranteed remote code execution.
* Recomendação: HTML-escape all interpolated values before building the email templates (e.g. a small `escapeHtml()` helper applied to every `${...}` insertion in `email.ts`), or switch to a templating approach that auto-escapes by default. Additionally, validate invite/report/alert recipient fields as well-formed email addresses at the route layer, and consider capping/sanitizing free-text `name` fields (profile, tenant, alert, dataset, report) at a reasonable length.
* **Status: FIXED.** Added `escapeHtml()` in `server/src/email.ts`, applied to every interpolated field in all four templates (`inviterName`, `tenantName`, `alertName`, `datasetName`, `reportName`/dashboard name, metric labels/values, operator/threshold). Added `server/src/validate.ts` (`isValidEmail()`) enforced on invite email (`members.ts`) and on alert/report `recipients` arrays on both create and update routes.

---

# Vuln 4: TLS certificate validation disabled for all Postgres connector connections: `server/src/postgres.ts:34`

* Severity: Medium
* Category: `insecure-tls` / `mitm` (CWE-295 — Improper Certificate Validation)
* Confiança: 8/10
* Description: Every Postgres connection this app makes — whether to a persisted, tenant-owned connection or to an unauthenticated-role-gated adhoc test/preview — passes through the same line:
  ```js
  // server/src/postgres.ts:27-35
  const client = new pg.Client({
    host: creds.host,
    port: creds.port,
    ...
    ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
  })
  ```
  When a user enables the "Usar SSL" checkbox (`src/components/AddDataSourceWizard.tsx:422-425`, `src/pages/ConnectionsPage.tsx:490-498` — the only SSL-related UI in the app, with no CA-upload field or `sslmode` selector), the connection negotiates TLS but `rejectUnauthorized: false` means the server certificate is **never validated** — any certificate, including a self-signed one presented by an attacker, is accepted. Both the persisted-connection path (`connections.ts:160-208` → `runQuery` → `credentialsFor` → this function) and the adhoc path (`connections.ts:117-140` → `runQueryAdhoc`, see Vuln 2) converge on this identical, single `ssl` object literal — there is no code path anywhere in the app where a Postgres server certificate is actually verified. (BigQuery, by contrast, rides on the `@google-cloud/bigquery` SDK's standard HTTPS/CA-trust stack against Google's fixed endpoints — this issue is Postgres-specific.)
* Cenário de exploração: An attacker positioned to intercept network traffic between the app server and a target Postgres host — e.g. ARP/DNS spoofing on a shared cloud VPC or LAN segment, or a compromised network device on that path — presents a self-signed certificate for the target host. Because `rejectUnauthorized: false` accepts any certificate, the app completes the TLS handshake with the attacker's endpoint instead of (or via a transparent proxy to) the real database, allowing the attacker to intercept the plaintext Postgres credentials and all query results/data in transit, despite the user having explicitly enabled "SSL" believing the connection was protected against exactly this.
* Recomendação: Default to `rejectUnauthorized: true`; expose an optional CA-certificate field in the connection UI for self-signed/private-CA targets instead of silently downgrading validation for every SSL-enabled connection. At minimum, relabel the checkbox to make clear that certificate validation is not performed, until proper `verify-full`-equivalent support is added.
* **Status: FIXED.** `server/src/postgres.ts:34` now sets `rejectUnauthorized: true` when `creds.ssl` is enabled, for both persisted and adhoc connections. Note: this means self-signed/private-CA Postgres targets will now fail to connect until a CA-upload option is added — out of scope for this fix, flagged for follow-up if self-signed on-prem targets are a real use case.
