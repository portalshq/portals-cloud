import pg from 'pg'
import {config} from './config.js'

// Invitation and lead handlers are imported into one Node.js process by the
// unified backend. Keep the pool on globalThis so each module resolves the
// same Neon pool rather than opening an idle pool of its own.
const state = globalThis as typeof globalThis & {portalsUnifiedNeonPool?: pg.Pool}
export const pool = state.portalsUnifiedNeonPool ??= new pg.Pool({
  connectionString: config.databaseUrl,
  max: 2,
  ssl: {rejectUnauthorized: true},
})
