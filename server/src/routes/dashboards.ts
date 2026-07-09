import { Router } from 'express'
import { randomBytes } from 'crypto'
import { pool } from '../db.js'
import { requireAuth, requireRole, type AuthedRequest } from '../auth.js'

const router = Router()

router.use(requireAuth)

// List metadata
router.get('/', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query(
    'SELECT id, name, dataset_id, slug, published, published_at, pinned, created_at, updated_at FROM dashboards WHERE tenant_id = $1 ORDER BY updated_at DESC',
    [auth.tenantId],
  )
  res.json(rows.map(toCamel))
})

// Get full dashboard (with definition)
router.get('/:id', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query('SELECT * FROM dashboards WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

// Create dashboard
router.post('/', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { name, definition, datasetId } = req.body
  if (!name || !definition) {
    return res.status(400).json({ error: 'name and definition are required' })
  }
  const { rows } = await pool.query(
    `INSERT INTO dashboards (name, definition, dataset_id, tenant_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, JSON.stringify(definition), datasetId ?? null, auth.tenantId],
  )
  res.status(201).json(toCamel(rows[0]))
})

// Update dashboard
router.put('/:id', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { name, definition, datasetId } = req.body
  const updates: string[] = []
  const values: unknown[] = []
  let i = 1

  if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name) }
  if (definition !== undefined) { updates.push(`definition = $${i++}`); values.push(JSON.stringify(definition)) }
  if (datasetId !== undefined) { updates.push(`dataset_id = $${i++}`); values.push(datasetId || null) }
  updates.push('updated_at = now()')

  if (updates.length === 1) return res.status(400).json({ error: 'nothing to update' })

  values.push(req.params.id, auth.tenantId)
  const { rows } = await pool.query(
    `UPDATE dashboards SET ${updates.join(', ')} WHERE id = $${i} AND tenant_id = $${i + 1} RETURNING *`,
    values,
  )
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

// Delete dashboard
router.delete('/:id', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  await pool.query('DELETE FROM dashboards WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  res.status(204).end()
})

// Publish — generates a slug on first publish, reuses it on republish.
router.post('/:id/publish', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows: existing } = await pool.query('SELECT slug FROM dashboards WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  if (!existing.length) return res.status(404).json({ error: 'not found' })
  const slug = existing[0].slug ?? randomBytes(9).toString('base64url')
  const { rows } = await pool.query(
    `UPDATE dashboards SET slug = $1, published = true, published_at = now() WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [slug, req.params.id, auth.tenantId],
  )
  res.json(toCamel(rows[0]))
})

// Unpublish — keeps the slug so republishing reuses the same link.
router.post('/:id/unpublish', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query(
    `UPDATE dashboards SET published = false WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [req.params.id, auth.tenantId],
  )
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

router.post('/:id/pin', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query(`UPDATE dashboards SET pinned = true WHERE id = $1 AND tenant_id = $2 RETURNING *`, [req.params.id, auth.tenantId])
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

router.post('/:id/unpin', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query(`UPDATE dashboards SET pinned = false WHERE id = $1 AND tenant_id = $2 RETURNING *`, [req.params.id, auth.tenantId])
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

// List version metadata (no definition — keeps the listing light).
router.get('/:id/versions', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query(
    `SELECT dv.id, dv.name, dv.created_at, dv.created_by, u.name AS created_by_name
     FROM dashboard_versions dv LEFT JOIN users u ON u.id = dv.created_by
     WHERE dv.dashboard_id = $1 AND dv.tenant_id = $2 ORDER BY dv.created_at DESC`,
    [req.params.id, auth.tenantId],
  )
  res.json(rows.map((row) => versionToCamel(row)))
})

// Get a single version, including its definition.
router.get('/:id/versions/:versionId', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query(
    `SELECT * FROM dashboard_versions WHERE id = $1 AND dashboard_id = $2 AND tenant_id = $3`,
    [req.params.versionId, req.params.id, auth.tenantId],
  )
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(versionToCamel(rows[0], true))
})

// Save a named snapshot of the dashboard's current definition.
router.post('/:id/versions', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { name } = req.body as { name?: string }
  const { rows: dashRows } = await pool.query(
    'SELECT definition FROM dashboards WHERE id = $1 AND tenant_id = $2',
    [req.params.id, auth.tenantId],
  )
  if (!dashRows.length) return res.status(404).json({ error: 'not found' })
  const { rows } = await pool.query(
    `INSERT INTO dashboard_versions (dashboard_id, tenant_id, name, definition, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, created_at, created_by`,
    [req.params.id, auth.tenantId, name ?? null, dashRows[0].definition, auth.userId],
  )
  res.status(201).json(versionToCamel(rows[0]))
})

// Restore a version's definition onto the dashboard — first snapshots the
// dashboard's current state as a safety-net version, then overwrites it.
router.post('/:id/versions/:versionId/restore', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: versionRows } = await client.query(
      'SELECT definition FROM dashboard_versions WHERE id = $1 AND dashboard_id = $2 AND tenant_id = $3',
      [req.params.versionId, req.params.id, auth.tenantId],
    )
    if (!versionRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'version not found' })
    }

    const { rows: dashRows } = await client.query(
      'SELECT definition FROM dashboards WHERE id = $1 AND tenant_id = $2',
      [req.params.id, auth.tenantId],
    )
    if (!dashRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'not found' })
    }

    await client.query(
      `INSERT INTO dashboard_versions (dashboard_id, tenant_id, name, definition, created_by)
       VALUES ($1, $2, 'Antes de restaurar', $3, $4)`,
      [req.params.id, auth.tenantId, dashRows[0].definition, auth.userId],
    )

    const { rows } = await client.query(
      `UPDATE dashboards SET definition = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [versionRows[0].definition, req.params.id, auth.tenantId],
    )

    await client.query('COMMIT')
    res.json(toCamel(rows[0]))
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('restore version error:', err)
    res.status(500).json({ error: 'internal error' })
  } finally {
    client.release()
  }
})

function versionToCamel(row: Record<string, unknown>, withDefinition = false) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    ...(withDefinition ? { definition: row.definition } : {}),
  }
}

function toCamel(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    definition: row.definition,
    datasetId: row.dataset_id,
    slug: row.slug,
    published: row.published,
    publishedAt: row.published_at,
    pinned: row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export default router
