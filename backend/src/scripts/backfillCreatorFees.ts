import { sql } from 'drizzle-orm'
import { creatorFeesClaimedEvent, feesAccruedEvent } from '../abi/creatorFees'
import { postgresPool, requirePostgresPool } from '../clients/postgresClient'
import { viemClient } from '../clients/viemClient'
import { getLogsWithProviderLimit } from '../services/logRange'
import { postgresCreatorFeeStore } from '../services/storage/postgresCreatorFeeStore'

interface BaseCreatorFeeLog {
  address: `0x${string}`
  args: Record<string, unknown>
  topics: readonly `0x${string}`[]
  data: `0x${string}`
  transactionHash: `0x${string}` | null
  transactionIndex: number | null
  logIndex: number | null
  blockHash: `0x${string}` | null
  blockNumber: bigint | null
}

interface CreatorClaimLog extends BaseCreatorFeeLog {
  eventName: 'CreatorFeesClaimed'
}

interface CreatorAccrualLog extends BaseCreatorFeeLog {
  eventName: 'FeesAccrued'
}

type CreatorFeeLog = CreatorClaimLog | CreatorAccrualLog

function requireAddress(args: Record<string, unknown>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string') {
    throw new Error(`Creator fee event is missing address argument ${name}`)
  }
  return value.toLowerCase()
}

function requireBigInt(args: Record<string, unknown>, name: string): bigint {
  const value = args[name]
  if (typeof value !== 'bigint') {
    throw new Error(`Creator fee event is missing uint argument ${name}`)
  }
  return value
}

function hasIdentity(log: CreatorFeeLog): boolean {
  return Boolean(
    log.blockNumber !== null &&
      log.blockHash &&
      log.transactionHash &&
      log.transactionIndex !== null &&
      log.logIndex !== null,
  )
}

function bigintArgsToJson(args: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, String(value)]),
  )
}

const feeVaultAddress = process.env.FEE_VAULT_ADDRESS as `0x${string}` | undefined
const fromBlock = BigInt(
  process.env.BACKFILL_FROM_BLOCK ??
    process.env.FEE_VAULT_START_BLOCK ??
    process.env.MARKET_INDEXER_START_BLOCK ??
    '0',
)

const toBlock = process.env.BACKFILL_TO_BLOCK
  ? BigInt(process.env.BACKFILL_TO_BLOCK)
  : await viemClient.getBlockNumber()
const confirmationDepth = BigInt(process.env.CREATOR_FEE_INDEXER_CONFIRMATIONS ?? '3')
const resetExisting = process.env.BACKFILL_RESET_EXISTING === 'true'

if (!feeVaultAddress) throw new Error('FEE_VAULT_ADDRESS is required')
if (!postgresCreatorFeeStore.enabled) throw new Error('DATABASE_URL is required')
if (toBlock < fromBlock) throw new Error('BACKFILL_TO_BLOCK must be greater than or equal to BACKFILL_FROM_BLOCK')

const chainId = viemClient.chain.id
const blockChunk = BigInt(process.env.CREATOR_FEE_INDEXER_BLOCK_CHUNK ?? '10')

if (resetExisting) {
  const pool = requirePostgresPool()
  await pool.query('begin')
  try {
    await pool.query(
      `delete from creator_fee_accruals where chain_id = $1 and block_number >= $2::numeric and block_number <= $3::numeric`,
      [chainId, fromBlock.toString(), toBlock.toString()],
    )
    await pool.query(
      `delete from creator_fee_claims where chain_id = $1 and block_number >= $2::numeric and block_number <= $3::numeric`,
      [chainId, fromBlock.toString(), toBlock.toString()],
    )
    await pool.query(
      `delete from raw_chain_logs where chain_id = $1 and contract_address = $2 and block_number >= $3::numeric and block_number <= $4::numeric`,
      [chainId, feeVaultAddress.toLowerCase(), fromBlock.toString(), toBlock.toString()],
    )
    await pool.query(
      `delete from chain_blocks where chain_id = $1 and block_number >= $2::numeric and block_number <= $3::numeric`,
      [chainId, fromBlock.toString(), toBlock.toString()],
    )
    await pool.query('commit')
  } catch (error) {
    await pool.query('rollback')
    throw error
  }
}

for (let rangeStart = fromBlock; rangeStart <= toBlock; rangeStart += blockChunk) {
  const rangeEnd = rangeStart + blockChunk - 1n > toBlock ? toBlock : rangeStart + blockChunk - 1n

  const [accrualLogs, claimLogs] = await Promise.all([
    getLogsWithProviderLimit<CreatorAccrualLog>(
      async (start, end) =>
        (await viemClient.getLogs({
          address: feeVaultAddress,
          event: feesAccruedEvent,
          fromBlock: start,
          toBlock: end,
        })) as unknown as CreatorAccrualLog[],
      rangeStart,
      rangeEnd,
    ),
    getLogsWithProviderLimit<CreatorClaimLog>(
      async (start, end) =>
        (await viemClient.getLogs({
          address: feeVaultAddress,
          event: creatorFeesClaimedEvent,
          fromBlock: start,
          toBlock: end,
        })) as unknown as CreatorClaimLog[],
      rangeStart,
      rangeEnd,
    ),
  ])

  const logs = [...accrualLogs, ...claimLogs].sort(
    (a, b) =>
      Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)) ||
      (a.transactionIndex ?? 0) - (b.transactionIndex ?? 0) ||
      (a.logIndex ?? 0) - (b.logIndex ?? 0),
  )

  const logsByBlock = new Map<bigint, CreatorFeeLog[]>()
  for (const log of logs) {
    if (log.blockNumber === null) throw new Error('Creator fee event is missing block number')
    const bucket = logsByBlock.get(log.blockNumber) ?? []
    bucket.push(log)
    logsByBlock.set(log.blockNumber, bucket)
  }

  const blockNumbers = [...new Set(logs.map((log) => log.blockNumber).filter((value): value is bigint => value !== null))]
  const fetchedBlocks = await Promise.all(blockNumbers.map((blockNumber) => viemClient.getBlock({ blockNumber })))
  const blocks = fetchedBlocks.map((block) => {
    if (!block.hash) throw new Error(`Block ${block.number} is missing hash`)
    return {
      number: block.number,
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: Number(block.timestamp),
    }
  })

  for (const block of blocks) {
    const blockLogs = (logsByBlock.get(block.number) ?? []).sort(
      (a, b) =>
        (a.transactionIndex ?? 0) - (b.transactionIndex ?? 0) ||
        (a.logIndex ?? 0) - (b.logIndex ?? 0),
    )

    await postgresCreatorFeeStore.persistEvents({
      chainId,
      cursorKey: feeVaultAddress,
      confirmationDepth,
      block,
      advanceCheckpoint: false,
      rawLogs: blockLogs.map((log) => ({
        blockNumber: log.blockNumber!,
        blockHash: log.blockHash!,
        transactionHash: log.transactionHash!,
        transactionIndex: log.transactionIndex!,
        logIndex: log.logIndex!,
        contractAddress: log.address,
        topic0: log.topics[0]!,
        topics: [...log.topics],
        data: log.data,
        eventName: log.eventName,
        decodedArgs: bigintArgsToJson(log.args),
      })),
      accruals: blockLogs
        .filter((log): log is CreatorAccrualLog => log.eventName === 'FeesAccrued')
        .map((log) => {
          if (!hasIdentity(log)) {
            throw new Error('Creator fee accrual event is missing transaction identity')
          }
          return {
            tokenAddress: requireAddress(log.args, 'token'),
            marketAddress: requireAddress(log.args, 'market'),
            creatorAddress: requireAddress(log.args, 'creator'),
            platformFeeRaw: requireBigInt(log.args, 'platformFee'),
            creatorFeeRaw: requireBigInt(log.args, 'creatorFee'),
            transactionHash: log.transactionHash!,
            transactionIndex: log.transactionIndex!,
            logIndex: log.logIndex!,
            blockNumber: log.blockNumber!,
            blockHash: log.blockHash!,
            blockTimestamp: block.timestamp,
          }
        }),
      claims: blockLogs
        .filter((log): log is CreatorClaimLog => log.eventName === 'CreatorFeesClaimed')
        .map((log) => {
          if (!hasIdentity(log)) {
            throw new Error('Creator fee claim event is missing transaction identity')
          }
          return {
            creatorAddress: requireAddress(log.args, 'creator'),
            recipientAddress: requireAddress(log.args, 'recipient'),
            amountRaw: requireBigInt(log.args, 'amount'),
            transactionHash: log.transactionHash!,
            transactionIndex: log.transactionIndex!,
            logIndex: log.logIndex!,
            blockNumber: log.blockNumber!,
            blockHash: log.blockHash!,
            blockTimestamp: block.timestamp,
          }
        }),
    })
  }

  console.log({
    chainId,
    rangeStart: rangeStart.toString(),
    rangeEnd: rangeEnd.toString(),
    accrualLogs: accrualLogs.length,
    claimLogs: claimLogs.length,
    blockCount: blocks.length,
  })
}

const latestIndexedBlock = toBlock
const finalizedBlock = latestIndexedBlock > confirmationDepth ? latestIndexedBlock - confirmationDepth : 0n
await requirePostgresPool().query(
  `insert into indexer_checkpoints (
     consumer_name,
     chain_id,
     cursor_key,
     last_indexed_block,
     last_finalized_block,
     updated_at
   )
   values ($1, $2, $3, $4::numeric, $5::numeric, now())
   on conflict (consumer_name, chain_id, cursor_key) do update set
     last_indexed_block = excluded.last_indexed_block,
     last_finalized_block = excluded.last_finalized_block,
     updated_at = now()`,
  ['creator-fee-indexer', chainId, feeVaultAddress.toLowerCase(), latestIndexedBlock.toString(), finalizedBlock.toString()],
)

console.log({
  chainId,
  feeVaultAddress,
  fromBlock: fromBlock.toString(),
  toBlock: toBlock.toString(),
  latestIndexedBlock: latestIndexedBlock.toString(),
  finalizedBlock: finalizedBlock.toString(),
  resetExisting,
})

await postgresPool?.end()
