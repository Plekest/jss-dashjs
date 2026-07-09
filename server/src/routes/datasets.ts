import { Router } from 'express'
import { pool } from '../db.js'
import { runQuery } from '../queryEngine.js'
import { requireAuth, requireRole, type AuthedRequest } from '../auth.js'

const router = Router()

router.use(requireAuth)

// List metadata (no data column — keeps response light)
router.get('/', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query(
    `SELECT id, name, source_type, row_count, connection_id, refresh_interval_minutes,
            next_refresh_at, last_refreshed_at, last_refresh_error, created_at, updated_at
     FROM datasets WHERE tenant_id = $1 ORDER BY updated_at DESC`,
    [auth.tenantId],
  )
  res.json(rows.map(toCamel))
})

// Get full dataset including data
router.get('/:id', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query('SELECT * FROM datasets WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

// Create dataset
router.post('/', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { name, sourceType, columns, data } = req.body
  if (!name || !sourceType || !Array.isArray(columns) || !Array.isArray(data)) {
    return res.status(400).json({ error: 'name, sourceType, columns, data are required' })
  }
  const dataset = await insertDataset(name, sourceType, columns, data, auth.tenantId)
  res.status(201).json(dataset)
})

// Update dataset (full rewrite — used by "Salvar" in Planilhas)
router.put('/:id', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { name, columns, data, meta } = req.body
  const updates: string[] = []
  const values: unknown[] = []
  let i = 1

  if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name) }
  if (columns !== undefined) { updates.push(`columns = $${i++}`); values.push(JSON.stringify(columns)) }
  if (data !== undefined) {
    updates.push(`data = $${i++}`); values.push(JSON.stringify(data))
    updates.push(`row_count = $${i++}`); values.push((data as unknown[]).length)
  }
  if (meta !== undefined) { updates.push(`meta = $${i++}`); values.push(JSON.stringify(meta)) }
  updates.push(`updated_at = now()`)

  if (!updates.length) return res.status(400).json({ error: 'nothing to update' })

  values.push(req.params.id, auth.tenantId)
  const { rows } = await pool.query(
    `UPDATE datasets SET ${updates.join(', ')} WHERE id = $${i} AND tenant_id = $${i + 1} RETURNING *`,
    values,
  )
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

// Delete dataset
router.delete('/:id', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  await pool.query('DELETE FROM datasets WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  res.status(204).end()
})

// Update the auto-refresh interval, recalculating next_refresh_at.
router.put('/:id/refresh-schedule', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { refreshIntervalMinutes } = req.body as { refreshIntervalMinutes: number | null }
  const { rows } = await pool.query(
    `UPDATE datasets SET refresh_interval_minutes = $1,
            next_refresh_at = CASE WHEN $1::int IS NOT NULL THEN now() + ($1 || ' minutes')::interval ELSE NULL END
     WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [refreshIntervalMinutes, req.params.id, auth.tenantId],
  )
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

// Force an immediate refresh, without waiting for the schedule.
router.post('/:id/refresh-now', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  try {
    const { rows: owned } = await pool.query('SELECT 1 FROM datasets WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
    if (!owned.length) return res.status(404).json({ error: 'not found' })
    await refreshDataset(req.params.id as string)
    const { rows } = await pool.query('SELECT * FROM datasets WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'not found' })
    res.json(toCamel(rows[0]))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(400).json({ error: msg })
  }
})

export function toCamel(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    columns: row.columns,
    data: row.data,
    meta: row.meta ?? {},
    rowCount: row.row_count,
    connectionId: row.connection_id,
    sourceSql: row.source_sql,
    refreshIntervalMinutes: row.refresh_interval_minutes,
    nextRefreshAt: row.next_refresh_at,
    lastRefreshedAt: row.last_refreshed_at,
    lastRefreshError: row.last_refresh_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function insertDataset(
  name: string,
  sourceType: string,
  columns: unknown[],
  data: unknown[][],
  tenantId: string,
  origin?: { connectionId: string; sourceSql: string; refreshIntervalMinutes: number | null },
) {
  const { rows } = await pool.query(
    `INSERT INTO datasets (name, source_type, columns, data, row_count, connection_id, source_sql, refresh_interval_minutes, next_refresh_at, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             CASE WHEN $8::int IS NOT NULL THEN now() + ($8 || ' minutes')::interval ELSE NULL END,
             $9)
     RETURNING *`,
    [
      name,
      sourceType,
      JSON.stringify(columns),
      JSON.stringify(data),
      data.length,
      origin?.connectionId ?? null,
      origin?.sourceSql ?? null,
      origin?.refreshIntervalMinutes ?? null,
      tenantId,
    ],
  )
  return toCamel(rows[0])
}

/** Re-runs a dataset's source query and overwrites its data. Throws when the
 *  dataset has no connection/source_sql to refresh, or when the query fails
 *  (after recording last_refresh_error so the UI can surface it). Shared by
 *  the refresh-now route and the background scheduler. */
export async function refreshDataset(id: string): Promise<void> {
  const { rows } = await pool.query(
    'SELECT connection_id, source_sql, refresh_interval_minutes FROM datasets WHERE id = $1',
    [id],
  )
  if (!rows.length) throw new Error('not found')
  const row = rows[0] as { connection_id: string | null; source_sql: string | null; refresh_interval_minutes: number | null }
  if (!row.connection_id || !row.source_sql) {
    throw new Error('dataset has no connection/source query to refresh')
  }
  try {
    const { columns, data } = await runQuery(row.connection_id, row.source_sql, 50_000)
    await pool.query(
      `UPDATE datasets SET columns = $1, data = $2, row_count = $3,
              last_refreshed_at = now(), last_refresh_error = NULL,
              next_refresh_at = CASE WHEN $4::int IS NOT NULL THEN now() + ($4 || ' minutes')::interval ELSE NULL END
       WHERE id = $5`,
      [JSON.stringify(columns), JSON.stringify(data), data.length, row.refresh_interval_minutes, id],
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await pool.query(
      `UPDATE datasets SET last_refresh_error = $1,
              next_refresh_at = CASE WHEN $2::int IS NOT NULL THEN now() + ($2 || ' minutes')::interval ELSE NULL END
       WHERE id = $3`,
      [msg, row.refresh_interval_minutes, id],
    )
    throw err
  }
}

export default router
