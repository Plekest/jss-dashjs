import { salesTemplate } from './salesTemplate'
import { marketingTemplate } from './marketingTemplate'
import { npsTemplate } from './npsTemplate'
import type { DashboardTemplate } from './types'

export type { DashboardTemplate }
export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [salesTemplate, marketingTemplate, npsTemplate]
