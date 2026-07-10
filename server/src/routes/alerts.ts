import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole, type AuthedRequest } from '../auth.js'
import { isValidEmail } from '../validate.js'

const router = Router()

router.use(requireAuth)

// List alerts, optionally filtered by dataset.
router.get('/', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { datasetId } = req.query as { datasetId?: string }
  const values: unknown[] = [auth.tenantId]
  let where = 'tenant_id = $1'
  if (datasetId) {
    values.push(datasetId)
    where += ` AND dataset_id = $${values.length}`
  }
  const { rows } = await pool.query(
    `SELECT * FROM alerts WHERE ${where} ORDER BY created_at DESC`,
    values,
  )
  res.json(rows.map((r) => toCamel(r)))
})

router.get('/:id', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query('SELECT * FROM alerts WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

router.get('/:id/events', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows: owned } = await pool.query('SELECT 1 FROM alerts WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  if (!owned.length) return res.status(404).json({ error: 'not found' })
  const { rows } = await pool.query(
    'SELECT * FROM alert_events WHERE alert_id = $1 ORDER BY triggered_at DESC',
    [req.params.id],
  )
  res.json(rows.map((r) => eventToCamel(r)))
})

router.post('/', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { datasetId, name, columnName, aggregation, operator, threshold, recipients, renotifyAfterMinutes } = req.body
  if (!datasetId || !name || !columnName || !aggregation || !operator || threshold === undefined || !Array.isArray(recipients) || !recipients.length) {
    return res.status(400).json({ error: 'datasetId, name, columnName, aggregation, operator, threshold, recipients are required' })
  }
  if (!recipients.every(isValidEmail)) {
    return res.status(400).json({ error: 'recipients must all be valid email addresses' })
  }
  const { rows } = await pool.query(
    `INSERT INTO alerts (tenant_id, dataset_id, name, column_name, aggregation, operator, threshold, recipients, renotify_after_minutes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [auth.tenantId, datasetId, name, columnName, aggregation, operator, threshold, recipients, renotifyAfterMinutes ?? null, auth.userId],
  )
  res.status(201).json(toCamel(rows[0]))
})

router.put('/:id', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { name, columnName, aggregation, operator, threshold, recipients, renotifyAfterMinutes, active } = req.body
  const updates: string[] = []
  const values: unknown[] = []
  let i = 1

  if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name) }
  if (columnName !== undefined) { updates.push(`column_name = $${i++}`); values.push(columnName) }
  if (aggregation !== undefined) { updates.push(`aggregation = $${i++}`); values.push(aggregation) }
  if (operator !== undefined) { updates.push(`operator = $${i++}`); values.push(operator) }
  if (threshold !== undefined) { updates.push(`threshold = $${i++}`); values.push(threshold) }
  if (recipients !== undefined) {
    if (!Array.isArray(recipients) || !recipients.every(isValidEmail)) {
      return res.status(400).json({ error: 'recipients must all be valid email addresses' })
    }
    updates.push(`recipients = $${i++}`); values.push(recipients)
  }
  if (renotifyAfterMinutes !== undefined) { updates.push(`renotify_after_minutes = $${i++}`); values.push(renotifyAfterMinutes) }
  if (active !== undefined) { updates.push(`active = $${i++}`); values.push(active) }
  updates.push('updated_at = now()')

  if (updates.length === 1) return res.status(400).json({ error: 'nothing to update' })

  values.push(req.params.id, auth.tenantId)
  const { rows } = await pool.query(
    `UPDATE alerts SET ${updates.join(', ')} WHERE id = $${i} AND tenant_id = $${i + 1} RETURNING *`,
    values,
  )
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

router.delete('/:id', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  await pool.query('DELETE FROM alerts WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  res.status(204).end()
})

function toCamel(row: Record<string, unknown>) {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    name: row.name,
    columnName: row.column_name,
    aggregation: row.aggregation,
    operator: row.operator,
    threshold: Number(row.threshold),
    recipients: row.recipients,
    renotifyAfterMinutes: row.renotify_after_minutes,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function eventToCamel(row: Record<string, unknown>) {
  return {
    id: row.id,
    alertId: row.alert_id,
    triggeredAt: row.triggered_at,
    resolvedAt: row.resolved_at,
    value: Number(row.value),
    notifiedAt: row.notified_at,
  }
}

export default router
