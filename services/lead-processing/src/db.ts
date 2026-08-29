import pg from 'pg'
import {config} from './config.js'

// The invitation service is loaded by this same process. This global name is
// deliberately identical to its db module, yielding one low-footprint pool.
const state = globalThis as typeof globalThis & {portalsUnifiedNeonPool?: pg.Pool}
export const pool = state.portalsUnifiedNeonPool ??= new pg.Pool({
  connectionString: config.databaseUrl,
  max: 2,
  ssl: {rejectUnauthorized: true},
})
