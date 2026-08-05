import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import pg from 'pg'
import dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({path: '.env.local'})

const connectionString = process.env.LEADS_DATABASE_URL
if (!connectionString) {
  throw new Error('LEADS_DATABASE_URL is required to migrate the lead database.')
}

const migrationFile = resolve(process.cwd(), 'migrations/004_billing_schema.sql')
const pool = new pg.Pool({connectionString, max: 1})

try {
  const sql = await readFile(migrationFile, 'utf8')
  await pool.query(sql)
  process.stdout.write('Billing schema migration (004_billing_schema.sql) applied successfully.\n')
} catch (error) {
  console.error('Migration failed:', error)
  process.exit(1)
} finally {
  await pool.end()
}
