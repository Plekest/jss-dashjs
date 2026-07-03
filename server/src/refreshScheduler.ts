import type { Pool } from 'pg'
import { refreshDataset } from './routes/datasets.js'

/** Polls every 60s for datasets whose scheduled refresh is due and re-runs
 *  their source query. Backed entirely by `next_refresh_at` in the DB, not
 *  in-memory state, so a server restart doesn't lose track of schedules. A
 *  failed refresh doesn't halt the loop — it just pushes next_refresh_at
 *  forward (see refreshDataset) so it doesn't retry in a tight loop. */
export function startRefreshScheduler(pool: Pool): void {
  async function tick() {
    const { rows } = await pool.query(
      `SELECT id FROM datasets
       WHERE connection_id IS NOT NULL AND next_refresh_at IS NOT NULL AND next_refresh_at <= now()`,
    )
    for (const row of rows as { id: string }[]) {
      try {
        await refreshDataset(row.id)
      } catch (err) {
        console.error('[refreshScheduler] refresh failed for dataset', row.id, err)
      }
    }
  }
  setInterval(() => { void tick() }, 60_000)
}
