import { pathToFileURL } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, postgresPool } from '../clients/postgresClient'

export async function runPostgresMigrations(): Promise<void> {
  if (!db || !postgresPool) {
    throw new Error('DATABASE_URL is required to run migrations')
  }

  await migrate(db, { migrationsFolder: './src/db/migrations' })
}

async function main(): Promise<void> {
  await runPostgresMigrations()
  await postgresPool?.end()
  console.log('PostgreSQL migrations completed')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
