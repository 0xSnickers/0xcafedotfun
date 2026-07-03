import { postgresEnabled, postgresPool } from '../clients/postgresClient'
import { redis } from '../clients/redisClient'
import { runPostgresMigrations } from '../db/migrate'

const DEFAULT_RETRY_ATTEMPTS = 10
const DEFAULT_RETRY_DELAY_MS = 1_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface StartupBootstrapDeps {
  postgresEnabled: boolean
  waitForPostgresReady: () => Promise<void>
  runPostgresMigrations: () => Promise<void>
  checkRedisReady: () => Promise<void>
}

export async function waitForPostgresReady(
  attempts = DEFAULT_RETRY_ATTEMPTS,
  delayMs = DEFAULT_RETRY_DELAY_MS,
): Promise<void> {
  if (!postgresEnabled || !postgresPool) {
    return
  }

  let lastError: unknown = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await postgresPool.query('select 1')
      console.log('PostgreSQL is ready')
      return
    } catch (error) {
      lastError = error
      console.warn(
        `Waiting for PostgreSQL... (${attempt}/${attempts})`,
        error,
      )
      if (attempt < attempts) {
        await sleep(delayMs)
      }
    }
  }

  const readinessError = new Error(
    `PostgreSQL did not become ready after ${attempts} attempts`,
  )
  ;(readinessError as Error & { cause?: unknown }).cause = lastError
  throw readinessError
}

export async function checkRedisReady(): Promise<void> {
  await redis.ping()
  console.log('Redis is ready')
}

export function createBootstrapBackendServices(deps: StartupBootstrapDeps) {
  return async function bootstrapBackendServices(): Promise<void> {
    if (deps.postgresEnabled) {
      console.log('PostgreSQL bootstrap enabled')
      await deps.waitForPostgresReady()
      await deps.runPostgresMigrations()
      console.log('PostgreSQL migrations completed')

      await deps.checkRedisReady().catch((error) => {
        console.warn(
          'Redis unavailable; PostgreSQL-backed services will continue:',
          error,
        )
      })
      return
    }

    console.log('PostgreSQL bootstrap skipped: DATABASE_URL is not configured')
    await deps.checkRedisReady()
  }
}

export const bootstrapBackendServices = createBootstrapBackendServices({
  postgresEnabled,
  waitForPostgresReady,
  runPostgresMigrations,
  checkRedisReady,
})
