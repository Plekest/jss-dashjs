import { pool } from './db.js'
import * as bigquery from './bigquery.js'
import * as postgres from './postgres.js'

export async function runQuery(connectionId: string, sql: string, maxRows = 50_000) {
  const { rows } = await pool.query('SELECT type FROM connections WHERE id = $1', [connectionId])
  if (!rows.length) throw new Error('connection not found')
  switch (rows[0].type) {
    case 'bigquery': return bigquery.runQuery(connectionId, sql, maxRows)
    case 'postgres': return postgres.runQuery(connectionId, sql, maxRows)
    default: throw new Error(`unsupported connection type: ${rows[0].type}`)
  }
}
