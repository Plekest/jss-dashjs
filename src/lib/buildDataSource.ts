// buildDataSource — adapts a host dataset (columns + data matrix) to the
// DashJsDataSource contract.
//
// Field-id contract: every hook keys fields positionally as `col_N`.
//  - listFields()   → ids col_0..col_N (names = column titles)
//  - getChartData() → resolves dimension/metric slot ids `col_N`
//  - getRawRows()   → rows keyed by `col_N` (values stringified) for the
//    active dataset only
//  - getSourceRows(id) → same shape, for ANY dataset by id (Blend builder)
// dashjs evaluates calculated fields client-side against getRawRows(), so
// calc formulas over host data reference `[col_N]` tokens — the calc editor
// inserts field ids, keeping formulas consistent with this contract.

import type { DashJsDataSource, DataField, ChartDataSeries, DashboardChartRecord, DashboardFilter, NamedSourceMeta } from 'dashjs'
import { matchValue, parseFlexibleDate } from 'dashjs'
import { datasetsApi, type Dataset } from './api'

export interface DatasetLike {
  columns: { title: string }[]
  data: (string | number)[][]
}

/** Converts any host dataset's columns/data into the col_N-keyed row shape
 *  dashjs expects from getRawRows/getSourceRows. */
function datasetToRows(ds: Pick<Dataset, 'columns' | 'data'>): Record<string, string>[] {
  return ds.data.map((row) => {
    const rec: Record<string, string> = {}
    ds.columns.forEach((_col, i) => {
      rec[`col_${i}`] = String(row[i] ?? '')
    })
    return rec
  })
}

function guessFieldType(data: (string | number)[][], colIndex: number): DataField['type'] {
  for (const row of data.slice(0, 20)) {
    const val = row[colIndex]
    if (val !== undefined && val !== '') {
      if (typeof val === 'number' || !isNaN(Number(val))) return 'numeric'
      if (parseFlexibleDate(String(val)) !== null) return 'date'
      return 'text'
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

    // matchValue implements the full operator set (in/not_in/eq/neq/contains/
    // gt/gte/lt/lte/between with numeric-vs-date-vs-lexicographic handling) —
    // reimplementing a subset here previously meant daterange controls
    // ('between') and numeric range filters were silently ignored.
    const passesFilters = filters.every((f) => {
      const fColIndex = parseInt(f.fieldId.replace('col_', ''), 10)
      if (isNaN(fColIndex)) return true
      const cellVal = String(row[fColIndex] ?? '')
      return matchValue(cellVal, f)
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

    // Raw rows keyed by col_N (same ids as listFields) — enables dashjs to
    // evaluate calculated fields client-side over host data.
    getRawRows: (): Record<string, string>[] => (source ? datasetToRows(source) : []),

    // Every dataset the host has — independent of `source` (the dashboard's
    // own active dataset) — so the Blend builder can offer them all.
    listSources: async (): Promise<NamedSourceMeta[]> => {
      const metas = await datasetsApi.list()
      return metas.map((m) => ({ id: m.id, label: m.name }))
    },

    // Row data for any dataset by id, fetched on demand when the user picks
    // it in the Blend builder (dashjs caches the result afterwards).
    getSourceRows: async (id: string): Promise<Record<string, string>[]> => {
      const ds = await datasetsApi.get(id)
      return datasetToRows(ds)
    },
  }
}
