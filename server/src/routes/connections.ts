import { Router } from 'express'
import { pool } from '../db.js'
import { encrypt } from '../crypto.js'
import { runQuery } from '../queryEngine.js'
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

// List connections (no credentials field)
router.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, type, config, created_at, updated_at FROM connections ORDER BY updated_at DESC',
  )
  res.json(rows.map(toCamel))
})

// Create connection
router.post('/', async (req, res) => {
  try {
    const { name, type, credentials, location } = req.body
    if (!name || !type || !credentials) {
      return res.status(400).json({ error: 'name, type, credentials are required' })
    }

    let config: Record<string, unknown>
    let credsToEncrypt: string

    if (type === 'bigquery') {
      let saJson: Record<string, unknown>
      try {
        saJson = typeof credentials === 'string' ? JSON.parse(credentials) : credentials
      } catch {
        return res.status(400).json({ error: 'credentials must be valid JSON' })
      }

      if (!saJson.project_id || !saJson.client_email || !saJson.private_key) {
        return res.status(400).json({ error: 'credentials must contain project_id, client_email, private_key' })
      }

      config = {
        projectId: saJson.project_id,
        clientEmail: saJson.client_email,
        ...(location ? { location } : {}),
      }
      credsToEncrypt = JSON.stringify(saJson)
    } else if (type === 'postgres') {
      const { host, port, user, password, database, ssl } = credentials as Record<string, unknown>
      if (!host || !user || !database) {
        return res.status(400).json({ error: 'credentials must contain host, user, database' })
      }
      config = { host, port: port ?? 5432, database, ssl: !!ssl }
      credsToEncrypt = JSON.stringify({ host, port: port ?? 5432, user, password, database, ssl: !!ssl })
    } else {
      return res.status(400).json({ error: `unsupported connection type: ${type}` })
    }

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

// Delete connection
router.delete('/:id', async (req, res) => {
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
