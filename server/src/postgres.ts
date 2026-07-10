import pg from 'pg'
import { pool } from './db.js'
import { decrypt } from './crypto.js'

interface PostgresCredentials {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl?: boolean
}

async function credentialsFor(connectionId: string): Promise<PostgresCredentials> {
  const { rows } = await pool.query('SELECT * FROM connections WHERE id=$1', [connectionId])
  if (!rows.length) throw new Error('connection not found')
  return JSON.parse(decrypt(rows[0].credentials)) as PostgresCredentials
}

function coerce(value: unknown): string | number {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export async function runQueryWithCredentials(creds: PostgresCredentials, sql: string, maxRows = 50_000) {
  const client = new pg.Client({
    host: creds.host,
    port: creds.port,
    user: creds.user,
    password: creds.password,
    database: creds.database,
    ssl: creds.ssl ? { rejectUnauthorized: true } : undefined,
  })
  await client.connect()
  try {
    // Postgres has no client-side "maxResults" like BigQuery — wrap the
    // user's query in a subquery with LIMIT to enforce the same cap,
    // regardless of whether the original SQL has its own LIMIT.
    const capped = `SELECT * FROM (${sql.replace(/;\s*$/, '')}) AS dashjs_subquery LIMIT $1`
    const result = await client.query(capped, [maxRows])
    const columns = result.fields.map((f) => ({ title: f.name }))
    const data = result.rows.map((row) => columns.map((c) => coerce(row[c.title])))
    return { columns, data }
  } finally {
    await client.end()
  }
}

export async function runQuery(connectionId: string, sql: string, maxRows = 50_000) {
  const creds = await credentialsFor(connectionId)
  return runQueryWithCredentials(creds, sql, maxRows)
}
