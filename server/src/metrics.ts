export type Aggregation = 'sum' | 'mean' | 'count' | 'max' | 'min'

export function computeMetric(
  columns: { title: string }[],
  data: (string | number)[][],
  column: string,
  aggregation: Aggregation,
): number {
  const colIndex = columns.findIndex((c) => c.title === column)
  if (colIndex === -1) throw new Error(`column not found: ${column}`)
  if (aggregation === 'count') return data.length

  const values = data
    .map((row) => (typeof row[colIndex] === 'number' ? row[colIndex] as number : parseFloat(String(row[colIndex]))))
    .filter((n) => !Number.isNaN(n))

  if (!values.length) return 0
  switch (aggregation) {
    case 'sum': return values.reduce((a, b) => a + b, 0)
    case 'mean': return values.reduce((a, b) => a + b, 0) / values.length
    case 'max': return Math.max(...values)
    case 'min': return Math.min(...values)
  }
}

export function evaluateThreshold(value: number, operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq', threshold: number): boolean {
  switch (operator) {
    case 'gt': return value > threshold
    case 'gte': return value >= threshold
    case 'lt': return value < threshold
    case 'lte': return value <= threshold
    case 'eq': return value === threshold
  }
}
