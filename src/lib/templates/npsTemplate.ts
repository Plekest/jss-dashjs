import type { DashboardChartRecord } from 'dashjs'
import type { DashboardTemplate } from './types'

const charts: DashboardChartRecord[] = [
  {
    dashboard_chart_id: 1,
    dashboard_page_id: 1,
    dashboard_chart_type: 'kpi',
    dashboard_chart_title: 'Nota média geral',
    dashboard_chart_x: 0,
    dashboard_chart_y: 0,
    dashboard_chart_w: 3,
    dashboard_chart_h: 2,
    dashboard_chart_config: {
      slots: { metric: { fieldId: 'Nota', aggregation: 'mean' } },
      labels: { valueFormat: 'decimal1' },
    },
  },
  {
    dashboard_chart_id: 2,
    dashboard_page_id: 1,
    dashboard_chart_type: 'bar',
    dashboard_chart_title: 'Nota média por departamento',
    dashboard_chart_x: 0,
    dashboard_chart_y: 2,
    dashboard_chart_w: 6,
    dashboard_chart_h: 4,
    dashboard_chart_config: {
      slots: {
        dimension: { fieldId: 'Departamento' },
        metric: { fieldId: 'Nota', aggregation: 'mean' },
      },
      labels: { showValues: true, showLegend: false, valueFormat: 'decimal1' },
    },
  },
  {
    dashboard_chart_id: 3,
    dashboard_page_id: 1,
    dashboard_chart_type: 'line',
    dashboard_chart_title: 'Nota média por mês',
    dashboard_chart_x: 6,
    dashboard_chart_y: 2,
    dashboard_chart_w: 6,
    dashboard_chart_h: 4,
    dashboard_chart_config: {
      slots: {
        dimension: { fieldId: 'Mês' },
        metric: { fieldId: 'Nota', aggregation: 'mean' },
      },
      labels: { showValues: false, showLegend: false, valueFormat: 'decimal1' },
    },
  },
]

const rows = [
  { Departamento: 'Suporte', Mês: 'Jan', Nota: '8' },
  { Departamento: 'Suporte', Mês: 'Fev', Nota: '7' },
  { Departamento: 'Suporte', Mês: 'Mar', Nota: '9' },
  { Departamento: 'Vendas', Mês: 'Jan', Nota: '9' },
  { Departamento: 'Vendas', Mês: 'Fev', Nota: '9' },
  { Departamento: 'Vendas', Mês: 'Mar', Nota: '10' },
  { Departamento: 'Produto', Mês: 'Jan', Nota: '6' },
  { Departamento: 'Produto', Mês: 'Fev', Nota: '7' },
  { Departamento: 'Produto', Mês: 'Mar', Nota: '7' },
  { Departamento: 'Onboarding', Mês: 'Jan', Nota: '8' },
  { Departamento: 'Onboarding', Mês: 'Fev', Nota: '8' },
  { Departamento: 'Onboarding', Mês: 'Mar', Nota: '9' },
  { Departamento: 'Financeiro', Mês: 'Jan', Nota: '5' },
  { Departamento: 'Financeiro', Mês: 'Fev', Nota: '6' },
  { Departamento: 'Financeiro', Mês: 'Mar', Nota: '6' },
]

export const npsTemplate: DashboardTemplate = {
  id: 'nps',
  name: 'NPS',
  description: 'Nota média por departamento e por mês, com KPI de NPS geral.',
  build: () => ({
    dashboard_id: Date.now(),
    dashboard_name: 'NPS',
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
      fileName: 'nps-exemplo.csv',
      rows,
    },
  }),
}
