import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole, type AuthedRequest } from '../auth.js'

const router = Router()
router.use(requireAuth)

// Listagem leve — sem `definition`.
router.get('/', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query(
    `SELECT dt.id, dt.name, dt.description, dt.dataset_id, dt.created_at, u.name AS created_by_name
     FROM dashboard_templates dt LEFT JOIN users u ON u.id = dt.created_by
     WHERE dt.tenant_id = $1 ORDER BY dt.created_at DESC`,
    [auth.tenantId],
  )
  res.json(rows.map((r) => toCamel(r)))
})

// Detalhe completo — com `definition`, usado ao instanciar um dashboard novo.
router.get('/:id', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query('SELECT * FROM dashboard_templates WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(toCamel(rows[0], true))
})

// Cria a partir do estado salvo de um dashboard existente (lê do banco, não do body).
router.post('/', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { dashboardId, name, description } = req.body as { dashboardId?: string; name?: string; description?: string }
  if (!dashboardId || !name?.trim()) return res.status(400).json({ error: 'dashboardId and name are required' })

  const { rows: dashRows } = await pool.query(
    'SELECT definition, dataset_id FROM dashboards WHERE id = $1 AND tenant_id = $2',
    [dashboardId, auth.tenantId],
  )
  if (!dashRows.length) return res.status(404).json({ error: 'dashboard not found' })

  const { rows } = await pool.query(
    `INSERT INTO dashboard_templates (tenant_id, name, description, definition, dataset_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, description, dataset_id, created_at`,
    [auth.tenantId, name.trim(), description?.trim() || null, dashRows[0].definition, dashRows[0].dataset_id, auth.userId],
  )
  res.status(201).json(toCamel(rows[0]))
})

router.delete('/:id', requireRole('owner', 'editor'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  await pool.query('DELETE FROM dashboard_templates WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  res.status(204).end()
})

function toCamel(row: Record<string, unknown>, withDefinition = false) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    datasetId: row.dataset_id,
    createdAt: row.created_at,
    createdByName: row.created_by_name ?? null,
    ...(withDefinition ? { definition: row.definition } : {}),
  }
}

export default router
