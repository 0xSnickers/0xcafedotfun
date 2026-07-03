import { redis } from '../../clients/redisClient'
import {
  aggregateTrade,
  deserializeCandle,
  getMinuteBucket,
  serializeCandle,
  serializeTrade,
} from '../candleAggregator'
import { NormalizedTrade, StoredCandle1m } from '../../types/market'

function normalizeAddress(address: string): string {
  return address.toLowerCase()
}

function eventId(trade: NormalizedTrade): string {
  return `${trade.txHash.toLowerCase()}:${trade.logIndex}`
}

function processedKey(chainId: number, trade: NormalizedTrade): string {
  return `market:processed:${chainId}:${eventId(trade)}`
}

function tradeKey(chainId: number, trade: NormalizedTrade): string {
  return `market:trade:${chainId}:${eventId(trade)}`
}

function tradeIndexKey(chainId: number, tokenAddress: string): string {
  return `market:trade-index:${chainId}:${normalizeAddress(tokenAddress)}`
}

function candleKey(chainId: number, tokenAddress: string): string {
  return `market:candle:1m:${chainId}:${normalizeAddress(tokenAddress)}`
}

function candleIndexKey(chainId: number, tokenAddress: string): string {
  return `market:candle-index:1m:${chainId}:${normalizeAddress(tokenAddress)}`
}

function lastIndexedBlockKey(chainId: number, cursorKey: string): string {
  return `market:last-indexed-block:${chainId}:formal-market:${normalizeAddress(cursorKey)}`
}

function candleQueryCacheKey(
  chainId: number,
  tokenAddress: string,
  from: number,
  to: number,
  cacheVersion: string,
): string {
  return `market:query-cache:${cacheVersion}:candles:1m:${chainId}:${normalizeAddress(tokenAddress)}:${from}:${to}`
}

function candleQueryCacheIndexKey(
  chainId: number,
  tokenAddress: string,
  cacheVersion: string,
): string {
  return `market:query-cache-index:${cacheVersion}:candles:1m:${chainId}:${normalizeAddress(tokenAddress)}`
}

function getCandleQueryCacheVersion(): string {
  return (process.env.MARKET_CANDLE_QUERY_CACHE_VERSION ?? 'pg-v2')
    .replace(/[^a-zA-Z0-9:_-]/g, '_')
}

export class MarketStore {
  private tokenQueues = new Map<string, Promise<void>>()

  async processTrade(chainId: number, trade: NormalizedTrade): Promise<boolean> {
    const queueKey = `${chainId}:${normalizeAddress(trade.tokenAddress)}`
    let processed = false

    const previous = this.tokenQueues.get(queueKey) ?? Promise.resolve()
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        processed = await this.processTradeSerial(chainId, trade)
      })

    this.tokenQueues.set(queueKey, current)

    try {
      await current
      return processed
    } finally {
      if (this.tokenQueues.get(queueKey) === current) {
        this.tokenQueues.delete(queueKey)
      }
    }
  }

  private async processTradeSerial(
    chainId: number,
    trade: NormalizedTrade,
  ): Promise<boolean> {
    if (await redis.exists(processedKey(chainId, trade))) {
      return false
    }

    const bucketStart = getMinuteBucket(trade.timestamp)
    const candleHashKey = candleKey(chainId, trade.tokenAddress)
    const existingJson = await redis.hget(candleHashKey, bucketStart.toString())
    const existing = existingJson
      ? deserializeCandle(JSON.parse(existingJson) as StoredCandle1m)
      : null
    const candle = aggregateTrade(existing, trade)
    const serializedTrade = serializeTrade(trade)

    const transaction = redis.multi()
    transaction.hset(
      tradeKey(chainId, trade),
      Object.fromEntries(
        Object.entries(serializedTrade).map(([key, value]) => [key, String(value)]),
      ),
    )
    transaction.zadd(
      tradeIndexKey(chainId, trade.tokenAddress),
      trade.timestamp,
      eventId(trade),
    )
    transaction.hset(
      candleHashKey,
      bucketStart.toString(),
      JSON.stringify(serializeCandle(candle)),
    )
    transaction.zadd(
      candleIndexKey(chainId, trade.tokenAddress),
      bucketStart,
      bucketStart.toString(),
    )
    transaction.set(processedKey(chainId, trade), '1')

    const result = await transaction.exec()
    if (!result) {
      throw new Error('Redis transaction failed while processing market trade')
    }

    return true
  }

  async getCandles(
    chainId: number,
    tokenAddress: string,
    from: number,
    to: number,
  ): Promise<StoredCandle1m[]> {
    const bucketStarts = await redis.zrangebyscore(
      candleIndexKey(chainId, tokenAddress),
      from,
      to,
    )

    if (bucketStarts.length === 0) {
      return []
    }

    const candles = await redis.hmget(candleKey(chainId, tokenAddress), ...bucketStarts)
    return candles
      .filter((candle): candle is string => candle !== null)
      .map((candle) => JSON.parse(candle) as StoredCandle1m)
      .sort((a, b) => a.time - b.time)
  }

  async getCandleQueryCache<T>(
    chainId: number,
    tokenAddress: string,
    from: number,
    to: number,
  ): Promise<T | null> {
    const cacheVersion = getCandleQueryCacheVersion()
    const value = await redis.get(
      candleQueryCacheKey(chainId, tokenAddress, from, to, cacheVersion),
    )
    return value ? (JSON.parse(value) as T) : null
  }

  async setCandleQueryCache(
    chainId: number,
    tokenAddress: string,
    from: number,
    to: number,
    value: unknown,
  ): Promise<void> {
    const cacheVersion = getCandleQueryCacheVersion()
    const key = candleQueryCacheKey(chainId, tokenAddress, from, to, cacheVersion)
    const indexKey = candleQueryCacheIndexKey(chainId, tokenAddress, cacheVersion)
    const transaction = redis.multi()
    transaction.set(key, JSON.stringify(value), 'EX', 30)
    transaction.sadd(indexKey, key)
    transaction.expire(indexKey, 60)
    await transaction.exec()
  }

  async invalidateCandleQueryCache(
    chainId: number,
    tokenAddress: string,
  ): Promise<void> {
    const indexKey = candleQueryCacheIndexKey(
      chainId,
      tokenAddress,
      getCandleQueryCacheVersion(),
    )
    const keys = await redis.smembers(indexKey)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
    await redis.del(indexKey)
  }

  async getLastIndexedBlock(
    chainId: number,
    cursorKey: string,
  ): Promise<bigint | null> {
    const value = await redis.get(lastIndexedBlockKey(chainId, cursorKey))
    return value === null ? null : BigInt(value)
  }

  async setLastIndexedBlock(
    chainId: number,
    cursorKey: string,
    blockNumber: bigint,
  ): Promise<void> {
    const key = lastIndexedBlockKey(chainId, cursorKey)
    const current = await redis.get(key)

    if (current === null || blockNumber > BigInt(current)) {
      await redis.set(key, blockNumber.toString())
    }
  }
}

export const marketStore = new MarketStore()
