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

/** One tab of the rich /sheets editor (pro mode only). `data` holds the
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

export interface DashboardMeta {
  id: string
  name: string
  datasetId: string | null
  slug: string | null
  published: boolean
  publishedAt: string | null
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
}

export const publicApi = {
  get: (slug: string) =>
    fetch(`/api/public/${slug}`).then(json<PublicDashboard>),
}
