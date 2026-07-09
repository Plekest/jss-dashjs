import { useEffect, useRef } from 'react'
import { renderChart, type DashboardChartRecord } from 'dashjs'
import 'dashjs/styles'

interface Props {
  chart: DashboardChartRecord
  height?: number | string
}

/** Mounts a single dashjs chart standalone (no dashboard/pages/dataSource
 *  needed) — for metric cards outside the dashboard editor, e.g. Home. */
export function MiniChart({ chart, height = 120 }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const handle = renderChart(ref.current, chart)
    return () => handle.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart])

  return <div ref={ref} style={{ width: '100%', height }} />
}
