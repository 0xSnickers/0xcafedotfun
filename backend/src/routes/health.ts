import { Router } from 'express'
import { redis } from '../clients/redisClient'
import { postgresEnabled, postgresPool } from '../clients/postgresClient'
import { activeChain, walletClient } from '../clients/viemClient'
import { getBackendEnvironment } from '../config/environment'

const router = Router()
const HEALTH_CHECK_TIMEOUT_MS = 750

type DependencyStatus = 'ok' | 'disabled' | 'error'

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out`))
    }, HEALTH_CHECK_TIMEOUT_MS)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function checkPostgres(): Promise<{ status: DependencyStatus; error?: string }> {
  if (!postgresPool || !postgresEnabled) {
    return { status: 'disabled' }
  }

  try {
    await withTimeout(postgresPool.query('select 1'), 'postgres health check')
    return { status: 'ok' }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown PostgreSQL error',
    }
  }
}

async function checkRedis(): Promise<{ status: DependencyStatus; error?: string }> {
  try {
    await withTimeout(redis.ping(), 'redis health check')
    return { status: 'ok' }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown Redis error',
    }
  }
}

function cleanAddress(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toLowerCase() : null
}

router.get('/', async (_req, res) => {
  const [postgres, redisStatus] = await Promise.all([
    checkPostgres(),
    checkRedis(),
  ])
  const backendEnv = getBackendEnvironment()

  res.json({
    ok: postgres.status !== 'error' && redisStatus.status !== 'error',
    serverTime: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'development',
    appEnv: backendEnv.appEnv,
    chain: {
      id: activeChain.id,
      name: activeChain.name,
    },
    contracts: {
      memeFactory: cleanAddress(process.env.MEME_FACTORY_ADDRESS),
      liquidityManager: cleanAddress(process.env.LIQUIDITY_MANAGER_ADDRESS),
    },
    services: {
      marketIndexerEnabled: process.env.MARKET_INDEXER_ENABLED !== 'false',
      liquidityMonitorConfigured: Boolean(process.env.LIQUIDITY_MANAGER_ADDRESS),
      walletConfigured: Boolean(walletClient.account),
      rateLimitStore: process.env.RATE_LIMIT_STORE === 'redis' ? 'redis' : 'memory',
      marketCandleReadSource: process.env.MARKET_CANDLE_READ_SOURCE ?? 'postgres',
      marketCandleQueryCacheVersion: process.env.MARKET_CANDLE_QUERY_CACHE_VERSION ?? 'pg-v2',
    },
    dependencies: {
      postgres,
      redis: redisStatus,
    },
  })
})

export default router
