import { postgresPool } from '../clients/postgresClient'
import { viemClient } from '../clients/viemClient'
import { createMarketIndexer } from '../services/marketIndexer'
import { postgresMarketStore } from '../services/storage/postgresMarketStore'

const factoryAddress = process.env.MEME_FACTORY_ADDRESS as `0x${string}` | undefined
const liquidityManagerAddress = process.env.LIQUIDITY_MANAGER_ADDRESS as
  | `0x${string}`
  | undefined
const fromBlock = BigInt(process.env.BACKFILL_FROM_BLOCK ?? '0')
const toBlock = process.env.BACKFILL_TO_BLOCK
  ? BigInt(process.env.BACKFILL_TO_BLOCK)
  : await viemClient.getBlockNumber()

if (!factoryAddress) throw new Error('MEME_FACTORY_ADDRESS is required')
if (!postgresMarketStore.enabled) throw new Error('DATABASE_URL is required')

const indexer = createMarketIndexer(factoryAddress, liquidityManagerAddress)
await indexer.backfill(fromBlock, toBlock)
console.log(
  `Backfilled formal Factory, Market and LiquidityManager facts from ${fromBlock} to ${toBlock} ` +
    `without advancing the scanner checkpoint`,
)
await postgresPool?.end()
