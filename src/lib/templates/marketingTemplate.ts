import type { DashboardChartRecord } from 'dashjs'
import type { DashboardTemplate } from './types'

const charts: DashboardChartRecord[] = [
  {
    dashboard_chart_id: 1,
    dashboard_page_id: 1,
    dashboard_chart_type: 'kpi',
    dashboard_chart_title: 'Conversões totais',
    dashboard_chart_x: 0,
    dashboard_chart_y: 0,
    dashboard_chart_w: 3,
    dashboard_chart_h: 2,
    dashboard_chart_config: {
      slots: { metric: { fieldId: 'Conversões', aggregation: 'sum' } },
      labels: { valueFormat: 'number', compact: true },
    },
  },
  {
    dashboard_chart_id: 2,
    dashboard_page_id: 1,
    dashboard_chart_type: 'bar',
    dashboard_chart_title: 'Cliques por canal',
    dashboard_chart_x: 0,
    dashboard_chart_y: 2,
    dashboard_chart_w: 6,
    dashboard_chart_h: 4,
    dashboard_chart_config: {
      slots: {
        dimension: { fieldId: 'Canal' },
        metric: { fieldId: 'Cliques', aggregation: 'sum' },
      },
      labels: { showValues: true, showLegend: false, valueFormat: 'number', compact: true },
    },
  },
  {
    dashboard_chart_id: 3,
    dashboard_page_id: 1,
    dashboard_chart_type: 'line',
    dashboard_chart_title: 'Cliques por semana',
    dashboard_chart_x: 6,
    dashboard_chart_y: 2,
    dashboard_chart_w: 6,
    dashboard_chart_h: 4,
    dashboard_chart_config: {
      slots: {
        dimension: { fieldId: 'Semana' },
        metric: { fieldId: 'Cliques', aggregation: 'sum' },
      },
      labels: { showValues: false, showLegend: false, valueFormat: 'number', compact: true },
    },
  },
]

const rows = [
  { Canal: 'Google Ads', Semana: 'S1', Cliques: '3400', Conversões: '210' },
  { Canal: 'Google Ads', Semana: 'S2', Cliques: '3900', Conversões: '245' },
  { Canal: 'Google Ads', Semana: 'S3', Cliques: '4100', Conversões: '260' },
  { Canal: 'Facebook', Semana: 'S1', Cliques: '2100', Conversões: '98' },
  { Canal: 'Facebook', Semana: 'S2', Cliques: '2300', Conversões: '110' },
  { Canal: 'Facebook', Semana: 'S3', Cliques: '2050', Conversões: '101' },
  { Canal: 'Instagram', Semana: 'S1', Cliques: '1800', Conversões: '76' },
  { Canal: 'Instagram', Semana: 'S2', Cliques: '2000', Conversões: '84' },
  { Canal: 'Instagram', Semana: 'S3', Cliques: '2250', Conversões: '95' },
  { Canal: 'Email', Semana: 'S1', Cliques: '950', Conversões: '61' },
  { Canal: 'Email', Semana: 'S2', Cliques: '1020', Conversões: '68' },
  { Canal: 'Email', Semana: 'S3', Cliques: '1100', Conversões: '73' },
  { Canal: 'Orgânico', Semana: 'S1', Cliques: '5200', Conversões: '180' },
  { Canal: 'Orgânico', Semana: 'S2', Cliques: '5400', Conversões: '188' },
  { Canal: 'Orgânico', Semana: 'S3', Cliques: '5650', Conversões: '199' },
]

export const marketingTemplate: DashboardTemplate = {
  id: 'marketing',
  name: 'Marketing',
  description: 'Cliques por canal e evolução semanal, com KPI de conversões.',
  build: () => ({
    dashboard_id: Date.now(),
    dashboard_name: 'Marketing',
    filters: [],
    pages: [
      {
        dashboard_page_id: 1,
        dashboard_page_name: 'Página 1',
        charts,
        controls: [],
      },
    ],
    dataset: {
      source: 'import',
      fileName: 'marketing-exemplo.csv',
      rows,
    },
  }),
}
