import { sql } from 'drizzle-orm'
import { db, postgresPool } from '../clients/postgresClient'
import { redis } from '../clients/redisClient'
import {
  CandleBucket,
  rebuildCandleBucket,
} from '../services/candleProjector'
import { marketStore } from '../services/storage/marketStore'

if (!db || !postgresPool) {
  throw new Error('DATABASE_URL is required to rebuild market candles')
}

const chainId = process.env.REBUILD_CHAIN_ID
  ? Number(process.env.REBUILD_CHAIN_ID)
  : null
const tokenAddress = process.env.REBUILD_TOKEN_ADDRESS?.toLowerCase() ?? null
const from = process.env.REBUILD_FROM ? new Date(process.env.REBUILD_FROM) : null
const to = process.env.REBUILD_TO ? new Date(process.env.REBUILD_TO) : null

if (chainId !== null && !Number.isInteger(chainId)) {
  throw new Error('REBUILD_CHAIN_ID must be an integer')
}
if (from && Number.isNaN(from.getTime())) {
  throw new Error('REBUILD_FROM must be a valid date')
}
if (to && Number.isNaN(to.getTime())) {
  throw new Error('REBUILD_TO must be a valid date')
}

await db.execute(sql`
  delete from market_candles_1m
  where (${chainId}::integer is null or chain_id = ${chainId})
    and (${tokenAddress}::text is null or token_address = ${tokenAddress})
    and (${from}::timestamptz is null or bucket_start >= ${from})
    and (${to}::timestamptz is null or bucket_start < ${to})
`)

const result = await db.execute(sql`
  select distinct
    chain_id,
    token_address,
    date_trunc('minute', block_timestamp) as bucket_start
  from market_trades
  where canonical = true
    and (${chainId}::integer is null or chain_id = ${chainId})
    and (${tokenAddress}::text is null or token_address = ${tokenAddress})
    and (${from}::timestamptz is null or block_timestamp >= ${from})
    and (${to}::timestamptz is null or block_timestamp < ${to})
  order by chain_id, token_address, bucket_start
`)

const rebuiltMarkets = new Set<string>()
for (const row of result.rows as Array<{
  chain_id: number
  token_address: string
  bucket_start: Date
}>) {
  const bucket: CandleBucket = {
    tokenAddress: row.token_address,
    bucketStart: new Date(row.bucket_start),
  }
  await rebuildCandleBucket(db, row.chain_id, bucket)
  rebuiltMarkets.add(`${row.chain_id}:${row.token_address}`)
}

for (const rebuiltMarket of rebuiltMarkets) {
  const separator = rebuiltMarket.indexOf(':')
  const rebuiltChainId = Number(rebuiltMarket.slice(0, separator))
  const rebuiltTokenAddress = rebuiltMarket.slice(separator + 1)
  await marketStore
    .invalidateCandleQueryCache(rebuiltChainId, rebuiltTokenAddress)
    .catch((error) => {
      console.warn('Redis candle query cache invalidation failed:', error)
    })
}

console.log(`Rebuilt ${result.rows.length} market candle bucket(s)`)
redis.disconnect()
await postgresPool.end()
