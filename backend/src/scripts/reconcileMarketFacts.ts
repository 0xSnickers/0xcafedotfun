import { postgresPool } from '../clients/postgresClient'
import { redis } from '../clients/redisClient'
import { viemClient } from '../clients/viemClient'

if (!postgresPool) {
  throw new Error('DATABASE_URL is required for market reconciliation')
}

const chainId = viemClient.chain.id
const fromBlock = process.env.RECONCILE_FROM_BLOCK
  ? BigInt(process.env.RECONCILE_FROM_BLOCK)
  : null
const toBlock = process.env.RECONCILE_TO_BLOCK
  ? BigInt(process.env.RECONCILE_TO_BLOCK)
  : null
const pgResult = await postgresPool.query(
  `select
     count(*)::int as trade_count,
     min(block_number)::text as first_block,
     max(block_number)::text as last_block
   from market_trades
   where chain_id = $1
     and canonical = true
     and ($2::numeric is null or block_number >= $2::numeric)
     and ($3::numeric is null or block_number <= $3::numeric)`,
  [chainId, fromBlock?.toString() ?? null, toBlock?.toString() ?? null],
)

let cursor = '0'
let redisTradeCount = 0
do {
  const [nextCursor, keys] = await redis.scan(
    cursor,
    'MATCH',
    `market:trade:${chainId}:*`,
    'COUNT',
    1000,
  )
  cursor = nextCursor
  for (const key of keys) {
    const storedBlock = await redis.hget(key, 'blockNumber')
    if (!storedBlock) {
      continue
    }
    const blockNumber = BigInt(storedBlock)
    if (
      (fromBlock === null || blockNumber >= fromBlock) &&
      (toBlock === null || blockNumber <= toBlock)
    ) {
      redisTradeCount += 1
    }
  }
} while (cursor !== '0')

console.log({
  chainId,
  range: {
    fromBlock: fromBlock?.toString() ?? null,
    toBlock: toBlock?.toString() ?? null,
  },
  postgres: pgResult.rows[0],
  redis: { tradeCount: redisTradeCount },
  countsMatch: pgResult.rows[0].trade_count === redisTradeCount,
})

await redis.quit()
await postgresPool.end()
