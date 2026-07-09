export interface DatasetMeta {
  id: string
  name: string
  sourceType: string
  rowCount: number
  connectionId: string | null
  refreshIntervalMinutes: number | null
  nextRefreshAt: string | null
  lastRefreshedAt: string | null
  lastRefreshError: string | null
  createdAt: string
  updatedAt: string
}

/** One tab of the rich sheet editor (pro mode only). `data` holds the
 *  calculated values (getData(true)); `formulas` holds the raw formulas
 *  (getData(false)) so the tab can reopen with fórmulas editable. */
export interface DatasetWorksheet {
  name: string
  columns: { title: string }[]
  data: (string | number)[][]
  formulas?: (string | number)[][]
}

/** Pro-mode-only persistence: multi-tab layout with raw formulas. Absent or
 *  empty in simple mode. `columns`/`data` on Dataset always mirror the first
 *  worksheet's calculated values, so hosts that only read those never see a
 *  difference. */
export interface DatasetMetaPayload {
  worksheets?: DatasetWorksheet[]
}

export interface Dataset extends DatasetMeta {
  columns: { title: string }[]
  data: (string | number)[][]
  meta?: DatasetMetaPayload
  sourceSql: string | null
}

export interface DatasetRefreshLogEntry {
  datasetId: string
  datasetName: string
  refreshedAt: string
}

export interface DashboardMeta {
  id: string
  name: string
  datasetId: string | null
  slug: string | null
  published: boolean
  publishedAt: string | null
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface PublicDashboard {
  id: string
  name: string
  definition: object
  dataset: { columns: { title: string }[]; data: (string | number)[][] } | null
}

export interface DashboardRecord extends DashboardMeta {
  definition: object
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event('auth:unauthorized'))
    }
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

export interface ConnectionMeta {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export const connectionsApi = {
  list: () => fetch('/api/connections').then(json<ConnectionMeta[]>),

  create: (d: { name: string; type: 'bigquery' | 'postgres'; credentials: string | Record<string, unknown>; location?: string }) =>
    fetch('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<ConnectionMeta>),

  remove: (id: string, opts?: { force?: boolean }) =>
    fetch(`/api/connections/${id}${opts?.force ? '?force=true' : ''}`, { method: 'DELETE' }),

  test: (id: string) =>
    fetch(`/api/connections/${id}/test`, { method: 'POST' }).then(json<{ ok: boolean; error?: string }>),

  preview: (id: string, sql: string) =>
    fetch(`/api/connections/${id}/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sql }),
    }).then(json<{ columns: { title: string }[]; data: (string | number)[][] }>),

  ingest: (id: string, sql: string, name: string, refreshIntervalMinutes?: number | null) =>
    fetch(`/api/connections/${id}/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sql, name, refreshIntervalMinutes }),
    }).then(json<Dataset>),

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
}

export const datasetsApi = {
  list: () =>
    fetch('/api/datasets').then(json<DatasetMeta[]>),

  get: (id: string) =>
    fetch(`/api/datasets/${id}`).then(json<Dataset>),

  create: (d: Pick<Dataset, 'name' | 'sourceType' | 'columns' | 'data'>) =>
    fetch('/api/datasets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<Dataset>),

  update: (id: string, d: Partial<Pick<Dataset, 'name' | 'columns' | 'data' | 'meta'>>) =>
    fetch(`/api/datasets/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<Dataset>),

  remove: (id: string) =>
    fetch(`/api/datasets/${id}`, { method: 'DELETE' }),

  updateRefreshSchedule: (id: string, refreshIntervalMinutes: number | null) =>
    fetch(`/api/datasets/${id}/refresh-schedule`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshIntervalMinutes }),
    }).then(json<Dataset>),

  refreshNow: (id: string) =>
    fetch(`/api/datasets/${id}/refresh-now`, { method: 'POST' }).then(json<Dataset>),

  refreshLog: (days = 7) =>
    fetch(`/api/datasets/refresh-log?days=${days}`).then(json<DatasetRefreshLogEntry[]>),
}

export const dashboardsApi = {
  list: () =>
    fetch('/api/dashboards').then(json<DashboardMeta[]>),

  get: (id: string) =>
    fetch(`/api/dashboards/${id}`).then(json<DashboardRecord>),

  create: (d: { name: string; definition: object; datasetId?: string | null }) =>
    fetch('/api/dashboards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<DashboardRecord>),

  update: (id: string, d: Partial<{ name: string; definition: object; datasetId: string | null }>) =>
    fetch(`/api/dashboards/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<DashboardRecord>),

  remove: (id: string) =>
    fetch(`/api/dashboards/${id}`, { method: 'DELETE' }),

  publish: (id: string) =>
    fetch(`/api/dashboards/${id}/publish`, { method: 'POST' }).then(json<DashboardMeta>),

  unpublish: (id: string) =>
    fetch(`/api/dashboards/${id}/unpublish`, { method: 'POST' }).then(json<DashboardMeta>),

  pin: (id: string) =>
    fetch(`/api/dashboards/${id}/pin`, { method: 'POST' }).then(json<DashboardMeta>),

  unpin: (id: string) =>
    fetch(`/api/dashboards/${id}/unpin`, { method: 'POST' }).then(json<DashboardMeta>),
}

export interface DashboardVersionMeta {
  id: string
  name: string | null
  createdAt: string
  createdBy: string | null
  createdByName: string | null
}

export interface DashboardVersion extends DashboardVersionMeta {
  definition: object
}

export const dashboardVersionsApi = {
  list: (dashboardId: string) =>
    fetch(`/api/dashboards/${dashboardId}/versions`).then(json<DashboardVersionMeta[]>),

  get: (dashboardId: string, versionId: string) =>
    fetch(`/api/dashboards/${dashboardId}/versions/${versionId}`).then(json<DashboardVersion>),

  create: (dashboardId: string, name?: string) =>
    fetch(`/api/dashboards/${dashboardId}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(json<DashboardVersionMeta>),

  restore: (dashboardId: string, versionId: string) =>
    fetch(`/api/dashboards/${dashboardId}/versions/${versionId}/restore`, { method: 'POST' }).then(
      json<DashboardRecord>,
    ),
}

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

export type Aggregation = 'sum' | 'mean' | 'count' | 'max' | 'min'
export type ThresholdOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq'

export interface Alert {
  id: string
  datasetId: string
  name: string
  columnName: string
  aggregation: Aggregation
  operator: ThresholdOperator
  threshold: number
  recipients: string[]
  renotifyAfterMinutes: number | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface AlertEvent {
  id: string
  alertId: string
  triggeredAt: string
  resolvedAt: string | null
  value: number
  notifiedAt: string
}

export const alertsApi = {
  list: (datasetId?: string) =>
    fetch(`/api/alerts${datasetId ? `?datasetId=${datasetId}` : ''}`).then(json<Alert[]>),

  get: (id: string) => fetch(`/api/alerts/${id}`).then(json<Alert>),

  create: (d: {
    datasetId: string; name: string; columnName: string; aggregation: Aggregation
    operator: ThresholdOperator; threshold: number; recipients: string[]; renotifyAfterMinutes?: number | null
  }) =>
    fetch('/api/alerts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<Alert>),

  update: (id: string, d: Partial<{
    name: string; columnName: string; aggregation: Aggregation; operator: ThresholdOperator
    threshold: number; recipients: string[]; renotifyAfterMinutes: number | null; active: boolean
  }>) =>
    fetch(`/api/alerts/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<Alert>),

  remove: (id: string) => fetch(`/api/alerts/${id}`, { method: 'DELETE' }),

  listEvents: (id: string) => fetch(`/api/alerts/${id}/events`).then(json<AlertEvent[]>),
}

export interface ReportMetric {
  label: string
  column: string
  aggregation: Aggregation
}

export interface ScheduledReport {
  id: string
  dashboardId: string
  name: string
  metrics: ReportMetric[]
  recipients: string[]
  cron: string
  nextRunAt: string
  lastRunAt: string | null
  lastRunError: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export const scheduledReportsApi = {
  list: (dashboardId?: string) =>
    fetch(`/api/scheduled-reports${dashboardId ? `?dashboardId=${dashboardId}` : ''}`).then(json<ScheduledReport[]>),

  get: (id: string) => fetch(`/api/scheduled-reports/${id}`).then(json<ScheduledReport>),

  create: (d: { dashboardId: string; name: string; metrics: ReportMetric[]; recipients: string[]; cron: string }) =>
    fetch('/api/scheduled-reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<ScheduledReport>),

  update: (id: string, d: Partial<{ name: string; metrics: ReportMetric[]; recipients: string[]; cron: string; active: boolean }>) =>
    fetch(`/api/scheduled-reports/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<ScheduledReport>),

  remove: (id: string) => fetch(`/api/scheduled-reports/${id}`, { method: 'DELETE' }),
}

export const publicApi = {
  get: (slug: string) =>
    fetch(`/api/public/${slug}`).then(json<PublicDashboard>),
}

export type Role = 'owner' | 'editor' | 'viewer'

export interface AuthUser {
  id: string
  email: string
  name: string
}

export interface AuthTenant {
  id: string
  name: string
}

export interface MeResponse {
  user: AuthUser
  tenant: AuthTenant
  role: Role
}

export interface TenantSelectionResponse {
  needsTenantSelection: true
  tenants: { id: string; name: string }[]
}

export interface Member {
  id: string
  email: string
  name: string
  role: Role
}

export interface Invite {
  id: string
  email: string
  role: Role
  expiresAt: string
  createdAt: string
}

export interface InvitePreview {
  email: string
  tenantName: string
  role: Role
  hasAccount: boolean
}

export const authApi = {
  signup: (d: { name: string; email: string; password: string; tenantName: string }) =>
    fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<MeResponse>),

  login: (d: { email: string; password: string }) =>
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<MeResponse | TenantSelectionResponse>),

  logout: () => fetch('/api/auth/logout', { method: 'POST' }),

  me: () => fetch('/api/auth/me').then(json<MeResponse>),

  updateProfile: (d: { name?: string; currentPassword?: string; newPassword?: string }) =>
    fetch('/api/auth/me', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<{ user: AuthUser }>),

  selectTenant: (tenantId: string) =>
    fetch('/api/auth/select-tenant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId }),
    }).then(json<{ tenant: AuthTenant; role: Role }>),

  forgotPassword: (email: string) =>
    fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    }).then(json<{ ok: boolean }>),

  resetPassword: (token: string, password: string) =>
    fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password }),
    }).then(json<{ ok: boolean }>),

  getInvite: (token: string) =>
    fetch(`/api/auth/invites/${token}`).then(json<InvitePreview>),

  acceptInvite: (token: string, d: { name: string; password: string }) =>
    fetch(`/api/auth/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
    }).then(json<MeResponse>),

  acceptInviteExisting: (token: string) =>
    fetch(`/api/auth/invites/${token}/accept-existing`, { method: 'POST' }).then(
      json<{ tenant: AuthTenant; role: Role }>,
    ),
}

export const membersApi = {
  list: () => fetch('/api/members').then(json<Member[]>),

  listInvites: () => fetch('/api/members/invites').then(json<Invite[]>),

  invite: (email: string, role: Role) =>
    fetch('/api/members/invites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role }),
    }).then(json<Invite>),

  revokeInvite: (id: string) => fetch(`/api/members/invites/${id}`, { method: 'DELETE' }),

  updateRole: (userId: string, role: Role) =>
    fetch(`/api/members/${userId}/role`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    }).then(json<{ ok: boolean }>),

  remove: (userId: string) => fetch(`/api/members/${userId}`, { method: 'DELETE' }),

  updateTenant: (name: string) =>
    fetch('/api/members/tenant', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(json<{ tenant: AuthTenant }>),
}
