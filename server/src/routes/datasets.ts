import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

// List metadata (no data column — keeps response light)
router.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, source_type, row_count, created_at, updated_at FROM datasets ORDER BY updated_at DESC',
  )
  res.json(rows.map(toCamel))
})

// Get full dataset including data
router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM datasets WHERE id = $1', [req.params.id])
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

// Create dataset
router.post('/', async (req, res) => {
  const { name, sourceType, columns, data } = req.body
  if (!name || !sourceType || !Array.isArray(columns) || !Array.isArray(data)) {
    return res.status(400).json({ error: 'name, sourceType, columns, data are required' })
  }
  const dataset = await insertDataset(name, sourceType, columns, data)
  res.status(201).json(dataset)
})

// Update dataset (full rewrite — used by "Salvar" in Planilhas)
router.put('/:id', async (req, res) => {
  const { name, columns, data } = req.body
  const updates: string[] = []
  const values: unknown[] = []
  let i = 1

  if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name) }
  if (columns !== undefined) { updates.push(`columns = $${i++}`); values.push(JSON.stringify(columns)) }
  if (data !== undefined) {
    updates.push(`data = $${i++}`); values.push(JSON.stringify(data))
    updates.push(`row_count = $${i++}`); values.push((data as unknown[]).length)
  }
  updates.push(`updated_at = now()`)

  if (!updates.length) return res.status(400).json({ error: 'nothing to update' })

  values.push(req.params.id)
  const { rows } = await pool.query(
    `UPDATE datasets SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  )
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0]))
})

// Delete dataset
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM datasets WHERE id = $1', [req.params.id])
  res.status(204).end()
})

export function toCamel(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    columns: row.columns,
    data: row.data,
    rowCount: row.row_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function insertDataset(
  name: string,
  sourceType: string,
  columns: unknown[],
  data: unknown[][],
) {
  const { rows } = await pool.query(
    `INSERT INTO datasets (name, source_type, columns, data, row_count)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, sourceType, JSON.stringify(columns), JSON.stringify(data), data.length],
  )
  return toCamel(rows[0])
}

export default router
