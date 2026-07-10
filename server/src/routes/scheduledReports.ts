import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole, type AuthedRequest } from '../auth.js'
import { nextRunFromCron } from '../cron.js'
import { isValidEmail } from '../validate.js'

const router = Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { dashboardId } = req.query as { dashboardId?: string }
  const values: unknown[] = [auth.tenantId]
  let where = 'tenant_id = $1'
  if (dashboardId) {
    values.push(dashboardId)
    where += ` AND dashboard_id = $${values.length}`
  }
  const { rows } = await pool.query(
    `SELECT * FROM scheduled_reports WHERE ${where} ORDER BY created_at DESC`,
    values,
  )
  res.json(rows.map((r) => toCamel(r)))
})

router.get('/:id', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query('SELECT * FROM scheduled_reports WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

router.post('/', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { dashboardId, name, metrics, recipients, cron } = req.body
  if (!dashboardId || !name || !Array.isArray(metrics) || !metrics.length || !Array.isArray(recipients) || !recipients.length || !cron) {
    return res.status(400).json({ error: 'dashboardId, name, metrics, recipients, cron are required' })
  }
  if (!recipients.every(isValidEmail)) {
    return res.status(400).json({ error: 'recipients must all be valid email addresses' })
  }
  let nextRunAt: Date
  try {
    nextRunAt = nextRunFromCron(cron)
  } catch {
    return res.status(400).json({ error: 'invalid cron expression' })
  }
  const { rows } = await pool.query(
    `INSERT INTO scheduled_reports (tenant_id, dashboard_id, name, metrics, recipients, cron, next_run_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [auth.tenantId, dashboardId, name, JSON.stringify(metrics), recipients, cron, nextRunAt, auth.userId],
  )
  res.status(201).json(toCamel(rows[0]))
})

router.put('/:id', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { name, metrics, recipients, cron, active } = req.body
  const updates: string[] = []
  const values: unknown[] = []
  let i = 1

  if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name) }
  if (metrics !== undefined) { updates.push(`metrics = $${i++}`); values.push(JSON.stringify(metrics)) }
  if (recipients !== undefined) {
    if (!Array.isArray(recipients) || !recipients.every(isValidEmail)) {
      return res.status(400).json({ error: 'recipients must all be valid email addresses' })
    }
    updates.push(`recipients = $${i++}`); values.push(recipients)
  }
  if (cron !== undefined) {
    let nextRunAt: Date
    try {
      nextRunAt = nextRunFromCron(cron)
    } catch {
      return res.status(400).json({ error: 'invalid cron expression' })
    }
    updates.push(`cron = $${i++}`); values.push(cron)
    updates.push(`next_run_at = $${i++}`); values.push(nextRunAt)
  }
  if (active !== undefined) { updates.push(`active = $${i++}`); values.push(active) }
  updates.push('updated_at = now()')

  if (updates.length === 1) return res.status(400).json({ error: 'nothing to update' })

  values.push(req.params.id, auth.tenantId)
  const { rows } = await pool.query(
    `UPDATE scheduled_reports SET ${updates.join(', ')} WHERE id = $${i} AND tenant_id = $${i + 1} RETURNING *`,
    values,
  )
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

router.delete('/:id', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  await pool.query('DELETE FROM scheduled_reports WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  res.status(204).end()
})

function toCamel(row: Record<string, unknown>) {
  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    name: row.name,
    metrics: row.metrics,
    recipients: row.recipients,
    cron: row.cron,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastRunError: row.last_run_error,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export default router
