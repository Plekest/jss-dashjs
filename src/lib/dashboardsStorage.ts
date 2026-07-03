import type { DashboardFull } from 'dashjs'
import { dashboardsApi } from './api'
import type { DashboardTemplate } from './templates/types'

export interface DashboardMeta {
  id: string
  name: string
  updatedAt: string
}

export async function listDashboards(): Promise<DashboardMeta[]> {
  const rows = await dashboardsApi.list()
  return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt }))
}

export async function loadDashboard(id: string): Promise<DashboardFull | null> {
  try {
    const row = await dashboardsApi.get(id)
    return row.definition as DashboardFull
  } catch {
    return null
  }
}

export async function saveDashboard(
  id: string,
  dashboard: DashboardFull,
  datasetId?: string | null,
): Promise<void> {
  await dashboardsApi.update(id, { definition: dashboard, datasetId: datasetId ?? null })
}

export async function deleteDashboard(id: string): Promise<void> {
  await dashboardsApi.remove(id)
}

export function createEmptyDashboard(name: string): DashboardFull {
  const id = Date.now()
  return {
    dashboard_id: id,
    dashboard_name: name,
    filters: [],
    pages: [
      {
        dashboard_page_id: 1,
        dashboard_page_name: 'Página 1',
        charts: [],
      },
    ],
  }
}

export async function createAndSaveDashboard(name: string): Promise<{ id: string; dashboard: DashboardFull }> {
  const dashboard = createEmptyDashboard(name)
  const row = await dashboardsApi.create({ name, definition: dashboard })
  return { id: row.id, dashboard }
}

export async function createAndSaveDashboardFromTemplate(
  name: string,
  template: DashboardTemplate,
): Promise<{ id: string; dashboard: DashboardFull }> {
  const dashboard = { ...template.build(), dashboard_name: name }
  const row = await dashboardsApi.create({ name, definition: dashboard })
  return { id: row.id, dashboard }
}
