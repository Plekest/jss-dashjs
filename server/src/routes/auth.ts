import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { pool } from '../db.js'
import { requireAuth, type AuthedRequest } from '../auth.js'
import { sendPasswordResetEmail } from '../email.js'

const router = Router()
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173'

router.post('/signup', async (req, res) => {
  const { name, email, password, tenantName } = req.body as {
    name?: string; email?: string; password?: string; tenantName?: string
  }
  if (!name || !email || !password || !tenantName) {
    return res.status(400).json({ error: 'name, email, password, tenantName are required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: existing } = await client.query('SELECT 1 FROM users WHERE email = $1', [email])
    if (existing.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'email already registered' })
    }

    const { rows: tenantCountRows } = await client.query('SELECT count(*)::int AS count FROM tenants')
    const isFirstTenant = tenantCountRows[0].count === 0

    const passwordHash = await bcrypt.hash(password, 12)

    const { rows: tenantRows } = await client.query(
      'INSERT INTO tenants (name) VALUES ($1) RETURNING *',
      [tenantName],
    )
    const tenant = tenantRows[0]

    const { rows: userRows } = await client.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *',
      [email, passwordHash, name],
    )
    const user = userRows[0]

    await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [tenant.id, user.id],
    )

    if (isFirstTenant) {
      await client.query('UPDATE datasets SET tenant_id = $1 WHERE tenant_id IS NULL', [tenant.id])
      await client.query('UPDATE dashboards SET tenant_id = $1 WHERE tenant_id IS NULL', [tenant.id])
      await client.query('UPDATE connections SET tenant_id = $1 WHERE tenant_id IS NULL', [tenant.id])
    }

    await client.query('COMMIT')

    req.session.userId = user.id
    req.session.tenantId = tenant.id

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
      tenant: { id: tenant.id, name: tenant.name },
      role: 'owner',
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('signup error:', err)
    res.status(500).json({ error: 'internal error' })
  } finally {
    client.release()
  }
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' })

  const { rows: userRows } = await pool.query('SELECT * FROM users WHERE email = $1', [email])
  if (!userRows.length) return res.status(401).json({ error: 'invalid credentials' })
  const user = userRows[0]

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'invalid credentials' })

  const { rows: memberships } = await pool.query(
    `SELECT tm.role, t.id AS tenant_id, t.name AS tenant_name
     FROM tenant_memberships tm JOIN tenants t ON t.id = tm.tenant_id
     WHERE tm.user_id = $1`,
    [user.id],
  )

  if (!memberships.length) return res.status(401).json({ error: 'user has no tenant' })

  req.session.userId = user.id

  if (memberships.length === 1) {
    req.session.tenantId = memberships[0].tenant_id
    return res.json({
      user: { id: user.id, email: user.email, name: user.name },
      tenant: { id: memberships[0].tenant_id, name: memberships[0].tenant_name },
      role: memberships[0].role,
    })
  }

  res.json({
    needsTenantSelection: true,
    tenants: memberships.map((m) => ({ id: m.tenant_id, name: m.tenant_name })),
  })
})

router.post('/select-tenant', async (req, res) => {
  const { tenantId } = req.body as { tenantId?: string }
  if (!req.session.userId) return res.status(401).json({ error: 'not authenticated' })
  if (!tenantId) return res.status(400).json({ error: 'tenantId is required' })

  const { rows } = await pool.query(
    `SELECT tm.role, t.id AS tenant_id, t.name AS tenant_name
     FROM tenant_memberships tm JOIN tenants t ON t.id = tm.tenant_id
     WHERE tm.user_id = $1 AND tm.tenant_id = $2`,
    [req.session.userId, tenantId],
  )
  if (!rows.length) return res.status(403).json({ error: 'not a member of this tenant' })

  req.session.tenantId = rows[0].tenant_id
  res.json({ tenant: { id: rows[0].tenant_id, name: rows[0].tenant_name }, role: rows[0].role })
})

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.status(204).end()
  })
})

router.get('/me', requireAuth, async (req, res) => {
  const { auth } = req as AuthedRequest
  const { rows } = await pool.query('SELECT name FROM tenants WHERE id = $1', [auth.tenantId])
  res.json({
    user: { id: auth.userId, email: auth.email, name: auth.name },
    tenant: { id: auth.tenantId, name: rows[0]?.name ?? '' },
    role: auth.role,
  })
})

router.put('/me', requireAuth, async (req, res) => {
  const { auth } = req as AuthedRequest
  const { name, currentPassword, newPassword } = req.body as {
    name?: string; currentPassword?: string; newPassword?: string
  }

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: 'currentPassword is required to set a new password' })
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [auth.userId])
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash)
    if (!valid) return res.status(401).json({ error: 'current password is incorrect' })
  }

  const updates: string[] = []
  const values: unknown[] = []
  let i = 1
  if (name !== undefined && name.trim()) { updates.push(`name = $${i++}`); values.push(name.trim()) }
  if (newPassword) { updates.push(`password_hash = $${i++}`); values.push(await bcrypt.hash(newPassword, 12)) }
  updates.push('updated_at = now()')

  values.push(auth.userId)
  const { rows } = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, email, name`,
    values,
  )
  res.json({ user: rows[0] })
})

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body as { email?: string }
  if (!email) return res.status(400).json({ error: 'email is required' })

  try {
    const { rows: userRows } = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    if (userRows.length) {
      const token = randomBytes(24).toString('base64url')
      await pool.query(
        `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
        [userRows[0].id, token],
      )
      await sendPasswordResetEmail(email, `${APP_URL}/reset-password/${token}`)
    }
  } catch (err) {
    console.error('forgot-password error:', err)
  }
  res.json({ ok: true })
})

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body as { token?: string; password?: string }
  if (!token || !password) return res.status(400).json({ error: 'token and password are required' })

  const { rows } = await pool.query(
    `SELECT user_id FROM password_resets WHERE token = $1 AND used_at IS NULL AND expires_at > now()`,
    [token],
  )
  if (!rows.length) return res.status(400).json({ error: 'invalid or expired token' })

  const passwordHash = await bcrypt.hash(password, 12)
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, rows[0].user_id])
  await pool.query('UPDATE password_resets SET used_at = now() WHERE token = $1', [token])
  res.json({ ok: true })
})

router.get('/invites/:token', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.email, i.role, t.name AS tenant_name
     FROM invites i JOIN tenants t ON t.id = i.tenant_id
     WHERE i.token = $1 AND i.accepted_at IS NULL AND i.expires_at > now()`,
    [req.params.token],
  )
  if (!rows.length) return res.status(404).json({ error: 'invite not found or expired' })
  const invite = rows[0]

  const { rows: userRows } = await pool.query('SELECT 1 FROM users WHERE email = $1', [invite.email])
  res.json({
    email: invite.email,
    tenantName: invite.tenant_name,
    role: invite.role,
    hasAccount: userRows.length > 0,
  })
})

router.post('/invites/:token/accept', async (req, res) => {
  const { name, password } = req.body as { name?: string; password?: string }
  if (!name || !password) return res.status(400).json({ error: 'name and password are required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: inviteRows } = await client.query(
      `SELECT id, tenant_id, email, role FROM invites
       WHERE token = $1 AND accepted_at IS NULL AND expires_at > now()`,
      [req.params.token],
    )
    if (!inviteRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'invite not found or expired' })
    }
    const invite = inviteRows[0]

    const { rows: existing } = await client.query('SELECT 1 FROM users WHERE email = $1', [invite.email])
    if (existing.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'account already exists, use accept-existing' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const { rows: userRows } = await client.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *',
      [invite.email, passwordHash, name],
    )
    const user = userRows[0]

    await client.query(
      'INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)',
      [invite.tenant_id, user.id, invite.role],
    )
    await client.query('UPDATE invites SET accepted_at = now() WHERE id = $1', [invite.id])

    await client.query('COMMIT')

    req.session.userId = user.id
    req.session.tenantId = invite.tenant_id

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
      tenant: { id: invite.tenant_id },
      role: invite.role,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('accept invite error:', err)
    res.status(500).json({ error: 'internal error' })
  } finally {
    client.release()
  }
})

router.post('/invites/:token/accept-existing', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'not authenticated' })

  const { rows: inviteRows } = await pool.query(
    `SELECT id, tenant_id, email, role FROM invites
     WHERE token = $1 AND accepted_at IS NULL AND expires_at > now()`,
    [req.params.token],
  )
  if (!inviteRows.length) return res.status(404).json({ error: 'invite not found or expired' })
  const invite = inviteRows[0]

  const { rows: userRows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.session.userId])
  if (!userRows.length || userRows[0].email !== invite.email) {
    return res.status(403).json({ error: 'logged-in user does not match invite email' })
  }

  await pool.query(
    'INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)',
    [invite.tenant_id, req.session.userId, invite.role],
  )
  await pool.query('UPDATE invites SET accepted_at = now() WHERE id = $1', [invite.id])

  req.session.tenantId = invite.tenant_id
  res.json({ tenant: { id: invite.tenant_id }, role: invite.role })
})

export default router
