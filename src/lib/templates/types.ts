import type { DashboardFull } from 'dashjs'

export interface DashboardTemplate {
  id: string
  name: string
  description: string
  /** Gera um DashboardFull fresco (novo dashboard_id) toda vez que é chamado —
   *  evita duas instâncias do mesmo template compartilharem referência. */
  build: () => DashboardFull
}
