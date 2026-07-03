import { Request, Response, Router } from 'express'
import { formatUnits, isAddress } from 'viem'
import { postgresEnabled } from '../clients/postgresClient'
import { viemClient } from '../clients/viemClient'
import { marketStore } from '../services/storage/marketStore'
import {
  postgresCandleStore,
  StoredPostgresCandle1m,
} from '../services/storage/postgresCandleStore'
import {
  MarketListResponse,
  MarketHoldersResponse,
  MarketSummaryResponse,
  MarketTradesResponse,
  TradingViewCandlesResponse,
} from '../types/market'
import { runBestEffortShadowRead } from '../services/shadowRead'
import { postgresMarketStore } from '../services/storage/postgresMarketStore'
import { createRateLimit } from '../middleware/rateLimit'
import { getBackendEnvironment, isOnlineEnvironment } from '../config/environment'

const router = Router()
const MAX_RANGE_SECONDS = 7 * 24 * 60 * 60
const CHAIN_TIMESTAMP_CACHE_MS = 2_000
const MARKET_READ_RATE_LIMIT_WINDOW_MS = Number(
  process.env.MARKET_READ_RATE_LIMIT_WINDOW_MS ?? 60_000,
)
const MARKET_READ_RATE_LIMIT_MAX = Number(
  process.env.MARKET_READ_RATE_LIMIT_MAX ?? 240,
)
const marketReadRateLimit = createRateLimit({
  keyPrefix: 'market-read',
  windowMs: Number.isFinite(MARKET_READ_RATE_LIMIT_WINDOW_MS)
    ? MARKET_READ_RATE_LIMIT_WINDOW_MS
    : 60_000,
  maxRequests: Number.isFinite(MARKET_READ_RATE_LIMIT_MAX)
    ? MARKET_READ_RATE_LIMIT_MAX
    : 240,
})

let cachedChainTimestamp: { timestamp: number; expiresAt: number } | null = null

function getCandleReadSource(): 'postgres' | 'redis' {
  const requested = process.env.MARKET_CANDLE_READ_SOURCE ?? 'postgres'
  if (requested !== 'postgres' && requested !== 'redis') {
    throw new Error('MARKET_CANDLE_READ_SOURCE must be postgres or redis')
  }

  if (requested === 'redis') {
    const { appEnv } = getBackendEnvironment()
    const legacyRedisReadAllowed =
      appEnv === 'local' &&
      process.env.MARKET_CANDLE_ALLOW_REDIS_LEGACY_READ === 'true'
    if (!legacyRedisReadAllowed || isOnlineEnvironment(appEnv)) {
      throw new Error(
        'Redis candle reads are legacy-only. Use MARKET_CANDLE_READ_SOURCE=postgres outside explicit local legacy mode.',
      )
    }
  }

  return requested
}

async function getChainTimestamp(): Promise<number> {
  const wallClockNow = Date.now()
  if (cachedChainTimestamp && cachedChainTimestamp.expiresAt > wallClockNow) {
    return cachedChainTimestamp.timestamp
  }

  try {
    const block = await viemClient.getBlock()
    const timestamp = Number(block.timestamp)
    cachedChainTimestamp = {
      timestamp,
      expiresAt: wallClockNow + CHAIN_TIMESTAMP_CACHE_MS,
    }
    return timestamp
  } catch (error) {
    console.warn('Failed to read latest chain timestamp, using server time:', error)
    return Math.floor(wallClockNow / 1000)
  }
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp = Number(value)
  return Number.isInteger(timestamp) && timestamp >= 0 ? timestamp : null
}

function parseLimit(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null
  }

  const limit = Number(value)
  return Number.isInteger(limit) && limit > 0 ? limit : null
}

function parseCursor(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function buildPostgresResponse(
  candles: StoredPostgresCandle1m[],
  lastIndexedBlock: bigint | null,
  lastConfirmedBlock: bigint | null,
): TradingViewCandlesResponse {
  if (candles.length === 0) {
    return {
      s: 'no_data',
      lastIndexedBlock: lastIndexedBlock?.toString() ?? null,
      lastConfirmedBlock: lastConfirmedBlock?.toString() ?? null,
    }
  }

  return {
    s: 'ok',
    t: candles.map((candle) => candle.time),
    o: candles.map((candle) => formatUnits(BigInt(candle.open), 18)),
    h: candles.map((candle) => formatUnits(BigInt(candle.high), 18)),
    l: candles.map((candle) => formatUnits(BigInt(candle.low), 18)),
    c: candles.map((candle) => formatUnits(BigInt(candle.close), 18)),
    v: candles.map((candle) => formatUnits(BigInt(candle.volume), 18)),
    volumeQuoteGrossComplete: candles.map(
      (candle) => candle.volumeQuoteGrossComplete,
    ),
    lastIndexedBlock: lastIndexedBlock?.toString() ?? null,
    lastConfirmedBlock: lastConfirmedBlock?.toString() ?? null,
  }
}

async function getPostgresResponse(
  chainId: number,
  tokenAddress: string,
  from: number,
  to: number,
): Promise<TradingViewCandlesResponse> {
  const metadata = await postgresMarketStore.getMarketCheckpointMetadataByTokenAddress(
    chainId,
    tokenAddress,
  )
  const cached = await marketStore
    .getCandleQueryCache<TradingViewCandlesResponse>(
      chainId,
      tokenAddress,
      from,
      to,
    )
    .catch((error) => {
      console.warn('Redis candle query cache read failed:', error)
      return null
    })
  if (cached) {
    return {
      ...cached,
      lastIndexedBlock: metadata.lastIndexedBlock?.toString() ?? null,
      lastConfirmedBlock: metadata.lastFinalizedBlock?.toString() ?? null,
    }
  }

  const response = buildPostgresResponse(
    await postgresCandleStore.getCandles(chainId, tokenAddress, from, to),
    metadata.lastIndexedBlock,
    metadata.lastFinalizedBlock,
  )
  await marketStore
    .setCandleQueryCache(chainId, tokenAddress, from, to, response)
    .catch((error) => {
      console.warn('Redis candle query cache write failed:', error)
    })
  return response
}

async function getRedisResponse(
  chainId: number,
  tokenAddress: string,
  from: number,
  to: number,
): Promise<TradingViewCandlesResponse> {
  const candles = await marketStore.getCandles(chainId, tokenAddress, from, to)
  if (candles.length === 0) {
    return { s: 'no_data' }
  }

  return {
    s: 'ok',
    t: candles.map((candle) => candle.time),
    o: candles.map((candle) => formatUnits(BigInt(candle.openWei), 18)),
    h: candles.map((candle) => formatUnits(BigInt(candle.highWei), 18)),
    l: candles.map((candle) => formatUnits(BigInt(candle.lowWei), 18)),
    c: candles.map((candle) => formatUnits(BigInt(candle.closeWei), 18)),
    v: candles.map((candle) => formatUnits(BigInt(candle.volumeWei), 18)),
    volumeQuoteGrossComplete: candles.map(() => false),
  }
}

function logShadowDifference(
  tokenAddress: string,
  postgres: TradingViewCandlesResponse,
  redis: TradingViewCandlesResponse,
): void {
  const samePrices =
    JSON.stringify({
      s: postgres.s,
      t: postgres.t,
      o: postgres.o,
      h: postgres.h,
      l: postgres.l,
      c: postgres.c,
    }) ===
    JSON.stringify({
      s: redis.s,
      t: redis.t,
      o: redis.o,
      h: redis.h,
      l: redis.l,
      c: redis.c,
    })

  if (!samePrices) {
    console.warn('PostgreSQL/Redis candle shadow price mismatch', {
      tokenAddress,
      postgresCandles: postgres.t?.length ?? 0,
      redisCandles: redis.t?.length ?? 0,
    })
  }
}

router.get('/list', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseLimit(req.query.limit) ?? 100
    if (req.query.limit !== undefined && parseLimit(req.query.limit) === null) {
      res.status(400).json({ error: 'Invalid limit' })
      return
    }
    if (!postgresEnabled) {
      throw new Error('DATABASE_URL is required for PostgreSQL market list reads')
    }

    const response: MarketListResponse = await postgresMarketStore.getMarketList(
      viemClient.chain.id,
      await getChainTimestamp(),
      limit,
    )
    res.json(response)
  } catch (error) {
    console.error('Failed to query market list:', error)
    res.status(500).json({ error: 'Failed to query market list' })
  }
})

router.get('/:tokenAddress/candles', marketReadRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const tokenAddress = req.params.tokenAddress
    const resolution = req.query.resolution
    const from = parseTimestamp(req.query.from)
    const to = parseTimestamp(req.query.to)

    if (!isAddress(tokenAddress)) {
      res.status(400).json({ s: 'error', errmsg: 'Invalid token address' })
      return
    }
    if (resolution !== '1') {
      res.status(400).json({ s: 'error', errmsg: 'Only resolution=1 is supported' })
      return
    }
    if (from === null || to === null || from >= to) {
      res.status(400).json({ s: 'error', errmsg: 'Invalid from/to range' })
      return
    }
    if (to - from > MAX_RANGE_SECONDS) {
      res.status(400).json({ s: 'error', errmsg: 'Range cannot exceed 7 days' })
      return
    }

    const chainId = viemClient.chain.id
    const readSource = getCandleReadSource()
    if (readSource === 'postgres' && !postgresEnabled) {
      throw new Error('DATABASE_URL is required for PostgreSQL candle reads')
    }

    const response =
      readSource === 'postgres'
        ? await getPostgresResponse(chainId, tokenAddress, from, to)
        : await getRedisResponse(chainId, tokenAddress, from, to)

    if (
      postgresEnabled &&
      process.env.MARKET_CANDLE_SHADOW_READ === 'true'
    ) {
      void runBestEffortShadowRead(async () => {
        const rawShadow =
          readSource === 'postgres'
            ? await getRedisResponse(chainId, tokenAddress, from, to)
            : await getPostgresResponse(chainId, tokenAddress, from, to)
        logShadowDifference(
          tokenAddress,
          readSource === 'postgres' ? response : rawShadow,
          readSource === 'postgres' ? rawShadow : response,
        )
      })
    }

    res.json(response)
  } catch (error) {
    console.error('Failed to query candles:', error)
    res.status(500).json({ s: 'error', errmsg: 'Failed to query candles' })
  }
})

router.get('/:tokenAddress/trades', marketReadRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const tokenAddress = req.params.tokenAddress
    const limit = parseLimit(req.query.limit)
    const cursor = parseCursor(req.query.cursor)

    if (!isAddress(tokenAddress)) {
      res.status(400).json({ s: 'error', errmsg: 'Invalid token address' })
      return
    }
    if (req.query.limit !== undefined && limit === null) {
      res.status(400).json({ s: 'error', errmsg: 'Invalid limit' })
      return
    }
    if (req.query.cursor !== undefined && cursor === null) {
      res.status(400).json({ s: 'error', errmsg: 'Invalid cursor' })
      return
    }
    if (!postgresEnabled) {
      throw new Error('DATABASE_URL is required for PostgreSQL trade reads')
    }

    const chainId = viemClient.chain.id
    const response: MarketTradesResponse = await postgresMarketStore.getRecentTradesByTokenAddress(
      chainId,
      tokenAddress,
      limit,
      cursor,
    )

    res.json(response)
  } catch (error) {
    console.error('Failed to query trades:', error)
    res.status(500).json({ s: 'error', errmsg: 'Failed to query trades' })
  }
})

router.get('/:tokenAddress/holders', marketReadRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const tokenAddress = req.params.tokenAddress
    const limit = parseLimit(req.query.limit)

    if (!isAddress(tokenAddress)) {
      res.status(400).json({ error: 'Invalid token address' })
      return
    }
    if (req.query.limit !== undefined && limit === null) {
      res.status(400).json({ error: 'Invalid limit' })
      return
    }
    if (!postgresEnabled) {
      throw new Error('DATABASE_URL is required for PostgreSQL holder reads')
    }

    const response: MarketHoldersResponse = await postgresMarketStore.getTopHoldersByTokenAddress(
      viemClient.chain.id,
      tokenAddress,
      limit,
    )

    res.json(response)
  } catch (error) {
    console.error('Failed to query holders:', error)
    res.status(500).json({ error: 'Failed to query holders' })
  }
})

router.get('/:tokenAddress/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const tokenAddress = req.params.tokenAddress
    if (!isAddress(tokenAddress)) {
      res.status(400).json({ error: 'Invalid token address' })
      return
    }
    if (!postgresEnabled) {
      throw new Error('DATABASE_URL is required for PostgreSQL market config reads')
    }

    const config = await postgresMarketStore.getMarketConfigByTokenAddress(
      viemClient.chain.id,
      tokenAddress,
    )
    if (!config) {
      res.status(404).json({ error: 'Market not found' })
      return
    }
    res.json(config)
  } catch (error) {
    console.error('Failed to query market config:', error)
    res.status(500).json({ error: 'Failed to query market config' })
  }
})

router.get('/:tokenAddress/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const tokenAddress = req.params.tokenAddress

    if (!isAddress(tokenAddress)) {
      res.status(400).json({ s: 'error', errmsg: 'Invalid token address' })
      return
    }
    if (!postgresEnabled) {
      throw new Error('DATABASE_URL is required for PostgreSQL summary reads')
    }

    const chainId = viemClient.chain.id
    const chainTimestamp = await getChainTimestamp()
    const response: MarketSummaryResponse = await postgresMarketStore.getMarketSummaryByTokenAddress(
      chainId,
      tokenAddress,
      chainTimestamp,
    )

    res.json(response)
  } catch (error) {
    console.error('Failed to query summary:', error)
    res.status(500).json({ s: 'error', errmsg: 'Failed to query summary' })
  }
})

export default router
