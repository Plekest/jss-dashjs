import type { Pool } from 'pg'
import { computeMetric, evaluateThreshold, type Aggregation } from './metrics.js'
import { sendAlertEmail } from './email.js'

interface AlertRow {
  id: string
  name: string
  column_name: string
  aggregation: Aggregation
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
  threshold: string
  recipients: string[]
  renotify_after_minutes: number | null
  dataset_name: string
  columns: { title: string }[]
  data: (string | number)[][]
}

/** Polls every 60s for active alerts, edge-triggering an email when the
 *  computed metric crosses the threshold (see evaluateAlert). A failed
 *  alert doesn't halt the loop — same pattern as refreshScheduler. */
export function startAlertScheduler(pool: Pool): void {
  async function tick() {
    const { rows: alerts } = await pool.query(
      `SELECT a.*, d.name AS dataset_name, d.columns, d.data
       FROM alerts a JOIN datasets d ON d.id = a.dataset_id
       WHERE a.active = true`,
    )
    for (const alert of alerts as AlertRow[]) {
      try {
        await evaluateAlert(pool, alert)
      } catch (err) {
        console.error('[alertScheduler] failed for alert', alert.id, err)
      }
    }
  }
  setInterval(() => { void tick() }, 60_000)
}

async function evaluateAlert(pool: Pool, alert: AlertRow) {
  const value = computeMetric(alert.columns, alert.data, alert.column_name, alert.aggregation)
  const breaching = evaluateThreshold(value, alert.operator, Number(alert.threshold))

  const { rows: openRows } = await pool.query(
    'SELECT * FROM alert_events WHERE alert_id = $1 AND resolved_at IS NULL',
    [alert.id],
  )
  const open = openRows[0]

  if (breaching && !open) {
    await pool.query(
      'INSERT INTO alert_events (alert_id, value, notified_at) VALUES ($1, $2, now())',
      [alert.id, value],
    )
    await sendAlertEmail(alert.recipients, alert.name, alert.dataset_name, value, alert.operator, Number(alert.threshold))
    return
  }

  if (breaching && open && alert.renotify_after_minutes) {
    const minutesSinceNotify = (Date.now() - new Date(open.notified_at).getTime()) / 60_000
    if (minutesSinceNotify >= alert.renotify_after_minutes) {
      await pool.query('UPDATE alert_events SET notified_at = now() WHERE id = $1', [open.id])
      await sendAlertEmail(alert.recipients, alert.name, alert.dataset_name, value, alert.operator, Number(alert.threshold))
    }
    return
  }

  if (!breaching && open) {
    await pool.query('UPDATE alert_events SET resolved_at = now() WHERE id = $1', [open.id])
  }
}
