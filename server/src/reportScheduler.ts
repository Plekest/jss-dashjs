import type { Pool } from 'pg'
import { computeMetric, type Aggregation } from './metrics.js'
import { sendReportEmail } from './email.js'
import { nextRunFromCron } from './cron.js'

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173'

interface ReportMetricDef {
  label: string
  column: string
  aggregation: Aggregation
}

interface ReportRow {
  id: string
  name: string
  dashboard_id: string
  metrics: ReportMetricDef[]
  recipients: string[]
  cron: string
  dashboard_name: string
  columns: { title: string }[] | null
  data: (string | number)[][] | null
}

/** Polls every 60s for scheduled reports whose next_run_at is due, computes
 *  each metric off the dashboard's dataset, and emails the summary. A failed
 *  run doesn't halt the loop — it records last_run_error but still advances
 *  next_run_at, same pattern as refreshDataset. */
export function startReportScheduler(pool: Pool): void {
  async function tick() {
    const { rows: reports } = await pool.query(
      `SELECT r.*, d.name AS dashboard_name, ds.columns, ds.data
       FROM scheduled_reports r
       JOIN dashboards d ON d.id = r.dashboard_id
       LEFT JOIN datasets ds ON ds.id = d.dataset_id
       WHERE r.active = true AND r.next_run_at <= now()`,
    )
    for (const report of reports as ReportRow[]) {
      try {
        await runReport(pool, report)
      } catch (err) {
        console.error('[reportScheduler] failed for report', report.id, err)
      }
    }
  }
  setInterval(() => { void tick() }, 60_000)
}

async function runReport(pool: Pool, report: ReportRow) {
  try {
    if (!report.columns || !report.data) {
      throw new Error('dashboard has no linked dataset')
    }
    const metrics = report.metrics.map((m) => ({
      label: m.label,
      value: computeMetric(report.columns!, report.data!, m.column, m.aggregation),
    }))
    await sendReportEmail(
      report.recipients,
      report.name,
      report.dashboard_name,
      `${APP_URL}/dashboards/${report.dashboard_id}`,
      metrics,
    )
    const nextRunAt = nextRunFromCron(report.cron)
    await pool.query(
      'UPDATE scheduled_reports SET last_run_at = now(), last_run_error = NULL, next_run_at = $1 WHERE id = $2',
      [nextRunAt, report.id],
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const nextRunAt = nextRunFromCron(report.cron)
    await pool.query(
      'UPDATE scheduled_reports SET last_run_error = $1, next_run_at = $2 WHERE id = $3',
      [msg, nextRunAt, report.id],
    )
    throw err
  }
}
