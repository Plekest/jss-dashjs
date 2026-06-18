import type { DashJsDataSource, DataField, ChartDataSeries, DashboardChartRecord, DashboardFilter } from 'dashjs'

export interface DatasetLike {
  columns: { title: string }[]
  data: (string | number)[][]
}

function guessFieldType(data: (string | number)[][], colIndex: number): DataField['type'] {
  for (const row of data.slice(0, 20)) {
    const val = row[colIndex]
    if (val !== undefined && val !== '') {
      return typeof val === 'number' || !isNaN(Number(val)) ? 'numeric' : 'text'
    }
  }
  return 'text'
}

function aggregateSheetData(
  source: DatasetLike,
  dimensionColId: string,
  metricColId: string,
  filters: DashboardFilter[],
): ChartDataSeries[] {
  const colIndex = parseInt(dimensionColId.replace('col_', ''), 10)
  const metricIndex = parseInt(metricColId.replace('col_', ''), 10)

  if (isNaN(colIndex)) return []

  const map = new Map<string, number>()

  for (const row of source.data) {
    const label = String(row[colIndex] ?? '')
    if (!label) continue

    const passesFilters = filters.every((f) => {
      const fColIndex = parseInt(f.fieldId.replace('col_', ''), 10)
      if (isNaN(fColIndex)) return true
      const cellVal = String(row[fColIndex] ?? '')
      if (f.operator === 'in' || f.operator === 'eq') return f.values.includes(cellVal)
      if (f.operator === 'not_in' || f.operator === 'neq') return !f.values.includes(cellVal)
      return true
    })
    if (!passesFilters) continue

    const rawMetric = !isNaN(metricIndex) ? row[metricIndex] : 1
    const metric = typeof rawMetric === 'number' ? rawMetric : parseFloat(String(rawMetric)) || 1
    map.set(label, (map.get(label) ?? 0) + metric)
  }

  return [
    {
      name: !isNaN(metricIndex) ? (source.columns[metricIndex]?.title ?? 'Valor') : 'Contagem',
      data: Array.from(map.entries()).map(([label, value]) => ({ label, value })),
    },
  ]
}

export function buildDataSource(source: DatasetLike | null): DashJsDataSource {
  return {
    listFields: (): DataField[] => {
      if (!source) return []
      return source.columns.map((col, i) => ({
        id: `col_${i}`,
        name: col.title,
        type: guessFieldType(source.data, i),
      }))
    },

    getChartData: (chart: DashboardChartRecord, filters: DashboardFilter[]): ChartDataSeries[] => {
      if (!source) return []
      const config = chart.dashboard_chart_config
      const dimensionId =
        config?.slots?.['dimension']?.fieldId ??
        config?.dimension?.questionCode ??
        ''
      const metricId =
        config?.slots?.['metric']?.fieldId ??
        'col_1'
      return aggregateSheetData(source, dimensionId, metricId, filters)
    },
  }
}
