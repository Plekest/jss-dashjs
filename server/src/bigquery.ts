import { BigQuery } from '@google-cloud/bigquery'
import { pool } from './db.js'
import { decrypt } from './crypto.js'

type ServiceAccountCredentials = Record<string, string>

function coerce(value: unknown): string | number {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).value)
  }
  return String(value)
}

async function credentialsFor(connectionId: string) {
  const { rows } = await pool.query('SELECT * FROM connections WHERE id=$1', [connectionId])
  if (!rows.length) throw new Error('connection not found')
  const creds = JSON.parse(decrypt(rows[0].credentials)) as ServiceAccountCredentials
  const location = (rows[0].config as Record<string, string>)?.location
  return { creds, location }
}

export async function runQueryWithCredentials(
  creds: ServiceAccountCredentials,
  location: string | undefined,
  sql: string,
  maxRows = 50_000,
) {
  const bq = new BigQuery({ projectId: creds.project_id, credentials: creds })
  const [job] = await bq.createQueryJob({ query: sql, ...(location ? { location } : {}) })
  const [rows, , response] = await job.getQueryResults({ maxResults: maxRows })
  const fields = (response as { schema?: { fields?: { name: string }[] } })?.schema?.fields ?? []
  const columns = fields.map((f) => ({ title: f.name }))
  const order = fields.map((f) => f.name)
  const data = (rows as Record<string, unknown>[]).map((r) => order.map((k) => coerce(r[k])))
  return { columns, data }
}

export async function runQuery(connectionId: string, sql: string, maxRows = 50_000) {
  const { creds, location } = await credentialsFor(connectionId)
  return runQueryWithCredentials(creds, location, sql, maxRows)
}
