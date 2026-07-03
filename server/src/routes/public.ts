import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

// Public, unauthenticated read of a published dashboard by slug — returns
// the definition + its dataset in one call so no second open endpoint for
// datasets-by-id is needed.
router.get('/:slug', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.definition, ds.columns, ds.data
     FROM dashboards d
     LEFT JOIN datasets ds ON ds.id = d.dataset_id
     WHERE d.slug = $1 AND d.published = true`,
    [req.params.slug],
  )
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  const row = rows[0]
  res.json({
    id: row.id,
    name: row.name,
    definition: row.definition,
    dataset: row.columns ? { columns: row.columns, data: row.data } : null,
  })
})

export default router
