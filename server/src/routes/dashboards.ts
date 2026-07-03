import { Router } from 'express'
import { randomBytes } from 'crypto'
import { pool } from '../db.js'

const router = Router()

// List metadata
router.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, dataset_id, slug, published, published_at, created_at, updated_at FROM dashboards ORDER BY updated_at DESC',
  )
  res.json(rows.map(toCamel))
})

// Get full dashboard (with definition)
router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM dashboards WHERE id = $1', [req.params.id])
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

// Create dashboard
router.post('/', async (req, res) => {
  const { name, definition, datasetId } = req.body
  if (!name || !definition) {
    return res.status(400).json({ error: 'name and definition are required' })
  }
  const { rows } = await pool.query(
    `INSERT INTO dashboards (name, definition, dataset_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, JSON.stringify(definition), datasetId ?? null],
  )
  res.status(201).json(toCamel(rows[0]))
})

// Update dashboard
router.put('/:id', async (req, res) => {
  const { name, definition, datasetId } = req.body
  const updates: string[] = []
  const values: unknown[] = []
  let i = 1

  if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name) }
  if (definition !== undefined) { updates.push(`definition = $${i++}`); values.push(JSON.stringify(definition)) }
  if (datasetId !== undefined) { updates.push(`dataset_id = $${i++}`); values.push(datasetId || null) }
  updates.push('updated_at = now()')

  if (updates.length === 1) return res.status(400).json({ error: 'nothing to update' })

  values.push(req.params.id)
  const { rows } = await pool.query(
    `UPDATE dashboards SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  )
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

// Delete dashboard
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM dashboards WHERE id = $1', [req.params.id])
  res.status(204).end()
})

// Publish — generates a slug on first publish, reuses it on republish.
router.post('/:id/publish', async (req, res) => {
  const { rows: existing } = await pool.query('SELECT slug FROM dashboards WHERE id = $1', [req.params.id])
  if (!existing.length) return res.status(404).json({ error: 'not found' })
  const slug = existing[0].slug ?? randomBytes(9).toString('base64url')
  const { rows } = await pool.query(
    `UPDATE dashboards SET slug = $1, published = true, published_at = now() WHERE id = $2 RETURNING *`,
    [slug, req.params.id],
  )
  res.json(toCamel(rows[0]))
})

// Unpublish — keeps the slug so republishing reuses the same link.
router.post('/:id/unpublish', async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE dashboards SET published = false WHERE id = $1 RETURNING *`,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

function toCamel(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    definition: row.definition,
    datasetId: row.dataset_id,
    slug: row.slug,
    published: row.published,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export default router
