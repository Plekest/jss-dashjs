import { Router } from 'express'
import { pool } from '../db.js'
import { encrypt } from '../crypto.js'
import { runQuery, runQueryAdhoc } from '../queryEngine.js'
import { insertDataset } from './datasets.js'

const router = Router()

function toCamel(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    config: row.config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Validates & normalizes raw credentials by connection type. Shared by
 *  `POST /` and the adhoc test/preview endpoints so the shape rules
 *  ("BigQuery needs project_id/client_email/private_key", "Postgres needs
 *  host/user/database") don't drift between them. */
function parseCredentials(type: string, credentials: unknown): Record<string, unknown> {
  if (type === 'bigquery') {
    let sa: Record<string, unknown>
    try {
      sa = typeof credentials === 'string' ? JSON.parse(credentials) : (credentials as Record<string, unknown>)
    } catch {
      throw new Error('credentials must be valid JSON')
    }
    if (!sa.project_id || !sa.client_email || !sa.private_key) {
      throw new Error('credentials must contain project_id, client_email, private_key')
    }
    return sa
  }
  if (type === 'postgres') {
    const { host, user, database } = (credentials ?? {}) as Record<string, unknown>
    if (!host || !user || !database) {
      throw new Error('credentials must contain host, user, database')
    }
    return credentials as Record<string, unknown>
  }
  throw new Error(`unsupported connection type: ${type}`)
}

// List connections (no credentials field)
router.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, type, config, created_at, updated_at FROM connections ORDER BY updated_at DESC',
  )
  res.json(rows.map(toCamel))
})

// Create connection
router.post('/', async (req, res) => {
  const { name, type, credentials, location } = req.body
  if (!name || !type || !credentials) {
    return res.status(400).json({ error: 'name, type, credentials are required' })
  }

  let config: Record<string, unknown>
  let credsToEncrypt: string

  try {
    if (type === 'bigquery') {
      const saJson = parseCredentials(type, credentials)
      config = {
        projectId: saJson.project_id,
        clientEmail: saJson.client_email,
        ...(location ? { location } : {}),
      }
      credsToEncrypt = JSON.stringify(saJson)
    } else if (type === 'postgres') {
      const parsed = parseCredentials(type, credentials)
      const { host, port, user, password, database, ssl } = parsed
      config = { host, port: port ?? 5432, database, ssl: !!ssl }
      credsToEncrypt = JSON.stringify({ host, port: port ?? 5432, user, password, database, ssl: !!ssl })
    } else {
      return res.status(400).json({ error: `unsupported connection type: ${type}` })
    }
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message })
  }

  try {
    const encryptedCreds = encrypt(credsToEncrypt)
    const { rows } = await pool.query(
      `INSERT INTO connections (name, type, config, credentials)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, type, config, created_at, updated_at`,
      [name, type, JSON.stringify(config), encryptedCreds],
    )
    res.status(201).json(toCamel(rows[0]))
  } catch (err) {
    console.error('create connection error:', err)
    res.status(500).json({ error: 'internal error' })
  }
})

// Test credentials without persisting a connection row.
router.post('/test-adhoc', async (req, res) => {
  const { type, credentials, location } = req.body
  try {
    const parsed = parseCredentials(type, credentials)
    await runQueryAdhoc(type, parsed, 'SELECT 1 AS ok', 1, location)
    res.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(400).json({ ok: false, error: msg })
  }
})

// Preview a query against not-yet-persisted credentials.
router.post('/preview-adhoc', async (req, res) => {
  const { type, credentials, sql, location } = req.body
  if (!sql) return res.status(400).json({ error: 'sql is required' })
  try {
    const parsed = parseCredentials(type, credentials)
    res.json(await runQueryAdhoc(type, parsed, sql, 50, location))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(400).json({ error: msg })
  }
})

// Delete connection. Refuses (409) if datasets still depend on it, unless
// ?force=true — silently orphaning a dataset's scheduled refresh is the
// exact bug this guard exists to prevent.
router.delete('/:id', async (req, res) => {
  const force = req.query.force === 'true'
  const { rows } = await pool.query(
    'SELECT count(*)::int AS count FROM datasets WHERE connection_id = $1',
    [req.params.id],
  )
  if (rows[0].count > 0 && !force) {
    return res.status(409).json({ datasetsAffected: rows[0].count })
  }
  await pool.query('DELETE FROM connections WHERE id = $1', [req.params.id])
  res.status(204).end()
})

// Test connection
router.post('/:id/test', async (req, res) => {
  try {
    await runQuery(req.params.id, 'SELECT 1 AS ok', 1)
    res.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(400).json({ ok: false, error: msg })
  }
})

// Preview query (no persist, 50 rows)
router.post('/:id/preview', async (req, res) => {
  const { sql } = req.body
  if (!sql) return res.status(400).json({ error: 'sql is required' })
  try {
    const result = await runQuery(req.params.id, sql, 50)
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(400).json({ error: msg })
  }
})

// Ingest query → dataset (50k rows)
router.post('/:id/ingest', async (req, res) => {
  const { sql, name, refreshIntervalMinutes } = req.body
  if (!sql || !name) return res.status(400).json({ error: 'sql and name are required' })
  try {
    const { columns, data } = await runQuery(req.params.id, sql, 50_000)
    const { rows: connRows } = await pool.query('SELECT type FROM connections WHERE id=$1', [req.params.id])
    const connType = connRows[0]?.type ?? 'unknown'
    const dataset = await insertDataset(name, connType, columns, data, {
      connectionId: req.params.id,
      sourceSql: sql,
      refreshIntervalMinutes: refreshIntervalMinutes ?? null,
    })
    res.status(201).json(dataset)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(400).json({ error: msg })
  }
})

export default router
