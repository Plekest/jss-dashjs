import type { DashboardChartRecord } from 'dashjs'
import type { DashboardTemplate } from './types'

const charts: DashboardChartRecord[] = [
  {
    dashboard_chart_id: 1,
    dashboard_page_id: 1,
    dashboard_chart_type: 'kpi',
    dashboard_chart_title: 'Receita total',
    dashboard_chart_x: 0,
    dashboard_chart_y: 0,
    dashboard_chart_w: 3,
    dashboard_chart_h: 2,
    dashboard_chart_config: {
      slots: { metric: { fieldId: 'Receita', aggregation: 'sum' } },
      labels: { valueFormat: 'currency', currencyCode: 'BRL', compact: true },
    },
  },
  {
    dashboard_chart_id: 2,
    dashboard_page_id: 1,
    dashboard_chart_type: 'bar',
    dashboard_chart_title: 'Receita por região',
    dashboard_chart_x: 0,
    dashboard_chart_y: 2,
    dashboard_chart_w: 6,
    dashboard_chart_h: 4,
    dashboard_chart_config: {
      slots: {
        dimension: { fieldId: 'Região' },
        metric: { fieldId: 'Receita', aggregation: 'sum' },
      },
      labels: { showValues: true, showLegend: false, valueFormat: 'currency', currencyCode: 'BRL', compact: true },
    },
  },
  {
    dashboard_chart_id: 3,
    dashboard_page_id: 1,
    dashboard_chart_type: 'line',
    dashboard_chart_title: 'Receita por mês',
    dashboard_chart_x: 6,
    dashboard_chart_y: 2,
    dashboard_chart_w: 6,
    dashboard_chart_h: 4,
    dashboard_chart_config: {
      slots: {
        dimension: { fieldId: 'Mês' },
        metric: { fieldId: 'Receita', aggregation: 'sum' },
      },
      labels: { showValues: false, showLegend: false, valueFormat: 'currency', currencyCode: 'BRL', compact: true },
    },
  },
]

const rows = [
  { Região: 'Sudeste', Mês: 'Jan', Receita: '48200' },
  { Região: 'Sudeste', Mês: 'Fev', Receita: '51300' },
  { Região: 'Sudeste', Mês: 'Mar', Receita: '55900' },
  { Região: 'Sul', Mês: 'Jan', Receita: '21400' },
  { Região: 'Sul', Mês: 'Fev', Receita: '23800' },
  { Região: 'Sul', Mês: 'Mar', Receita: '25100' },
  { Região: 'Nordeste', Mês: 'Jan', Receita: '18900' },
  { Região: 'Nordeste', Mês: 'Fev', Receita: '19700' },
  { Região: 'Nordeste', Mês: 'Mar', Receita: '22300' },
  { Região: 'Centro-Oeste', Mês: 'Jan', Receita: '12100' },
  { Região: 'Centro-Oeste', Mês: 'Fev', Receita: '13400' },
  { Região: 'Centro-Oeste', Mês: 'Mar', Receita: '14800' },
  { Região: 'Norte', Mês: 'Jan', Receita: '8300' },
  { Região: 'Norte', Mês: 'Fev', Receita: '8900' },
  { Região: 'Norte', Mês: 'Mar', Receita: '9600' },
]

export const salesTemplate: DashboardTemplate = {
  id: 'sales',
  name: 'Vendas',
  description: 'Receita por região e por mês, com KPI de total.',
  build: () => ({
    dashboard_id: Date.now(),
    dashboard_name: 'Vendas',
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
      fileName: 'vendas-exemplo.csv',
      rows,
    },
  }),
}
