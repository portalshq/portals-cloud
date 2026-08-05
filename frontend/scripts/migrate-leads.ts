import {readdir, readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import pg from 'pg'
import dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({path: '.env.local'})

const connectionString = process.env.LEADS_DATABASE_URL
if (!connectionString) {
  throw new Error('LEADS_DATABASE_URL is required to migrate the lead database.')
}

const migrationsDirectory = resolve(process.cwd(), 'migrations')
const migrations = (await readdir(migrationsDirectory))
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort()
const pool = new pg.Pool({connectionString, max: 1})

try {
  for (const migration of migrations) {
    const sql = await readFile(resolve(migrationsDirectory, migration), 'utf8')
    await pool.query(sql)
  }
  process.stdout.write('Lead operations schema is current.\n')
} finally {
  await pool.end()
}
