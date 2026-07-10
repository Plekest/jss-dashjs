import { Router } from 'express'
import { randomBytes } from 'crypto'
import { pool } from '../db.js'
import { requireAuth, requireRole, type AuthedRequest, type Role } from '../auth.js'
import { sendInviteEmail } from '../email.js'
import { isValidEmail } from '../validate.js'

const router = Router()
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173'

router.use(requireAuth)

async function assertNotLastOwner(tenantId: string, userId: string, res: import('express').Response): Promise<boolean> {
  const { rows: memberRows } = await pool.query(
    'SELECT role FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2',
    [tenantId, userId],
  )
  if (!memberRows.length || memberRows[0].role !== 'owner') return true

  const { rows: ownerCountRows } = await pool.query(
    `SELECT count(*)::int AS count FROM tenant_memberships WHERE tenant_id = $1 AND role = 'owner'`,
    [tenantId],
  )
  if (ownerCountRows[0].count <= 1) {
    res.status(400).json({ error: 'tenant precisa de pelo menos um owner' })
    return false
  }
  return true
}

router.get('/', async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, tm.role FROM tenant_memberships tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.tenant_id = $1 ORDER BY u.name`,
    [auth.tenantId],
  )
  res.json(rows)
})

router.put('/tenant', requireRole('owner'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { name } = req.body as { name?: string }
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' })

  const { rows } = await pool.query(
    'UPDATE tenants SET name = $1, updated_at = now() WHERE id = $2 RETURNING id, name',
    [name.trim(), auth.tenantId],
  )
  res.json({ tenant: rows[0] })
})

function inviteToCamel(row: Record<string, unknown>) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

router.get('/invites', requireRole('owner'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { rows } = await pool.query(
    `SELECT id, email, role, expires_at, created_at FROM invites
     WHERE tenant_id = $1 AND accepted_at IS NULL ORDER BY created_at DESC`,
    [auth.tenantId],
  )
  res.json(rows.map(inviteToCamel))
})

router.post('/invites', requireRole('owner'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { email, role } = req.body as { email?: string; role?: Role }
  if (!email || !role) return res.status(400).json({ error: 'email and role are required' })
  if (!isValidEmail(email)) return res.status(400).json({ error: 'email is not a valid address' })

  const token = randomBytes(24).toString('base64url')
  const { rows: tenantRows } = await pool.query('SELECT name FROM tenants WHERE id = $1', [auth.tenantId])

  const { rows } = await pool.query(
    `INSERT INTO invites (tenant_id, email, role, token, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
     RETURNING id, email, role, expires_at, created_at`,
    [auth.tenantId, email, role, token, auth.userId],
  )

  try {
    await sendInviteEmail(email, tenantRows[0].name, auth.name, `${APP_URL}/accept-invite/${token}`)
  } catch (err) {
    console.error('send invite email error:', err)
  }

  res.status(201).json(inviteToCamel(rows[0]))
})

router.delete('/invites/:id', requireRole('owner'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  await pool.query('DELETE FROM invites WHERE id = $1 AND tenant_id = $2', [req.params.id, auth.tenantId])
  res.status(204).end()
})

router.put('/:userId/role', requireRole('owner'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const { role } = req.body as { role?: Role }
  if (!role) return res.status(400).json({ error: 'role is required' })

  if (role !== 'owner') {
    const ok = await assertNotLastOwner(auth.tenantId, req.params.userId as string, res)
    if (!ok) return
  }

  const { rows } = await pool.query(
    'UPDATE tenant_memberships SET role = $1 WHERE tenant_id = $2 AND user_id = $3 RETURNING *',
    [role, auth.tenantId, req.params.userId],
  )
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

router.delete('/:userId', requireRole('owner'), async (req, res) => {
  const { auth } = req as unknown as AuthedRequest
  const ok = await assertNotLastOwner(auth.tenantId, req.params.userId as string, res)
  if (!ok) return

  await pool.query('DELETE FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2', [auth.tenantId, req.params.userId])
  res.status(204).end()
})

export default router
