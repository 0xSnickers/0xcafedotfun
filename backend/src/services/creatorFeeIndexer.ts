import { creatorFeesClaimedEvent, feesAccruedEvent } from '../abi/creatorFees'
import { requirePostgresPool } from '../clients/postgresClient'
import { viemClient } from '../clients/viemClient'
import { getLogsWithProviderLimit } from './logRange'
import { detectReorg, type ReorgFacts } from './reorgHandler'
import { postgresCreatorFeeStore } from './storage/postgresCreatorFeeStore'
import type { PoolClient } from 'pg'

const DEFAULT_LOCAL_BACKFILL_BLOCK_CHUNK = 10n
const DEFAULT_SEPOLIA_BACKFILL_BLOCK_CHUNK = 500n
const DEFAULT_MAINNET_BACKFILL_BLOCK_CHUNK = 2_000n
const DEFAULT_CONFIRMATION_DEPTH = 3n
const DEFAULT_POLLING_INTERVAL_MS = 2_000
const DEFAULT_RANGE_RETRY_DELAY_MS = 2_000
const DEFAULT_PREFETCH_RANGES = 1
const DEFAULT_SAFETY_WINDOW = 5n
const DEFAULT_STOP_WAIT_MS = 50
const SCANNER_LOCK_SEED = 0x43524541n

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

interface BlockRange {
  fromBlock: bigint
  toBlock: bigint
}

interface IndexedBlock {
  number: bigint
  hash: string
  parentHash: string
  timestamp: number
}

interface FetchedRange extends BlockRange {
  logs: CreatorFeeLog[]
  blocks: IndexedBlock[]
}

function getPositiveBigIntEnv(name: string, fallback: bigint): bigint {
  try {
    const parsed = BigInt(process.env[name] ?? '')
    return parsed > 0n ? parsed : fallback
  } catch {
    return fallback
  }
}

function getPositiveNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getDefaultBackfillBlockChunk(chainId: number): bigint {
  if (chainId === 1) return DEFAULT_MAINNET_BACKFILL_BLOCK_CHUNK
  if (chainId === 11155111) return DEFAULT_SEPOLIA_BACKFILL_BLOCK_CHUNK
  return DEFAULT_LOCAL_BACKFILL_BLOCK_CHUNK
}

function getScannerLockKey(chainId: number, cursorKey: string): bigint {
  const addressTail = BigInt(
    `0x${cursorKey.toLowerCase().replace(/^0x/, '').slice(-8).padStart(8, '0')}`,
  )
  return (BigInt(chainId) << 32n) ^ addressTail ^ SCANNER_LOCK_SEED
}

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

export class CreatorFeeIndexer {
  private readonly feeVaultAddress: `0x${string}`
  private readonly chainId = viemClient.chain.id
  private readonly blockChunk = getPositiveBigIntEnv(
    'CREATOR_FEE_INDEXER_BLOCK_CHUNK',
    getDefaultBackfillBlockChunk(this.chainId),
  )
  private readonly confirmationDepth = getPositiveBigIntEnv(
    'CREATOR_FEE_INDEXER_CONFIRMATIONS',
    DEFAULT_CONFIRMATION_DEPTH,
  )
  private readonly safetyWindow = getPositiveBigIntEnv(
    'CREATOR_FEE_INDEXER_SAFETY_WINDOW',
    DEFAULT_SAFETY_WINDOW,
  )
  private readonly pollingInterval = getPositiveNumberEnv(
    'CREATOR_FEE_INDEXER_POLL_INTERVAL_MS',
    DEFAULT_POLLING_INTERVAL_MS,
  )
  private readonly prefetchRanges = getPositiveNumberEnv(
    'CREATOR_FEE_INDEXER_PREFETCH_RANGES',
    DEFAULT_PREFETCH_RANGES,
  )
  private timer: NodeJS.Timeout | null = null
  private running = false
  private scanInProgress = false
  private scannerLockClient: PoolClient | null = null

  constructor(feeVaultAddress: `0x${string}`) {
    this.feeVaultAddress = feeVaultAddress
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      await this.scanToLatest()
    } catch (error) {
      console.error('Creator fee indexer initial scan failed; polling will retry:', error)
    }

    this.timer = setInterval(() => {
      void this.scanToLatest().catch((error) => {
        console.error('Creator fee indexer polling failed:', error)
      })
    }, this.pollingInterval)

    console.log(
      `Creator fee indexer active (feeVault=${this.feeVaultAddress}, postgres=${postgresCreatorFeeStore.enabled}, confirmations=${this.confirmationDepth})`,
    )
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.running = false

    while (this.scanInProgress) {
      await new Promise((resolve) => setTimeout(resolve, DEFAULT_STOP_WAIT_MS))
    }
  }

  private async scanToLatest(): Promise<void> {
    if (this.scanInProgress) return
    this.scanInProgress = true

    try {
      if (postgresCreatorFeeStore.enabled && !(await this.tryAcquireScannerLock())) return

      const latestBlock = await viemClient.getBlockNumber()
      await this.reconcileRecentWindow(latestBlock)
      const storedBlock = await postgresCreatorFeeStore.getLastIndexedBlock(
        this.chainId,
        this.feeVaultAddress,
      )
      const configuredStart = BigInt(process.env.FEE_VAULT_START_BLOCK ?? '0')
      let fromBlock = storedBlock === null ? configuredStart : storedBlock + 1n

      if (storedBlock !== null && storedBlock < configuredStart) {
        const resetToBlock = configuredStart > 0n ? configuredStart - 1n : 0n
        console.warn(
          `Creator fee indexer checkpoint ${storedBlock} is behind configured start ${configuredStart}; resetting checkpoint`,
        )
        await postgresCreatorFeeStore.resetCheckpoint({
          chainId: this.chainId,
          cursorKey: this.feeVaultAddress,
          lastIndexedBlock: resetToBlock,
          lastFinalizedBlock:
            resetToBlock > this.confirmationDepth
              ? resetToBlock - this.confirmationDepth
              : 0n,
        })
        fromBlock = configuredStart
      }

      if (storedBlock !== null && storedBlock > latestBlock) {
        console.warn(
          `Creator fee indexer checkpoint ${storedBlock} is ahead of latest block ${latestBlock}; resetting checkpoint`,
        )
        await postgresCreatorFeeStore.resetCheckpoint({
          chainId: this.chainId,
          cursorKey: this.feeVaultAddress,
          lastIndexedBlock: latestBlock,
          lastFinalizedBlock:
            latestBlock > this.confirmationDepth
              ? latestBlock - this.confirmationDepth
              : 0n,
        })
        fromBlock = latestBlock
      }

      if (storedBlock === null && fromBlock > latestBlock) {
        console.warn(
          `Creator fee indexer start block ${fromBlock} is ahead of latest block ${latestBlock}; using latest block`,
        )
        fromBlock = latestBlock
      }

      while (this.running && fromBlock <= latestBlock) {
        const ranges: BlockRange[] = []
        let rangeStart = fromBlock
        while (ranges.length < this.prefetchRanges && rangeStart <= latestBlock) {
          const toBlock =
            rangeStart + this.blockChunk - 1n > latestBlock
              ? latestBlock
              : rangeStart + this.blockChunk - 1n
          ranges.push({ fromBlock: rangeStart, toBlock })
          rangeStart = toBlock + 1n
        }
        await this.processRangesWithRetry(ranges)
        fromBlock = ranges[ranges.length - 1].toBlock + 1n
      }
    } finally {
      await this.releaseScannerLock()
      this.scanInProgress = false
    }
  }

  private async tryAcquireScannerLock(): Promise<boolean> {
    const client = await requirePostgresPool().connect()
    try {
      const result = await client.query(
        'select pg_try_advisory_lock($1::bigint) as acquired',
        [getScannerLockKey(this.chainId, this.feeVaultAddress).toString()],
      )
      if (result.rows[0]?.acquired === true) {
        this.scannerLockClient = client
        return true
      }
      client.release()
      return false
    } catch (error) {
      client.release()
      throw error
    }
  }

  private async releaseScannerLock(): Promise<void> {
    const client = this.scannerLockClient
    if (!client) return
    this.scannerLockClient = null
    try {
      await client.query('select pg_advisory_unlock($1::bigint)', [
        getScannerLockKey(this.chainId, this.feeVaultAddress).toString(),
      ])
    } finally {
      client.release()
    }
  }

  private async reconcileRecentWindow(latestBlock: bigint): Promise<void> {
    if (!postgresCreatorFeeStore.enabled) return
    const checkpoint = await postgresCreatorFeeStore.getCreatorFeeCheckpointMetadata(
      this.chainId,
      this.feeVaultAddress,
    )
    if (checkpoint.lastIndexedBlock === null) return

    const checkpointBlock =
      checkpoint.lastIndexedBlock > latestBlock
        ? latestBlock
        : checkpoint.lastIndexedBlock
    const windowSize = this.confirmationDepth + this.safetyWindow
    const fromBlock = checkpointBlock > windowSize ? checkpointBlock - windowSize : 0n
    const toBlock = checkpointBlock
    const fetched = await this.fetchRange(fromBlock, toBlock)
    const storedFacts: ReorgFacts = {
      blocks: await postgresCreatorFeeStore.getCanonicalBlocksInRange(
        this.chainId,
        this.feeVaultAddress,
        fromBlock,
        toBlock,
      ),
      logs: await postgresCreatorFeeStore.getCanonicalLogsInRange(
        this.chainId,
        this.feeVaultAddress,
        fromBlock,
        toBlock,
      ),
    }
    const fetchedFacts: ReorgFacts = {
      blocks: fetched.blocks.map((block) => ({
        blockNumber: block.number,
        blockHash: block.hash.toLowerCase(),
      })),
      logs: fetched.logs
        .filter((log) => hasIdentity(log))
        .map((log) => ({
          blockNumber: log.blockNumber!,
          blockHash: log.blockHash!.toLowerCase(),
          transactionHash: log.transactionHash!.toLowerCase(),
          transactionIndex: log.transactionIndex!,
          logIndex: log.logIndex!,
        })),
    }
    const detection = detectReorg(storedFacts, fetchedFacts)
    if (!detection) return

    console.warn('Creator fee reorg detected', detection)
    await postgresCreatorFeeStore.rollbackCanonicalFromBlock(
      this.chainId,
      this.feeVaultAddress,
      detection.affectedFromBlock,
    )
  }

  private async processRangesWithRetry(ranges: BlockRange[]): Promise<void> {
    let attempt = 0
    while (this.running) {
      try {
        for (const range of ranges) {
          await this.persistRange(await this.fetchRange(range.fromBlock, range.toBlock))
        }
        return
      } catch (error) {
        attempt += 1
        console.warn(`Creator fee indexer range failed; retrying (attempt=${attempt})`, error)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(DEFAULT_RANGE_RETRY_DELAY_MS * attempt, 30_000)),
        )
      }
    }
  }

  private async fetchRange(fromBlock: bigint, toBlock: bigint): Promise<FetchedRange> {
    const [accrualLogs, claimLogs] = await Promise.all([
      getLogsWithProviderLimit<CreatorAccrualLog>(
        async (rangeStart, rangeEnd) =>
          (await viemClient.getLogs({
            address: this.feeVaultAddress,
            event: feesAccruedEvent,
            fromBlock: rangeStart,
            toBlock: rangeEnd,
          })) as unknown as CreatorAccrualLog[],
        fromBlock,
        toBlock,
      ),
      getLogsWithProviderLimit<CreatorClaimLog>(
        async (rangeStart, rangeEnd) =>
          (await viemClient.getLogs({
            address: this.feeVaultAddress,
            event: creatorFeesClaimedEvent,
            fromBlock: rangeStart,
            toBlock: rangeEnd,
          })) as unknown as CreatorClaimLog[],
        fromBlock,
        toBlock,
      ),
    ])

    const logs = [...accrualLogs, ...claimLogs].sort(
      (a, b) =>
        Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)) ||
        (a.transactionIndex ?? 0) - (b.transactionIndex ?? 0) ||
        (a.logIndex ?? 0) - (b.logIndex ?? 0),
    )

    const blockNumbers = [...new Set(logs.map((log) => {
      if (log.blockNumber === null) {
        throw new Error('Creator fee event is missing block number')
      }
      return log.blockNumber
    }))]
    const fetchedBlocks = await Promise.all(
      blockNumbers.map((blockNumber) => viemClient.getBlock({ blockNumber })),
    )
    const blocks = fetchedBlocks.map((block) => {
      if (!block.hash) throw new Error(`Block ${block.number} is missing hash`)
      return {
        number: block.number,
        hash: block.hash,
        parentHash: block.parentHash,
        timestamp: Number(block.timestamp),
      }
    })

    return { fromBlock, toBlock, logs, blocks }
  }

  private async persistRange(range: FetchedRange, advanceCheckpoint = true): Promise<void> {
    const logsByBlock = new Map<bigint, CreatorFeeLog[]>()
    for (const log of range.logs) {
      if (log.blockNumber === null) throw new Error('Creator fee event is missing block number')
      const logs = logsByBlock.get(log.blockNumber) ?? []
      logs.push(log)
      logsByBlock.set(log.blockNumber, logs)
    }

    for (const block of range.blocks) {
      const logs = (logsByBlock.get(block.number) ?? []).sort(
        (a, b) =>
          (a.transactionIndex ?? 0) - (b.transactionIndex ?? 0) ||
          (a.logIndex ?? 0) - (b.logIndex ?? 0),
      )

      await postgresCreatorFeeStore.persistEvents({
        chainId: this.chainId,
        cursorKey: this.feeVaultAddress,
        confirmationDepth: this.confirmationDepth,
        advanceCheckpoint: false,
        block,
        rawLogs: logs.map((log) => ({
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
        accruals: logs
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
        claims: logs
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

    if (advanceCheckpoint) {
      await postgresCreatorFeeStore.advanceCheckpoint({
        chainId: this.chainId,
        cursorKey: this.feeVaultAddress,
        confirmationDepth: this.confirmationDepth,
        lastIndexedBlock: range.toBlock,
      })
    }
  }
}

export function createCreatorFeeIndexer(
  feeVaultAddress: `0x${string}`,
): CreatorFeeIndexer {
  return new CreatorFeeIndexer(feeVaultAddress)
}
