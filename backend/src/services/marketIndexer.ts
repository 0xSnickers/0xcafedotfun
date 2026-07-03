import {
  formalLiquidityEvents,
  formalMarketLifecycleEvents,
  formalTradeEvents,
  tokenCreatedEvent,
  uniswapV2PairEvents,
} from '../abi/formalMarketEvents'
import { requirePostgresPool } from '../clients/postgresClient'
import { viemClient } from '../clients/viemClient'
import { IndexedTrade } from '../types/market'
import { normalizeDexSwapTrade } from './dexTradeNormalizer'
import { normalizeFormalTrade } from './formalTradeNormalizer'
import { getLogsWithProviderLimit, uniqueEventBlockNumbers } from './logRange'
import { detectReorg, ReorgFacts } from './reorgHandler'
import {
  IndexedBlock,
  IndexedRawLog,
  MarketLifecycleUpdate,
  PoolReserveUpdate,
  MarketRegistration,
  postgresMarketStore,
  RegisteredDexPair,
} from './storage/postgresMarketStore'
import { marketStore } from './storage/marketStore'
import type { PoolClient } from 'pg'

const DEFAULT_LOCAL_BACKFILL_BLOCK_CHUNK = 10n
const DEFAULT_SEPOLIA_BACKFILL_BLOCK_CHUNK = 500n
const DEFAULT_MAINNET_BACKFILL_BLOCK_CHUNK = 2_000n
const DEFAULT_CONFIRMATION_DEPTH = 3n
const DEFAULT_POLLING_INTERVAL_MS = 2_000
const DEFAULT_RANGE_RETRY_DELAY_MS = 2_000
const DEFAULT_PREFETCH_RANGES = 1
const DEFAULT_MARKET_ADDRESS_BATCH_SIZE = 50
const DEFAULT_SAFETY_WINDOW = 5n
const DEFAULT_STOP_WAIT_MS = 50
const SCANNER_LOCK_SEED = 0x4d41524bn

interface FormalEventLog {
  address: `0x${string}`
  args: Record<string, unknown>
  eventName:
    | 'TokenCreated'
    | 'TokenBought'
    | 'TokenSold'
    | 'GraduationPrepared'
    | 'TokenGraduated'
    | 'GraduationRegistered'
    | 'LiquidityAdded'
    | 'Swap'
    | 'Mint'
    | 'Burn'
    | 'Sync'
  topics: readonly `0x${string}`[]
  data: `0x${string}`
  transactionHash: `0x${string}` | null
  transactionIndex: number | null
  logIndex: number | null
  blockHash: `0x${string}` | null
  blockNumber: bigint | null
}

interface BlockRange {
  fromBlock: bigint
  toBlock: bigint
}

interface FetchedRange extends BlockRange {
  logs: FormalEventLog[]
  blocks: IndexedBlock[]
}

interface DexPairInfo extends RegisteredDexPair {
  token0?: string
  token1?: string
}

const UNISWAP_V2_PAIR_METADATA_ABI = [
  {
    type: 'function',
    name: 'token0',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'token1',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const

const TOKEN_MARKET_CURVE_CONFIG_ABI = [
  {
    type: 'function',
    name: 'curveConfig',
    inputs: [],
    outputs: [
      { name: 'initialPriceX18', type: 'uint256' },
      { name: 'targetPriceX18', type: 'uint256' },
      { name: 'targetSupply', type: 'uint256' },
      { name: 'graduationMarketCap', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
] as const

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

function bigintArgsToJson(args: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, String(value)]),
  )
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
    throw new Error(`Formal event is missing address argument ${name}`)
  }
  return value.toLowerCase()
}

function requireBigInt(args: Record<string, unknown>, name: string): bigint {
  const value = args[name]
  if (typeof value !== 'bigint') {
    throw new Error(`Formal event is missing uint argument ${name}`)
  }
  return value
}

function requireString(args: Record<string, unknown>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string') {
    throw new Error(`Formal event is missing string argument ${name}`)
  }
  return value
}

export class MarketIndexer {
  private readonly factoryAddress: `0x${string}`
  private readonly liquidityManagerAddress?: `0x${string}`
  private readonly chainId = viemClient.chain.id
  private readonly markets = new Set<`0x${string}`>()
  private readonly dexPairs = new Map<string, DexPairInfo>()
  private readonly blockChunk = getPositiveBigIntEnv(
    'MARKET_INDEXER_BLOCK_CHUNK',
    getDefaultBackfillBlockChunk(this.chainId),
  )
  private readonly confirmationDepth = getPositiveBigIntEnv(
    'MARKET_INDEXER_CONFIRMATIONS',
    DEFAULT_CONFIRMATION_DEPTH,
  )
  private readonly safetyWindow = getPositiveBigIntEnv(
    'MARKET_INDEXER_SAFETY_WINDOW',
    DEFAULT_SAFETY_WINDOW,
  )
  private readonly pollingInterval = getPositiveNumberEnv(
    'MARKET_INDEXER_POLL_INTERVAL_MS',
    DEFAULT_POLLING_INTERVAL_MS,
  )
  private readonly prefetchRanges = getPositiveNumberEnv(
    'MARKET_INDEXER_PREFETCH_RANGES',
    DEFAULT_PREFETCH_RANGES,
  )
  private readonly marketAddressBatchSize = getPositiveNumberEnv(
    'MARKET_INDEXER_ADDRESS_BATCH_SIZE',
    DEFAULT_MARKET_ADDRESS_BATCH_SIZE,
  )
  private timer: NodeJS.Timeout | null = null
  private running = false
  private scanInProgress = false
  private scannerLockClient: PoolClient | null = null

  constructor(
    factoryAddress: `0x${string}`,
    liquidityManagerAddress?: `0x${string}`,
  ) {
    this.factoryAddress = factoryAddress
    this.liquidityManagerAddress = liquidityManagerAddress
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true

    if (postgresMarketStore.enabled) {
      for (const market of await postgresMarketStore.getRegisteredMarketAddresses(
        this.chainId,
      )) {
        this.markets.add(market as `0x${string}`)
      }
      for (const pair of await postgresMarketStore.getRegisteredDexPairs(this.chainId)) {
        this.registerDexPair(pair)
      }
    }

    try {
      await this.scanToLatest()
    } catch (error) {
      console.error('Formal market indexer initial scan failed; polling will retry:', error)
    }

    this.timer = setInterval(() => {
      void this.scanToLatest().catch((error) => {
        console.error('Formal market indexer polling failed:', error)
      })
    }, this.pollingInterval)

    console.log(
      `Formal market indexer active (factory=${this.factoryAddress}, markets=${this.markets.size}, ` +
        `postgres=${postgresMarketStore.enabled}, confirmations=${this.confirmationDepth})`,
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

  async backfill(fromBlock: bigint, toBlock: bigint): Promise<void> {
    if (fromBlock > toBlock) return
    if (postgresMarketStore.enabled) {
      for (const market of await postgresMarketStore.getRegisteredMarketAddresses(
        this.chainId,
      )) {
        this.markets.add(market as `0x${string}`)
      }
      for (const pair of await postgresMarketStore.getRegisteredDexPairs(this.chainId)) {
        this.registerDexPair(pair)
      }
    }
    for (let start = fromBlock; start <= toBlock; start += this.blockChunk) {
      const end =
        start + this.blockChunk - 1n > toBlock
          ? toBlock
          : start + this.blockChunk - 1n
      await this.persistRange(await this.fetchRange(start, end), false)
    }
  }

  private async scanToLatest(): Promise<void> {
    if (this.scanInProgress) return
    this.scanInProgress = true

    try {
      if (postgresMarketStore.enabled && !(await this.tryAcquireScannerLock())) return

      const latestBlock = await viemClient.getBlockNumber()
      await this.reconcileRecentWindow(latestBlock)
      const storedBlock = postgresMarketStore.enabled
        ? await postgresMarketStore.getLastIndexedBlock(this.chainId, this.factoryAddress)
        : await marketStore.getLastIndexedBlock(this.chainId, this.factoryAddress)
      const configuredStart = BigInt(process.env.MARKET_INDEXER_START_BLOCK ?? '0')
      let fromBlock = storedBlock === null ? configuredStart : storedBlock + 1n

      if (postgresMarketStore.enabled && storedBlock !== null && storedBlock > latestBlock) {
        console.warn(
          `Market indexer checkpoint ${storedBlock} is ahead of latest block ${latestBlock}; resetting checkpoint`,
        )
        await postgresMarketStore.resetCheckpoint({
          chainId: this.chainId,
          cursorKey: this.factoryAddress,
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
          `Market indexer start block ${fromBlock} is ahead of latest block ${latestBlock}; using latest block`,
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
        [getScannerLockKey(this.chainId, this.factoryAddress).toString()],
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
        getScannerLockKey(this.chainId, this.factoryAddress).toString(),
      ])
    } finally {
      client.release()
    }
  }

  private async reconcileRecentWindow(latestBlock: bigint): Promise<void> {
    if (!postgresMarketStore.enabled) return
    const checkpoint = await postgresMarketStore.getMarketCheckpointMetadata(
      this.chainId,
      this.factoryAddress,
    )
    if (checkpoint.lastIndexedBlock === null) return

    const checkpointBlock =
      checkpoint.lastIndexedBlock > latestBlock
        ? latestBlock
        : checkpoint.lastIndexedBlock
    const windowSize = this.confirmationDepth + this.safetyWindow
    const fromBlock =
      checkpointBlock > windowSize ? checkpointBlock - windowSize : 0n
    const toBlock = checkpointBlock
    const fetched = await this.fetchRange(fromBlock, toBlock)
    const trackedAddresses = new Set(
      [
        this.factoryAddress,
        ...this.markets,
        ...(this.liquidityManagerAddress ? [this.liquidityManagerAddress] : []),
        ...this.dexPairs.keys(),
      ].map((address) => address.toLowerCase()),
    )
    const storedLogs = (
      await postgresMarketStore.getCanonicalLogsInRange(
        this.chainId,
        null,
        fromBlock,
        toBlock,
      )
    ).filter((log) => trackedAddresses.has(log.contractAddress.toLowerCase()))
    const storedBlocksByNumber = new Map<string, { blockNumber: bigint; blockHash: string }>()
    for (const log of storedLogs) {
      storedBlocksByNumber.set(log.blockNumber.toString(), {
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
      })
    }
    const storedFacts: ReorgFacts = {
      blocks: [...storedBlocksByNumber.values()].sort((a, b) =>
        a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0,
      ),
      logs: storedLogs,
    }
    const fetchedFacts: ReorgFacts = {
      blocks: fetched.blocks.map((block) => ({
        blockNumber: block.number,
        blockHash: block.hash.toLowerCase(),
      })),
      logs: fetched.logs
        .filter((log) => this.hasIdentity(log))
        .map((log) => ({
          blockNumber: log.blockNumber!,
          blockHash: log.blockHash!.toLowerCase(),
          transactionHash: log.transactionHash!.toLowerCase(),
          transactionIndex: log.transactionIndex!,
          logIndex: log.logIndex!,
          contractAddress: log.address.toLowerCase(),
        })),
    }
    const detection = detectReorg(storedFacts, fetchedFacts)
    if (!detection) return

    console.warn('Formal market reorg detected', detection)
    const rollback = await postgresMarketStore.rollbackCanonicalFromBlock(
      this.chainId,
      this.factoryAddress,
      detection.affectedFromBlock,
    )
    for (const tokenAddress of rollback.affectedTokenAddresses) {
      await marketStore.invalidateCandleQueryCache(this.chainId, tokenAddress)
    }
  }

  private async processRangesWithRetry(ranges: BlockRange[]): Promise<void> {
    let attempt = 0
    while (this.running) {
      try {
        // Registry discovery must remain ordered so a newly-created market is visible
        // before later ranges are prefetched.
        for (const range of ranges) {
          await this.persistRange(await this.fetchRange(range.fromBlock, range.toBlock))
        }
        return
      } catch (error) {
        attempt += 1
        console.warn(`Formal market indexer range failed; retrying (attempt=${attempt})`, error)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(DEFAULT_RANGE_RETRY_DELAY_MS * attempt, 30_000)),
        )
      }
    }
  }

  private async fetchRange(fromBlock: bigint, toBlock: bigint): Promise<FetchedRange> {
    const factoryLogs = await getLogsWithProviderLimit<FormalEventLog>(
      async (rangeStart, rangeEnd) =>
        (await viemClient.getLogs({
          address: this.factoryAddress,
          event: tokenCreatedEvent,
          fromBlock: rangeStart,
          toBlock: rangeEnd,
        })) as unknown as FormalEventLog[],
      fromBlock,
      toBlock,
    )
    for (const log of factoryLogs) {
      this.markets.add(requireAddress(log.args, 'market') as `0x${string}`)
    }

    const marketAddresses = [...this.markets]
    const marketLogs =
      marketAddresses.length === 0
        ? []
        : (
            await Promise.all(
              Array.from(
                {
                  length: Math.ceil(
                    marketAddresses.length / this.marketAddressBatchSize,
                  ),
                },
                (_, index) =>
                  marketAddresses.slice(
                    index * this.marketAddressBatchSize,
                    (index + 1) * this.marketAddressBatchSize,
                  ),
              ).map((addressBatch) =>
                getLogsWithProviderLimit<FormalEventLog>(
                  async (rangeStart, rangeEnd) =>
                    (await viemClient.getLogs({
                      address: addressBatch,
                      events: [...formalTradeEvents, ...formalMarketLifecycleEvents],
                      fromBlock: rangeStart,
                      toBlock: rangeEnd,
                    })) as unknown as FormalEventLog[],
                  fromBlock,
                  toBlock,
                ),
              ),
            )
          ).flat()
    const liquidityLogs = this.liquidityManagerAddress
      ? await getLogsWithProviderLimit<FormalEventLog>(
          async (rangeStart, rangeEnd) =>
            (await viemClient.getLogs({
              address: this.liquidityManagerAddress,
              events: formalLiquidityEvents,
              fromBlock: rangeStart,
              toBlock: rangeEnd,
            })) as unknown as FormalEventLog[],
          fromBlock,
          toBlock,
        )
      : []

    for (const log of [...marketLogs, ...liquidityLogs]) {
      this.registerDexPairFromLifecycleLog(log)
    }

    const pairAddresses = [...this.dexPairs.keys()] as `0x${string}`[]
    const pairLogs =
      pairAddresses.length === 0
        ? []
        : (
            await Promise.all(
              Array.from(
                {
                  length: Math.ceil(
                    pairAddresses.length / this.marketAddressBatchSize,
                  ),
                },
                (_, index) =>
                  pairAddresses.slice(
                    index * this.marketAddressBatchSize,
                    (index + 1) * this.marketAddressBatchSize,
                  ),
              ).map((addressBatch) =>
                getLogsWithProviderLimit<FormalEventLog>(
                  async (rangeStart, rangeEnd) =>
                    (await viemClient.getLogs({
                      address: addressBatch,
                      events: uniswapV2PairEvents,
                      fromBlock: rangeStart,
                      toBlock: rangeEnd,
                    })) as unknown as FormalEventLog[],
                  fromBlock,
                  toBlock,
                ),
              ),
            )
          ).flat()

    const logs = [...factoryLogs, ...marketLogs, ...liquidityLogs, ...pairLogs]
    const fetchedBlocks = await Promise.all(
      uniqueEventBlockNumbers(logs).map((blockNumber) =>
        viemClient.getBlock({ blockNumber }),
      ),
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

  private async persistRange(
    range: FetchedRange,
    advanceCheckpoint = true,
  ): Promise<void> {
    const logsByBlock = new Map<bigint, FormalEventLog[]>()
    for (const log of range.logs) {
      if (log.blockNumber === null) throw new Error('Formal event is missing block number')
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
      const trades = await Promise.all(
        logs
          .filter(
            (log) =>
              log.eventName === 'TokenBought' ||
              log.eventName === 'TokenSold' ||
              log.eventName === 'Swap',
          )
          .map((log) => this.normalizeTrade(log, block.timestamp)),
      )
      const poolReserveUpdates = await Promise.all(
        logs
          .filter((log) => log.eventName === 'Sync')
          .map((log) => this.normalizePoolReserve(log, block.timestamp)),
      )

      if (postgresMarketStore.enabled) {
        const marketRegistrations = await Promise.all(
          logs
            .filter((log) => log.eventName === 'TokenCreated')
            .map((log) => this.normalizeRegistration(log)),
        )

        await postgresMarketStore.processBlock({
          chainId: this.chainId,
          cursorKey: this.factoryAddress,
          confirmationDepth: this.confirmationDepth,
          advanceCheckpoint: false,
          block,
          logs: logs.map((log) => this.normalizeRawLog(log)),
          trades,
          poolReserveUpdates,
          marketRegistrations,
          lifecycleUpdates: logs
            .filter(
              (log) =>
                log.eventName === 'GraduationPrepared' ||
                log.eventName === 'TokenGraduated' ||
                log.eventName === 'LiquidityAdded',
            )
            .map((log) => this.normalizeLifecycle(log, block.timestamp)),
        })
      }

      for (const trade of trades) {
        await marketStore.processTrade(this.chainId, trade).catch((error) => {
          if (!postgresMarketStore.enabled) throw error
          console.warn('Redis market projection failed:', error)
        })
        await marketStore.invalidateCandleQueryCache(this.chainId, trade.tokenAddress)
      }
    }

    if (postgresMarketStore.enabled && advanceCheckpoint) {
      await postgresMarketStore.advanceCheckpoint({
        chainId: this.chainId,
        cursorKey: this.factoryAddress,
        confirmationDepth: this.confirmationDepth,
        lastIndexedBlock: range.toBlock,
      })
    } else if (advanceCheckpoint) {
      await marketStore.setLastIndexedBlock(this.chainId, this.factoryAddress, range.toBlock)
    }
  }

  private hasIdentity(log: FormalEventLog): boolean {
    return Boolean(
      log.blockNumber !== null &&
        log.blockHash &&
        log.transactionHash &&
        log.transactionIndex !== null &&
        log.logIndex !== null,
    )
  }

  private normalizeRawLog(log: FormalEventLog): IndexedRawLog {
    if (!this.hasIdentity(log) || log.topics.length === 0) {
      throw new Error('Formal event is missing raw log identity')
    }
    return {
      blockNumber: log.blockNumber!,
      blockHash: log.blockHash!,
      transactionHash: log.transactionHash!,
      transactionIndex: log.transactionIndex!,
      logIndex: log.logIndex!,
      contractAddress: log.address,
      topic0: log.topics[0],
      topics: [...log.topics],
      data: log.data,
      eventName: log.eventName,
      decodedArgs: bigintArgsToJson(log.args),
    }
  }

  private registerDexPair(pair: RegisteredDexPair): void {
    this.dexPairs.set(pair.pairAddress.toLowerCase(), {
      tokenAddress: pair.tokenAddress.toLowerCase(),
      marketAddress: pair.marketAddress.toLowerCase(),
      pairAddress: pair.pairAddress.toLowerCase(),
    })
  }

  private registerDexPairFromLifecycleLog(log: FormalEventLog): void {
    if (log.eventName !== 'TokenGraduated' && log.eventName !== 'LiquidityAdded') {
      return
    }
    this.registerDexPair({
      tokenAddress: requireAddress(log.args, 'token'),
      marketAddress: requireAddress(log.args, 'market'),
      pairAddress: requireAddress(log.args, 'pair'),
    })
  }

  private async getDexPairInfo(pairAddress: string): Promise<DexPairInfo> {
    const normalizedPair = pairAddress.toLowerCase()
    const pair = this.dexPairs.get(normalizedPair)
    if (!pair) {
      throw new Error(`DEX pair ${normalizedPair} is not registered`)
    }
    if (pair.token0 && pair.token1) {
      return pair
    }

    const [token0, token1] = await Promise.all([
      viemClient.readContract({
        address: normalizedPair as `0x${string}`,
        abi: UNISWAP_V2_PAIR_METADATA_ABI,
        functionName: 'token0',
      }),
      viemClient.readContract({
        address: normalizedPair as `0x${string}`,
        abi: UNISWAP_V2_PAIR_METADATA_ABI,
        functionName: 'token1',
      }),
    ])
    pair.token0 = token0.toLowerCase()
    pair.token1 = token1.toLowerCase()
    return pair
  }

  private async normalizeRegistration(log: FormalEventLog): Promise<MarketRegistration> {
    if (log.blockNumber === null) throw new Error('TokenCreated is missing block number')
    const marketAddress = requireAddress(log.args, 'market')
    return {
      tokenAddress: requireAddress(log.args, 'token'),
      marketAddress,
      creatorAddress: requireAddress(log.args, 'creator'),
      configVersion: requireBigInt(log.args, 'configVersion'),
      name: requireString(log.args, 'name'),
      symbol: requireString(log.args, 'symbol'),
      tokenImage: requireString(log.args, 'tokenImage'),
      description: requireString(log.args, 'description'),
      initialPriceX18: await this.getMarketInitialPriceX18(marketAddress),
      blockNumber: log.blockNumber,
    }
  }

  private async getMarketInitialPriceX18(marketAddress: string): Promise<bigint | null> {
    try {
      const config = await viemClient.readContract({
        address: marketAddress as `0x${string}`,
        abi: TOKEN_MARKET_CURVE_CONFIG_ABI,
        functionName: 'curveConfig',
      })
      return config[0]
    } catch (error) {
      console.warn('Failed to read market initial price:', {
        marketAddress: marketAddress.toLowerCase(),
        error,
      })
      return null
    }
  }

  private normalizeLifecycle(
    log: FormalEventLog,
    timestamp: number,
  ): MarketLifecycleUpdate {
    if (log.blockNumber === null) throw new Error(`${log.eventName} is missing block number`)
    return {
      tokenAddress: requireAddress(log.args, 'token'),
      marketAddress: requireAddress(log.args, 'market'),
      stage: log.eventName === 'GraduationPrepared' ? 'graduated_pending_liquidity' : 'dex_live',
      pairAddress:
        log.eventName === 'TokenGraduated' || log.eventName === 'LiquidityAdded'
          ? requireAddress(log.args, 'pair')
          : undefined,
      blockNumber: log.blockNumber,
      timestamp,
    }
  }

  private async normalizeTrade(log: FormalEventLog, timestamp: number): Promise<IndexedTrade> {
    if (!this.hasIdentity(log)) throw new Error('Trade event is missing transaction identity')
    if (log.eventName === 'Swap') {
      const pair = await this.getDexPairInfo(log.address)
      return normalizeDexSwapTrade({
        tokenAddress: pair.tokenAddress,
        marketAddress: pair.marketAddress,
        pairAddress: pair.pairAddress,
        token0: pair.token0!,
        token1: pair.token1!,
        wethAddress: pair.token0 === pair.tokenAddress ? pair.token1! : pair.token0!,
        senderAddress: requireAddress(log.args, 'sender'),
        recipientAddress: requireAddress(log.args, 'to'),
        amount0In: requireBigInt(log.args, 'amount0In'),
        amount1In: requireBigInt(log.args, 'amount1In'),
        amount0Out: requireBigInt(log.args, 'amount0Out'),
        amount1Out: requireBigInt(log.args, 'amount1Out'),
        transactionHash: log.transactionHash!,
        transactionIndex: log.transactionIndex!,
        logIndex: log.logIndex!,
        blockNumber: log.blockNumber!,
        blockHash: log.blockHash!,
        timestamp,
      })
    }

    const buy = log.eventName === 'TokenBought'
    return normalizeFormalTrade({
      eventName: buy ? 'TokenBought' : 'TokenSold',
      tokenAddress: requireAddress(log.args, 'token'),
      marketAddress: requireAddress(log.args, 'market'),
      traderAddress: requireAddress(log.args, buy ? 'buyer' : 'seller'),
      tokenAmount: requireBigInt(log.args, buy ? 'tokenAmountOut' : 'tokenAmountIn'),
      grossEthAmount: requireBigInt(log.args, buy ? 'grossEthIn' : 'grossEthOut'),
      netEthAmount: requireBigInt(log.args, buy ? 'reserveEthIn' : 'sellerEthOut'),
      platformFee: requireBigInt(log.args, 'platformFee'),
      creatorFee: requireBigInt(log.args, 'creatorFee'),
      executionPriceX18: requireBigInt(log.args, 'executionPriceX18'),
      markPriceX18: requireBigInt(log.args, 'markPriceX18'),
      transactionHash: log.transactionHash!,
      transactionIndex: log.transactionIndex!,
      logIndex: log.logIndex!,
      blockNumber: log.blockNumber!,
      blockHash: log.blockHash!,
      timestamp,
    })
  }

  private async normalizePoolReserve(
    log: FormalEventLog,
    timestamp: number,
  ): Promise<PoolReserveUpdate> {
    if (!this.hasIdentity(log)) throw new Error('Sync event is missing transaction identity')
    const pair = await this.getDexPairInfo(log.address)
    const reserve0 = requireBigInt(log.args, 'reserve0')
    const reserve1 = requireBigInt(log.args, 'reserve1')
    const token0 = pair.token0!.toLowerCase()
    const tokenAddress = pair.tokenAddress.toLowerCase()

    const tokenReserveRaw = token0 === tokenAddress ? reserve0 : reserve1
    const quoteReserveRaw = token0 === tokenAddress ? reserve1 : reserve0

    return {
      tokenAddress: pair.tokenAddress,
      marketAddress: pair.marketAddress,
      pairAddress: pair.pairAddress,
      tokenReserveRaw,
      quoteReserveRaw,
      liquidityQuoteRaw: quoteReserveRaw * 2n,
      quoteTokenAddress: token0 === tokenAddress ? pair.token1 : pair.token0,
      blockNumber: log.blockNumber!,
      blockHash: log.blockHash!,
      transactionHash: log.transactionHash!,
      transactionIndex: log.transactionIndex!,
      logIndex: log.logIndex!,
      timestamp,
    }
  }
}

export function createMarketIndexer(
  factoryAddress: `0x${string}`,
  liquidityManagerAddress?: `0x${string}`,
): MarketIndexer {
  return new MarketIndexer(factoryAddress, liquidityManagerAddress)
}
