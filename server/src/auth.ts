import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import type { Request, Response, NextFunction } from 'express'
import { pool } from './db.js'
import { requireSecret } from './env.js'

const PgSession = connectPgSimple(session)

export const sessionMiddleware = session({
  store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: requireSecret('SESSION_SECRET'),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
})

declare module 'express-session' {
  interface SessionData {
    userId?: string
    tenantId?: string
  }
}

export type Role = 'owner' | 'editor' | 'viewer'
export interface AuthedRequest extends Request {
  auth: { userId: string; tenantId: string; role: Role; email: string; name: string }
}

// Carrega user+role da sessão ativa. Falha (401) se a sessão não tem
// tenantId ainda selecionado (ver POST /api/auth/select-tenant).
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const { userId, tenantId } = req.session
  if (!userId || !tenantId) return res.status(401).json({ error: 'not authenticated' })
  const { rows } = await pool.query(
    `SELECT u.email, u.name, tm.role FROM users u
     JOIN tenant_memberships tm ON tm.user_id = u.id
     WHERE u.id = $1 AND tm.tenant_id = $2`,
    [userId, tenantId],
  )
  if (!rows.length) return res.status(401).json({ error: 'not authenticated' })
  ;(req as AuthedRequest).auth = { userId, tenantId, role: rows[0].role, email: rows[0].email, name: rows[0].name }
  next()
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes((req as AuthedRequest).auth.role)) {
      return res.status(403).json({ error: 'forbidden' })
    }
    next()
  }
}
