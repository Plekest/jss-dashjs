import type { DashJsDataSource } from 'dashjs'

export interface GA4ConnectorOptions {
  propertyId: string
  accessToken: string
}

/**
 * GA4 Phase 2 plan:
 * - Backend: Node/Express em /api/ga4 usando @googleapis/analyticsdata
 * - Auth: service account JSON no servidor (nunca exposto ao browser)
 * - React: GA4ConnectorOptions com propertyId (configurável por dashboard)
 * - Métricas: sessions, pageviews, users, bounceRate, avgSessionDuration
 * - Dimensões: country, city, deviceCategory, sessionSource, pagePath, date
 */
export function createGA4DataSource(_opts: GA4ConnectorOptions): DashJsDataSource {
  throw new Error('GA4 connector not implemented yet — coming in Phase 2')
}

export const GA4_COMING_SOON = true
