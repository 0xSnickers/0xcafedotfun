import dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../db/schema'

dotenv.config()

export const databaseUrl = process.env.DATABASE_URL
export const postgresEnabled = Boolean(databaseUrl)

export const postgresPool = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : null

export const db = postgresPool
  ? drizzle(postgresPool, { schema })
  : null

export function requirePostgresPool(): Pool {
  if (!postgresPool) {
    throw new Error('DATABASE_URL is required for PostgreSQL market storage')
  }

  return postgresPool
}
