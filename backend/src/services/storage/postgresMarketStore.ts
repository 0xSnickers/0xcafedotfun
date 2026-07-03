import { sql } from 'drizzle-orm'
import {
  chainBlocks,
  indexerCheckpoints,
  marketTrades,
  poolReserveSnapshots,
  poolReserves,
  rawChainLogs,
  tokenMarkets,
} from '../../db/schema'
import { db, postgresEnabled } from '../../clients/postgresClient'
import {
  IndexedTrade,
  MarketHoldersResponse,
  MarketListResponse,
  MarketSummaryResponse,
  MarketTradeItem,
  MarketTradesResponse,
  PoolReserveSnapshotItem,
  PoolReserveSnapshotsResponse,
  PoolsResponse,
} from '../../types/market'
import { rebuildAffectedCandleBuckets } from '../candleProjector'

const CONSUMER_NAME = 'bonding-curve-market-indexer'
const ONE_HOUR_SECONDS = 60 * 60
const TWENTY_FOUR_HOURS_SECONDS = 24 * 60 * 60
const PRICE_CHANGE_PERCENT_SCALE = 100_000_000n
const DEFAULT_TRADES_LIMIT = 50
const MAX_TRADES_LIMIT = 100
const DEFAULT_HOLDERS_LIMIT = 10
const MAX_HOLDERS_LIMIT = 50
const MARKET_EVENT_NAMES = [
  'TokenCreated',
  'TokenBought',
  'TokenSold',
  'GraduationPrepared',
  'GraduationRegistered',
  'TokenGraduated',
  'LiquidityAdded',
  'Swap',
  'Mint',
  'Burn',
  'Sync',
] as const

export interface IndexedRawLog {
  blockNumber: bigint
  blockHash: string
  transactionHash: string
  transactionIndex: number
  logIndex: number
  contractAddress: string
  topic0: string
  topics: string[]
  data: string
  eventName: string
  decodedArgs: Record<string, string>
}

export interface IndexedBlock {
  number: bigint
  hash: string
  parentHash: string
  timestamp: number
}

export interface ProcessBlockInput {
  chainId: number
  cursorKey: string
  confirmationDepth: bigint
  block: IndexedBlock
  logs: IndexedRawLog[]
  trades: IndexedTrade[]
  marketRegistrations?: MarketRegistration[]
  lifecycleUpdates?: MarketLifecycleUpdate[]
  poolReserveUpdates?: PoolReserveUpdate[]
  advanceCheckpoint?: boolean
}

export interface MarketRegistration {
  tokenAddress: string
  marketAddress: string
  creatorAddress: string
  configVersion: bigint
  name: string
  symbol: string
  tokenImage: string
  description: string
  initialPriceX18?: bigint | null
  blockNumber: bigint
}

export interface MarketLifecycleUpdate {
  tokenAddress: string
  marketAddress: string
  stage: 'graduated_pending_liquidity' | 'dex_live'
  pairAddress?: string
  blockNumber: bigint
  timestamp: number
}

export interface PoolReserveUpdate {
  tokenAddress: string
  marketAddress: string
  pairAddress: string
  tokenReserveRaw: bigint
  quoteReserveRaw: bigint
  liquidityQuoteRaw: bigint
  quoteTokenAddress?: string | null
  blockNumber: bigint
  blockHash: string
  transactionHash: string
  transactionIndex: number
  logIndex: number
  timestamp: number
}

export interface AdvanceCheckpointInput {
  chainId: number
  cursorKey: string
  confirmationDepth: bigint
  lastIndexedBlock: bigint
}

export interface ResetCheckpointInput {
  chainId: number
  cursorKey: string
  lastIndexedBlock: bigint
  lastFinalizedBlock: bigint
}

export interface MarketCheckpointMetadata {
  lastIndexedBlock: bigint | null
  lastFinalizedBlock: bigint | null
}

export interface StoredCanonicalBlock {
  blockNumber: bigint
  blockHash: string
}

export interface StoredCanonicalLog {
  blockNumber: bigint
  blockHash: string
  transactionHash: string
  transactionIndex: number
  logIndex: number
  contractAddress: string
}

export interface RollbackCanonicalResult {
  affectedTokenAddresses: string[]
  resetToBlock: bigint
}

export interface RegisteredDexPair {
  tokenAddress: string
  marketAddress: string
  pairAddress: string
}

function normalizeAddress(value: string): string {
  return value.toLowerCase()
}

function getFinalizedBlock(
  lastIndexedBlock: bigint,
  confirmationDepth: bigint,
): bigint {
  return lastIndexedBlock > confirmationDepth
    ? lastIndexedBlock - confirmationDepth
    : 0n
}

function clampTradesLimit(limit: number | null | undefined): number {
  if (!Number.isInteger(limit) || (limit ?? 0) <= 0) {
    return DEFAULT_TRADES_LIMIT
  }
  return Math.min(limit!, MAX_TRADES_LIMIT)
}

function clampHoldersLimit(limit: number | null | undefined): number {
  if (!Number.isInteger(limit) || (limit ?? 0) <= 0) {
    return DEFAULT_HOLDERS_LIMIT
  }
  return Math.min(limit!, MAX_HOLDERS_LIMIT)
}

function encodeTradesCursor(timestamp: number, id: string): string {
  return Buffer.from(`${timestamp}:${id}`, 'utf8').toString('base64url')
}

function decodeTradesCursor(
  cursor: string | null | undefined,
): { timestamp: number; id: string } | null {
  if (!cursor) {
    return null
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
    const separator = decoded.indexOf(':')
    if (separator <= 0) {
      return null
    }

    const timestamp = Number(decoded.slice(0, separator))
    const id = decoded.slice(separator + 1)
    if (!Number.isInteger(timestamp) || timestamp < 0 || id.length === 0) {
      return null
    }

    return { timestamp, id }
  } catch {
    return null
  }
}

function isOfficialTokenAddress(value: string): boolean {
  return normalizeAddress(value).startsWith('0xcafe')
}

function officialTokenPredicate(
  tokenAddressSql: ReturnType<typeof sql>,
  isOfficialSql?: ReturnType<typeof sql>,
) {
  return isOfficialSql
    ? sql`coalesce(${isOfficialSql}, lower(${tokenAddressSql}) like '0xcafe%') = true`
    : sql`lower(${tokenAddressSql}) like '0xcafe%'`
}

function toUnixSeconds(value: Date | string | null): number | null {
  if (!value) {
    return null
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const timestamp = Number(value)
    return Number.isInteger(timestamp) && timestamp >= 0 ? timestamp : null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000)
}

async function markConfirmedTrades(
  executor: { execute(query: ReturnType<typeof sql>): Promise<unknown> },
  chainId: number,
  finalizedBlock: bigint,
): Promise<void> {
  await executor.execute(sql`
    update market_trades
    set confirmed = true
    where chain_id = ${chainId}
      and canonical = true
      and confirmed = false
      and block_number <= ${finalizedBlock.toString()}
  `)
}

async function upsertCheckpoint(
  executor: { execute(query: ReturnType<typeof sql>): Promise<unknown> },
  input: ResetCheckpointInput,
): Promise<void> {
  await executor.execute(sql`
    insert into indexer_checkpoints (
      consumer_name,
      chain_id,
      cursor_key,
      last_indexed_block,
      last_finalized_block,
      updated_at
    )
    values (
      ${CONSUMER_NAME},
      ${input.chainId},
      ${normalizeAddress(input.cursorKey)},
      ${input.lastIndexedBlock.toString()},
      ${input.lastFinalizedBlock.toString()},
      now()
    )
    on conflict (consumer_name, chain_id, cursor_key) do update set
      last_indexed_block = excluded.last_indexed_block,
      last_finalized_block = excluded.last_finalized_block,
      updated_at = now()
  `)
}

export class PostgresMarketStore {
  get enabled(): boolean {
    return postgresEnabled
  }

  async getMarketCheckpointMetadata(
    chainId: number,
    cursorKey: string,
  ): Promise<MarketCheckpointMetadata> {
    if (!db) {
      return {
        lastIndexedBlock: null,
        lastFinalizedBlock: null,
      }
    }

    const [checkpoint] = await db
      .select({
        lastIndexedBlock: indexerCheckpoints.lastIndexedBlock,
        lastFinalizedBlock: indexerCheckpoints.lastFinalizedBlock,
      })
      .from(indexerCheckpoints)
      .where(
        sql`${indexerCheckpoints.consumerName} = ${CONSUMER_NAME}
          and ${indexerCheckpoints.chainId} = ${chainId}
          and ${indexerCheckpoints.cursorKey} = ${normalizeAddress(cursorKey)}`,
      )
      .limit(1)

    if (!checkpoint) {
      return {
        lastIndexedBlock: null,
        lastFinalizedBlock: null,
      }
    }

    return {
      lastIndexedBlock: BigInt(checkpoint.lastIndexedBlock),
      lastFinalizedBlock: BigInt(checkpoint.lastFinalizedBlock),
    }
  }

  async getMarketCheckpointMetadataByTokenAddress(
    chainId: number,
    tokenAddress: string,
  ): Promise<MarketCheckpointMetadata> {
    if (!db) {
      return {
        lastIndexedBlock: null,
        lastFinalizedBlock: null,
      }
    }

    const [market] = await db
      .select({
        marketAddress: tokenMarkets.marketAddress,
        factoryAddress: tokenMarkets.factoryAddress,
      })
      .from(tokenMarkets)
      .where(
        sql`${tokenMarkets.chainId} = ${chainId}
          and ${tokenMarkets.tokenAddress} = ${normalizeAddress(tokenAddress)}`,
      )
      .limit(1)

    if (!market) {
      return {
        lastIndexedBlock: null,
        lastFinalizedBlock: null,
      }
    }

    return this.getMarketCheckpointMetadata(
      chainId,
      market.factoryAddress ?? market.marketAddress,
    )
  }

  async getLastIndexedBlock(
    chainId: number,
    cursorKey: string,
  ): Promise<bigint | null> {
    const metadata = await this.getMarketCheckpointMetadata(chainId, cursorKey)
    return metadata.lastIndexedBlock
  }

  async getCanonicalBlocksInRange(
    chainId: number,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<StoredCanonicalBlock[]> {
    if (!db) {
      return []
    }

    const marketEventNames = sql.join(MARKET_EVENT_NAMES.map((name) => sql`${name}`), sql`, `)
    const result = await db.execute(sql`
      select distinct block_number::text as block_number, block_hash
      from raw_chain_logs
      where chain_id = ${chainId}
        and canonical = true
        and event_name in (${marketEventNames})
        and block_number >= ${fromBlock.toString()}::numeric
        and block_number <= ${toBlock.toString()}::numeric
      order by block_number asc
    `)

    return result.rows.map((row) => ({
      blockNumber: BigInt(row.block_number as string),
      blockHash: row.block_hash as string,
    }))
  }

  async getCanonicalLogsInRange(
    chainId: number,
    contractAddress: string | null,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<StoredCanonicalLog[]> {
    if (!db) {
      return []
    }

    const marketEventNames = sql.join(MARKET_EVENT_NAMES.map((name) => sql`${name}`), sql`, `)
    const result = await db.execute(sql`
      select
        block_number::text as block_number,
        block_hash,
        transaction_hash,
        transaction_index,
        log_index,
        contract_address
      from raw_chain_logs
      where chain_id = ${chainId}
        ${contractAddress
          ? sql`and contract_address = ${normalizeAddress(contractAddress)}`
          : sql``}
        and canonical = true
        and event_name in (${marketEventNames})
        and block_number >= ${fromBlock.toString()}::numeric
        and block_number <= ${toBlock.toString()}::numeric
      order by block_number asc, transaction_index asc, log_index asc
    `)

    return result.rows.map((row) => ({
      blockNumber: BigInt(row.block_number as string),
      blockHash: row.block_hash as string,
      transactionHash: row.transaction_hash as string,
      transactionIndex: row.transaction_index as number,
      logIndex: row.log_index as number,
      contractAddress: row.contract_address as string,
    }))
  }

  async getRegisteredMarketAddresses(chainId: number): Promise<string[]> {
    if (!db) {
      return []
    }

    const rows = await db
      .select({ marketAddress: tokenMarkets.marketAddress })
      .from(tokenMarkets)
      .where(sql`${tokenMarkets.chainId} = ${chainId}`)

    return rows.map((row) => normalizeAddress(row.marketAddress))
  }

  async getRegisteredDexPairs(chainId: number): Promise<RegisteredDexPair[]> {
    if (!db) {
      return []
    }

    const rows = await db
      .select({
        tokenAddress: tokenMarkets.tokenAddress,
        marketAddress: tokenMarkets.marketAddress,
        pairAddress: tokenMarkets.pairAddress,
      })
      .from(tokenMarkets)
      .where(
        sql`${tokenMarkets.chainId} = ${chainId}
          and ${tokenMarkets.pairAddress} is not null`,
      )

    return rows
      .filter((row) => row.pairAddress !== null)
      .map((row) => ({
        tokenAddress: normalizeAddress(row.tokenAddress),
        marketAddress: normalizeAddress(row.marketAddress),
        pairAddress: normalizeAddress(row.pairAddress!),
      }))
  }

  async getMarketConfigByTokenAddress(
    chainId: number,
    tokenAddress: string,
  ): Promise<Record<string, string | null> | null> {
    if (!db) {
      throw new Error('PostgreSQL market store is not configured')
    }

    const normalizedTokenAddress = normalizeAddress(tokenAddress)
    const [market] = await db
      .select()
      .from(tokenMarkets)
      .where(
        sql`${tokenMarkets.chainId} = ${chainId}
          and ${tokenMarkets.tokenAddress} = ${normalizedTokenAddress}
          and ${officialTokenPredicate(sql`${tokenMarkets.tokenAddress}`, sql`${tokenMarkets.isOfficial}`)}`,
      )
      .limit(1)

    if (!market) {
      return null
    }

    return {
      tokenAddress: market.tokenAddress,
      marketAddress: market.marketAddress,
      factoryAddress: market.factoryAddress,
      creatorAddress: market.creatorAddress,
      configVersion: market.configVersion,
      name: market.name,
      symbol: market.symbol,
      tokenImage: market.tokenImage,
      description: market.description,
      initialPriceX18: market.initialPriceX18,
      stage: market.stage,
      pairAddress: market.pairAddress,
      platformFeeBps: '100',
      creatorFeeBps: '25',
      createFee: '0',
      createdBlockNumber: market.createdBlockNumber,
      graduatedBlockNumber: market.graduatedBlockNumber,
      dexLiveBlockNumber: market.dexLiveBlockNumber,
    }
  }

  async getRecentTradesByTokenAddress(
    chainId: number,
    tokenAddress: string,
    limit?: number | null,
    cursor?: string | null,
  ): Promise<MarketTradesResponse> {
    if (!db) {
      throw new Error('PostgreSQL market store is not configured')
    }

    const normalizedTokenAddress = normalizeAddress(tokenAddress)
    const parsedCursor = decodeTradesCursor(cursor)
    const pageLimit = clampTradesLimit(limit)
    const result = await db.execute(sql`
      select
        id::text as id,
        side,
        source,
        market_address,
        trader_address,
        execution_price_quote_per_token_x18::text as execution_price,
        mark_price_quote_per_token_x18::text as mark_price,
        token_amount_raw::text as token_amount,
        coalesce(quote_amount_gross_raw, quote_amount_net_raw)::text as quote_amount,
        quote_amount_gross_raw::text as quote_amount_gross,
        quote_amount_net_raw::text as quote_amount_net,
        creator_fee_raw::text as creator_fee,
        platform_fee_raw::text as platform_fee,
        transaction_hash,
        extract(epoch from block_timestamp)::bigint::text as timestamp,
        confirmed,
        legacy_volume_semantics
      from market_trades
      where chain_id = ${chainId}
        and token_address = ${normalizedTokenAddress}
        and canonical = true
        and exists (
          select 1
          from token_markets
          where chain_id = ${chainId}
            and token_address = ${normalizedTokenAddress}
            and ${officialTokenPredicate(sql`${tokenMarkets.tokenAddress}`, sql`${tokenMarkets.isOfficial}`)}
        )
        ${parsedCursor
          ? sql`and (
              extract(epoch from block_timestamp)::bigint < ${parsedCursor.timestamp}
              or (
                extract(epoch from block_timestamp)::bigint = ${parsedCursor.timestamp}
                and id::bigint < ${parsedCursor.id}::bigint
              )
            )`
          : sql``}
      order by block_timestamp desc, id desc
      limit ${pageLimit + 1}
    `)

    const rows = result.rows.slice(0, pageLimit)
    const trades: MarketTradeItem[] = rows.map((row) => ({
      id: row.id as string,
      side: row.side as 'buy' | 'sell',
      source: row.source as 'bonding_curve' | 'uniswap_v2',
      marketAddress: (row.market_address as string | null) ?? null,
      trader: (row.trader_address as string | null) ?? null,
      executionPrice: (row.execution_price as string | null) ?? null,
      markPrice: row.mark_price as string,
      tokenAmount: row.token_amount as string,
      quoteAmount: (row.quote_amount as string | null) ?? null,
      quoteAmountGross: (row.quote_amount_gross as string | null) ?? null,
      quoteAmountNet: (row.quote_amount_net as string | null) ?? null,
      creatorFee: (row.creator_fee as string | null) ?? null,
      platformFee: (row.platform_fee as string | null) ?? null,
      transactionHash: row.transaction_hash as string,
      timestamp: Number(row.timestamp as string),
      confirmed: row.confirmed as boolean,
      legacyVolumeSemantics: row.legacy_volume_semantics as boolean,
    }))

    const next = result.rows.length > pageLimit ? result.rows[pageLimit - 1] : null

    return {
      trades,
      nextCursor: next
        ? encodeTradesCursor(Number((next.timestamp as string)), next.id as string)
        : null,
    }
  }

  async getTopHoldersByTokenAddress(
    chainId: number,
    tokenAddress: string,
    limit?: number | null,
  ): Promise<MarketHoldersResponse> {
    if (!db) {
      throw new Error('PostgreSQL market store is not configured')
    }

    const normalizedTokenAddress = normalizeAddress(tokenAddress)
    const pageLimit = clampHoldersLimit(limit)
    const result = await db.execute(sql`
      with holder_positions as (
        select
          trader_address,
          sum(
            case
              when side = 'buy' then token_amount_raw
              else -token_amount_raw
            end
          ) as balance_raw,
          min(block_timestamp) filter (where side = 'buy') as first_buy_at,
          max(block_timestamp) as last_trade_at,
          count(*) filter (where side = 'buy')::integer as buy_count,
          count(*) filter (where side = 'sell')::integer as sell_count,
          coalesce(sum(token_amount_raw) filter (where side = 'buy'), 0)::numeric(78, 0) as total_bought,
          coalesce(sum(token_amount_raw) filter (where side = 'sell'), 0)::numeric(78, 0) as total_sold
        from market_trades
        where chain_id = ${chainId}
          and token_address = ${normalizedTokenAddress}
          and canonical = true
          and trader_address is not null
          and exists (
            select 1
            from token_markets
            where chain_id = ${chainId}
              and token_address = ${normalizedTokenAddress}
              and ${officialTokenPredicate(sql`${tokenMarkets.tokenAddress}`, sql`${tokenMarkets.isOfficial}`)}
          )
        group by trader_address
      )
      select
        trader_address,
        balance_raw::text as balance,
        extract(epoch from first_buy_at)::bigint::text as first_buy_at,
        extract(epoch from last_trade_at)::bigint::text as last_trade_at,
        buy_count,
        sell_count,
        total_bought::text as total_bought,
        total_sold::text as total_sold
      from holder_positions
      where balance_raw > 0
      order by balance_raw desc, last_trade_at asc
      limit ${pageLimit}
    `)

    return {
      holders: result.rows.map((row) => ({
        address: row.trader_address as string,
        balance: row.balance as string,
        firstBuyAt: row.first_buy_at === null ? null : Number(row.first_buy_at as string),
        lastTradeAt: Number(row.last_trade_at as string),
        buyCount: row.buy_count as number,
        sellCount: row.sell_count as number,
        totalBought: row.total_bought as string,
        totalSold: row.total_sold as string,
      })),
    }
  }

  async getMarketSummaryByTokenAddress(
    chainId: number,
    tokenAddress: string,
    now = Math.floor(Date.now() / 1000),
  ): Promise<MarketSummaryResponse> {
    if (!db) {
      throw new Error('PostgreSQL market store is not configured')
    }

    const normalizedTokenAddress = normalizeAddress(tokenAddress)
    const oneHourStart = now - ONE_HOUR_SECONDS
    const twentyFourHourStart = now - TWENTY_FOUR_HOURS_SECONDS

    const result = await db.execute(sql`
      with market as (
        select stage, pair_address, initial_price_x18::text as initial_price
        from token_markets
        where chain_id = ${chainId}
          and token_address = ${normalizedTokenAddress}
          and ${officialTokenPredicate(sql`${tokenMarkets.tokenAddress}`, sql`${tokenMarkets.isOfficial}`)}
        limit 1
      ),
      latest_trade as (
        select
          mark_price_quote_per_token_x18::text as latest_price,
          extract(epoch from block_timestamp)::bigint::text as last_trade_at
        from market_trades
        where chain_id = ${chainId}
          and token_address = ${normalizedTokenAddress}
          and canonical = true
        order by block_timestamp desc, id desc
        limit 1
      ),
      reference_1h_before as (
        select mark_price_quote_per_token_x18::text as price
        from market_trades
        where chain_id = ${chainId}
          and token_address = ${normalizedTokenAddress}
          and canonical = true
          and extract(epoch from block_timestamp)::bigint <= ${oneHourStart}
        order by block_timestamp desc, id desc
        limit 1
      ),
      reference_1h_window_first as (
        select mark_price_quote_per_token_x18::text as price
        from market_trades
        where chain_id = ${chainId}
          and token_address = ${normalizedTokenAddress}
          and canonical = true
          and extract(epoch from block_timestamp)::bigint >= ${oneHourStart}
        order by block_timestamp asc, id asc
        limit 1
      ),
      reference_24h_before as (
        select mark_price_quote_per_token_x18::text as price
        from market_trades
        where chain_id = ${chainId}
          and token_address = ${normalizedTokenAddress}
          and canonical = true
          and extract(epoch from block_timestamp)::bigint <= ${twentyFourHourStart}
        order by block_timestamp desc, id desc
        limit 1
      ),
      reference_24h_window_first as (
        select mark_price_quote_per_token_x18::text as price
        from market_trades
        where chain_id = ${chainId}
          and token_address = ${normalizedTokenAddress}
          and canonical = true
          and extract(epoch from block_timestamp)::bigint >= ${twentyFourHourStart}
        order by block_timestamp asc, id asc
        limit 1
      ),
      stats_24h as (
        select
          max(mark_price_quote_per_token_x18)::text as high_24h,
          min(mark_price_quote_per_token_x18)::text as low_24h,
          coalesce(sum(coalesce(quote_amount_gross_raw, 0)), 0)::text as volume_24h,
          bool_and(quote_amount_gross_raw is not null) as volume_24h_complete,
          count(*)::integer as trade_count_24h
        from market_trades
        where chain_id = ${chainId}
          and token_address = ${normalizedTokenAddress}
          and canonical = true
          and extract(epoch from block_timestamp)::bigint >= ${twentyFourHourStart}
      )
      select
        case
          when market.stage = 'bonding_curve_live' and market.pair_address is not null
          then 'dex_live'
          else market.stage::text
        end as stage,
        market.pair_address,
        reserves.liquidity_quote_raw::text as liquidity_quote,
        latest_trade.latest_price,
        latest_trade.last_trade_at,
        coalesce(reference_1h_before.price, market.initial_price, reference_1h_window_first.price) as reference_price_1h,
        coalesce(reference_24h_before.price, market.initial_price, reference_24h_window_first.price) as reference_price_24h,
        stats_24h.high_24h,
        stats_24h.low_24h,
        stats_24h.volume_24h,
        coalesce(stats_24h.volume_24h_complete, true) as volume_24h_complete,
        coalesce(stats_24h.trade_count_24h, 0) as trade_count_24h
      from (select 1 as singleton) seed
      left join market on true
      left join latest_trade on true
      left join reference_1h_before on true
      left join reference_1h_window_first on true
      left join reference_24h_before on true
      left join reference_24h_window_first on true
      left join stats_24h on true
      left join pool_reserves reserves
        on reserves.chain_id = ${chainId}
       and reserves.pair_address = market.pair_address
    `)

    const row = result.rows[0] ?? null
    const latestPrice = (row?.latest_price as string | null) ?? null
    const referencePrice1h = (row?.reference_price_1h as string | null) ?? null
    const referencePrice24h = (row?.reference_price_24h as string | null) ?? null

    const priceChange1h =
      latestPrice !== null && referencePrice1h !== null
        ? (BigInt(latestPrice) - BigInt(referencePrice1h)).toString()
        : null
    const priceChange24h =
      latestPrice !== null && referencePrice24h !== null
        ? (BigInt(latestPrice) - BigInt(referencePrice24h)).toString()
        : null

    const formatPercent = (
      latest: string | null,
      reference: string | null,
    ): string | null => {
      if (latest === null || reference === null) {
        return null
      }
      const denominator = BigInt(reference)
      if (denominator === 0n) {
        return null
      }
      return (
        ((BigInt(latest) - denominator) * PRICE_CHANGE_PERCENT_SCALE) /
        denominator
      ).toString()
    }

    return {
      latestPrice,
      priceChange1h,
      priceChange24h,
      priceChangePercent1h: formatPercent(latestPrice, referencePrice1h),
      priceChangePercent24h: formatPercent(latestPrice, referencePrice24h),
      high24h: (row?.high_24h as string | null) ?? null,
      low24h: (row?.low_24h as string | null) ?? null,
      volume24h: (row?.volume_24h as string | null) ?? '0',
      volume24hComplete: (row?.volume_24h_complete as boolean | null) ?? true,
      tradeCount24h: Number((row?.trade_count_24h as number | string | null) ?? 0),
      marketStage:
        (row?.stage as
          | 'bonding_curve_live'
          | 'graduated_pending_liquidity'
          | 'dex_live'
          | null) ?? null,
      pairAddress: (row?.pair_address as string | null) ?? null,
      liquidityQuote: (row?.liquidity_quote as string | null) ?? null,
      lastTradeAt: toUnixSeconds((row?.last_trade_at as string | Date | null) ?? null),
    }
  }

  async getMarketList(
    chainId: number,
    now = Math.floor(Date.now() / 1000),
    limit = 100,
  ): Promise<MarketListResponse> {
    if (!db) {
      throw new Error('PostgreSQL market store is not configured')
    }

    const twentyFourHourStart = now - TWENTY_FOUR_HOURS_SECONDS
    const pageLimit = Math.min(Math.max(Number.isInteger(limit) ? limit : 100, 1), 200)
    const result = await db.execute(sql`
      select
        market.token_address,
        market.bonding_curve_address as market_address,
        market.creator_address,
        market.name,
        market.symbol,
        market.token_image,
        market.description,
        market.stage,
        market.pair_address,
        market.initial_price_x18::text as initial_price,
        latest_trade.latest_price,
        latest_trade.last_trade_at,
        coalesce(reference_24h_before.price, market.initial_price_x18::text, reference_24h_window_first.price) as reference_price_24h,
        stats_24h.volume_24h,
        stats_24h.volume_24h_complete,
        stats_24h.trade_count_24h,
        supply.current_supply,
        extract(epoch from market.created_at)::bigint::text as created_at
      from token_markets market
      left join lateral (
        select
          mark_price_quote_per_token_x18::text as latest_price,
          extract(epoch from block_timestamp)::bigint::text as last_trade_at
        from market_trades
        where chain_id = market.chain_id
          and token_address = market.token_address
          and canonical = true
        order by block_timestamp desc, id desc
        limit 1
      ) latest_trade on true
      left join lateral (
        select mark_price_quote_per_token_x18::text as price
        from market_trades
        where chain_id = market.chain_id
          and token_address = market.token_address
          and canonical = true
          and extract(epoch from block_timestamp)::bigint <= ${twentyFourHourStart}
        order by block_timestamp desc, id desc
        limit 1
      ) reference_24h_before on true
      left join lateral (
        select mark_price_quote_per_token_x18::text as price
        from market_trades
        where chain_id = market.chain_id
          and token_address = market.token_address
          and canonical = true
          and extract(epoch from block_timestamp)::bigint >= ${twentyFourHourStart}
        order by block_timestamp asc, id asc
        limit 1
      ) reference_24h_window_first on true
      left join lateral (
        select
          coalesce(sum(coalesce(quote_amount_gross_raw, 0)), 0)::text as volume_24h,
          coalesce(bool_and(quote_amount_gross_raw is not null), true) as volume_24h_complete,
          count(*)::integer as trade_count_24h
        from market_trades
        where chain_id = market.chain_id
          and token_address = market.token_address
          and canonical = true
          and extract(epoch from block_timestamp)::bigint >= ${twentyFourHourStart}
      ) stats_24h on true
      left join lateral (
        select greatest(
          coalesce(sum(
            case
              when reserve_delta_direction = 'increase' then token_amount_raw
              when reserve_delta_direction = 'decrease' then -token_amount_raw
              else 0
            end
          ), 0),
          0
        )::text as current_supply
        from market_trades
        where chain_id = market.chain_id
          and token_address = market.token_address
          and canonical = true
      ) supply on true
      where market.chain_id = ${chainId}
        and ${officialTokenPredicate(sql`market.token_address`, sql`market.is_official`)}
      order by coalesce(market.created_block_number, 0) desc, market.created_at desc
      limit ${pageLimit}
    `)

    const formatPercent = (
      latest: string | null,
      reference: string | null,
    ): string | null => {
      if (latest === null || reference === null) {
        return null
      }
      const denominator = BigInt(reference)
      if (denominator === 0n) {
        return null
      }
      return (
        ((BigInt(latest) - denominator) * PRICE_CHANGE_PERCENT_SCALE) /
        denominator
      ).toString()
    }

    return {
      markets: result.rows.map((row) => {
        const latestPrice = (row.latest_price as string | null) ?? null
        const initialPrice = (row.initial_price as string | null) ?? null
        const currentPrice = latestPrice ?? initialPrice ?? '0'
        const currentSupply = (row.current_supply as string | null) ?? '0'
        const referencePrice24h = (row.reference_price_24h as string | null) ?? null
        return {
          tokenAddress: row.token_address as string,
          marketAddress: row.market_address as string,
          creatorAddress: (row.creator_address as string | null) ?? null,
          name: (row.name as string | null) ?? null,
          symbol: (row.symbol as string | null) ?? null,
          tokenImage: (row.token_image as string | null) ?? null,
          description: (row.description as string | null) ?? null,
          stage: row.stage as 'bonding_curve_live' | 'graduated_pending_liquidity' | 'dex_live',
          pairAddress: (row.pair_address as string | null) ?? null,
          currentPrice,
          currentMarketCap: (
            (BigInt(currentPrice) * BigInt(currentSupply)) /
            1_000_000_000_000_000_000n
          ).toString(),
          priceChangePercent24h: formatPercent(latestPrice, referencePrice24h),
          volume24h: (row.volume_24h as string | null) ?? '0',
          volume24hComplete: (row.volume_24h_complete as boolean | null) ?? true,
          tradeCount24h: Number((row.trade_count_24h as number | string | null) ?? 0),
          createdAt: toUnixSeconds((row.created_at as string | Date | null) ?? null),
          lastTradeAt: toUnixSeconds((row.last_trade_at as string | Date | null) ?? null),
        }
      }),
    }
  }

  async getPools(
    chainId: number,
    now = Math.floor(Date.now() / 1000),
    limit = 100,
  ): Promise<PoolsResponse> {
    if (!db) {
      throw new Error('PostgreSQL market store is not configured')
    }

    const twentyFourHourStart = now - TWENTY_FOUR_HOURS_SECONDS
    const pageLimit = Math.min(Math.max(Number.isInteger(limit) ? limit : 100, 1), 200)
    const result = await db.execute(sql`
      select
        market.token_address,
        market.bonding_curve_address as market_address,
        market.name,
        market.symbol,
        market.token_image,
        market.description,
        market.stage,
        market.pair_address,
        market.quote_token_address,
        market.initial_price_x18::text as initial_price,
        reserves.token_reserve_raw::text as token_reserve,
        reserves.quote_reserve_raw::text as quote_reserve,
        reserves.liquidity_quote_raw::text as liquidity_quote,
        extract(epoch from reserves.block_timestamp)::bigint::text as reserves_updated_at,
        latest_trade.latest_price,
        latest_trade.last_trade_at,
        coalesce(reference_24h_before.price, market.initial_price_x18::text, reference_24h_window_first.price) as reference_price_24h,
        stats_24h.volume_24h,
        stats_24h.volume_24h_complete,
        stats_24h.trade_count_24h,
        extract(epoch from market.graduated_at)::bigint::text as graduated_at,
        extract(epoch from market.dex_live_at)::bigint::text as dex_live_at
      from token_markets market
      left join pool_reserves reserves
        on reserves.chain_id = market.chain_id
       and reserves.pair_address = market.pair_address
      left join lateral (
        select
          mark_price_quote_per_token_x18::text as latest_price,
          extract(epoch from block_timestamp)::bigint::text as last_trade_at
        from market_trades
        where chain_id = market.chain_id
          and token_address = market.token_address
          and canonical = true
        order by block_timestamp desc, id desc
        limit 1
      ) latest_trade on true
      left join lateral (
        select mark_price_quote_per_token_x18::text as price
        from market_trades
        where chain_id = market.chain_id
          and token_address = market.token_address
          and canonical = true
          and extract(epoch from block_timestamp)::bigint <= ${twentyFourHourStart}
        order by block_timestamp desc, id desc
        limit 1
      ) reference_24h_before on true
      left join lateral (
        select mark_price_quote_per_token_x18::text as price
        from market_trades
        where chain_id = market.chain_id
          and token_address = market.token_address
          and canonical = true
          and extract(epoch from block_timestamp)::bigint >= ${twentyFourHourStart}
        order by block_timestamp asc, id asc
        limit 1
      ) reference_24h_window_first on true
      left join lateral (
        select
          coalesce(sum(coalesce(quote_amount_gross_raw, 0)), 0)::text as volume_24h,
          coalesce(bool_and(quote_amount_gross_raw is not null), true) as volume_24h_complete,
          count(*)::integer as trade_count_24h
        from market_trades
        where chain_id = market.chain_id
          and token_address = market.token_address
          and canonical = true
          and extract(epoch from block_timestamp)::bigint >= ${twentyFourHourStart}
      ) stats_24h on true
      where market.chain_id = ${chainId}
        and ${officialTokenPredicate(sql`market.token_address`, sql`market.is_official`)}
        and (
          market.stage in ('graduated_pending_liquidity', 'dex_live')
          or market.pair_address is not null
        )
      order by
        case when market.stage = 'dex_live' then 0 else 1 end,
        coalesce(market.dex_live_at, market.graduated_at, market.created_at) desc,
        market.token_address asc
      limit ${pageLimit}
    `)

    const formatPercent = (
      latest: string | null,
      reference: string | null,
    ): string | null => {
      if (latest === null || reference === null) {
        return null
      }
      const denominator = BigInt(reference)
      if (denominator === 0n) {
        return null
      }
      return (
        ((BigInt(latest) - denominator) * PRICE_CHANGE_PERCENT_SCALE) /
        denominator
      ).toString()
    }

    return {
      pools: result.rows.map((row) => {
        const latestPrice = (row.latest_price as string | null) ?? null
        const referencePrice24h = (row.reference_price_24h as string | null) ?? null
        return {
          tokenAddress: row.token_address as string,
          marketAddress: row.market_address as string,
          name: (row.name as string | null) ?? null,
          symbol: (row.symbol as string | null) ?? null,
          tokenImage: (row.token_image as string | null) ?? null,
          description: (row.description as string | null) ?? null,
          stage: row.stage as 'graduated_pending_liquidity' | 'dex_live',
          pairAddress: (row.pair_address as string | null) ?? null,
          quoteTokenAddress: (row.quote_token_address as string | null) ?? null,
          latestPrice,
          tokenReserve: (row.token_reserve as string | null) ?? null,
          quoteReserve: (row.quote_reserve as string | null) ?? null,
          liquidityQuote: (row.liquidity_quote as string | null) ?? null,
          priceChangePercent24h: formatPercent(latestPrice, referencePrice24h),
          volume24h: (row.volume_24h as string | null) ?? '0',
          volume24hComplete: (row.volume_24h_complete as boolean | null) ?? true,
          tradeCount24h: Number((row.trade_count_24h as string | number | null) ?? 0),
          graduatedAt: toUnixSeconds((row.graduated_at as string | Date | null) ?? null),
          dexLiveAt: toUnixSeconds((row.dex_live_at as string | Date | null) ?? null),
          reservesUpdatedAt: toUnixSeconds((row.reserves_updated_at as string | Date | null) ?? null),
          lastTradeAt: toUnixSeconds((row.last_trade_at as string | Date | null) ?? null),
        }
      }),
    }
  }

  async getPoolReserveSnapshots(
    chainId: number,
    tokenAddress: string,
    from: number,
    to: number,
    limit = 500,
  ): Promise<PoolReserveSnapshotsResponse> {
    if (!db) {
      throw new Error('PostgreSQL market store is not configured')
    }

    const normalizedTokenAddress = normalizeAddress(tokenAddress)
    const pageLimit = Math.min(Math.max(Number.isInteger(limit) ? limit : 500, 1), 2_000)
    const result = await db.execute(sql`
      select
        token_address,
        market_address,
        pair_address,
        quote_token_address,
        token_reserve_raw::text as token_reserve,
        quote_reserve_raw::text as quote_reserve,
        liquidity_quote_raw::text as liquidity_quote,
        block_number::text as block_number,
        transaction_hash,
        extract(epoch from block_timestamp)::bigint::text as timestamp
      from pool_reserve_snapshots
      where chain_id = ${chainId}
        and token_address = ${normalizedTokenAddress}
        and canonical = true
        and extract(epoch from block_timestamp)::bigint >= ${from}
        and extract(epoch from block_timestamp)::bigint <= ${to}
      order by block_timestamp asc, transaction_index asc, log_index asc
      limit ${pageLimit}
    `)

    return {
      snapshots: result.rows.map((row): PoolReserveSnapshotItem => ({
        tokenAddress: row.token_address as string,
        marketAddress: row.market_address as string,
        pairAddress: row.pair_address as string,
        quoteTokenAddress: (row.quote_token_address as string | null) ?? null,
        tokenReserve: row.token_reserve as string,
        quoteReserve: row.quote_reserve as string,
        liquidityQuote: row.liquidity_quote as string,
        blockNumber: row.block_number as string,
        transactionHash: row.transaction_hash as string,
        timestamp: Number(row.timestamp as string),
      })),
    }
  }

  async processBlock(input: ProcessBlockInput): Promise<void> {
    if (!db) {
      throw new Error('PostgreSQL market store is not configured')
    }

    const finalizedBlock = getFinalizedBlock(
      input.block.number,
      input.confirmationDepth,
    )

    await db.transaction(async (tx) => {
      await tx
        .insert(chainBlocks)
        .values({
          chainId: input.chainId,
          blockNumber: input.block.number.toString(),
          blockHash: input.block.hash.toLowerCase(),
          parentHash: input.block.parentHash.toLowerCase(),
          blockTimestamp: new Date(input.block.timestamp * 1000),
        })
        .onConflictDoUpdate({
          target: [
            chainBlocks.chainId,
            chainBlocks.blockNumber,
            chainBlocks.blockHash,
          ],
          set: {
            parentHash: input.block.parentHash.toLowerCase(),
            blockTimestamp: new Date(input.block.timestamp * 1000),
            canonical: true,
          },
        })
      await tx.execute(sql`
        update chain_blocks
        set canonical = true
        where chain_id = ${input.chainId}
          and block_number = ${input.block.number.toString()}::numeric
          and block_hash = ${input.block.hash.toLowerCase()}
      `)

      if (input.logs.length > 0) {
        await tx
          .insert(rawChainLogs)
          .values(
            input.logs.map((log) => ({
              chainId: input.chainId,
              blockNumber: log.blockNumber.toString(),
              blockHash: log.blockHash.toLowerCase(),
              transactionHash: log.transactionHash.toLowerCase(),
              transactionIndex: log.transactionIndex,
              logIndex: log.logIndex,
              contractAddress: log.contractAddress.toLowerCase(),
              topic0: log.topic0.toLowerCase(),
              topics: log.topics.map((topic) => topic.toLowerCase()),
              data: log.data.toLowerCase(),
              eventName: log.eventName,
              decodedArgs: log.decodedArgs,
            })),
          )
          .onConflictDoUpdate({
            target: [
              rawChainLogs.chainId,
              rawChainLogs.blockHash,
              rawChainLogs.transactionHash,
              rawChainLogs.logIndex,
            ],
            set: {
              canonical: true,
            },
          })
        for (const log of input.logs) {
          await tx.execute(sql`
            update raw_chain_logs
            set canonical = true
            where chain_id = ${input.chainId}
              and block_hash = ${log.blockHash.toLowerCase()}
              and transaction_hash = ${log.transactionHash.toLowerCase()}
              and log_index = ${log.logIndex}
          `)
        }
      }

      if ((input.marketRegistrations?.length ?? 0) > 0) {
        await tx
          .insert(tokenMarkets)
          .values(
            input.marketRegistrations!.map((market) => ({
              chainId: input.chainId,
              tokenAddress: normalizeAddress(market.tokenAddress),
              marketAddress: normalizeAddress(market.marketAddress),
              factoryAddress: normalizeAddress(input.cursorKey),
              creatorAddress: normalizeAddress(market.creatorAddress),
              isOfficial: isOfficialTokenAddress(market.tokenAddress),
              configVersion: market.configVersion.toString(),
              name: market.name,
              symbol: market.symbol,
              tokenImage: market.tokenImage,
              description: market.description,
              initialPriceX18: market.initialPriceX18?.toString() ?? null,
              createdBlockNumber: market.blockNumber.toString(),
              tokenDecimals: 18,
              quoteDecimals: 18,
            })),
          )
          .onConflictDoNothing()
      }

      if (input.trades.length > 0) {
        await tx
          .insert(tokenMarkets)
          .values(
            input.trades.map((trade) => ({
              chainId: input.chainId,
              tokenAddress: normalizeAddress(trade.tokenAddress),
              marketAddress: normalizeAddress(trade.marketAddress),
              factoryAddress: normalizeAddress(input.cursorKey),
              isOfficial: isOfficialTokenAddress(trade.tokenAddress),
              tokenDecimals: trade.tokenDecimals,
              quoteDecimals: trade.quoteDecimals,
            })),
          )
          .onConflictDoNothing()

        await tx
          .insert(marketTrades)
          .values(
            input.trades.map((trade) => ({
              chainId: input.chainId,
              tokenAddress: normalizeAddress(trade.tokenAddress),
              marketAddress: normalizeAddress(trade.marketAddress),
              source: trade.source,
              pairAddress: trade.pairAddress ? normalizeAddress(trade.pairAddress) : null,
              side: trade.side,
              traderAddress: normalizeAddress(trade.traderAddress),
              markPriceQuotePerTokenX18:
                trade.markPriceQuotePerTokenX18.toString(),
              executionPriceQuotePerTokenX18:
                trade.executionPriceQuotePerTokenX18?.toString() ?? null,
              tokenAmountRaw: trade.tokenAmountRaw.toString(),
              quoteAmountGrossRaw:
                trade.quoteAmountGrossRaw?.toString() ?? null,
              quoteAmountNetRaw: trade.quoteAmountNetRaw?.toString() ?? null,
              creatorFeeRaw: trade.creatorFeeRaw?.toString() ?? null,
              platformFeeRaw: trade.platformFeeRaw?.toString() ?? null,
              reserveDeltaAmountRaw: trade.reserveDeltaAmountRaw.toString(),
              reserveDeltaDirection: trade.reserveDeltaDirection,
              tokenDecimals: trade.tokenDecimals,
              quoteDecimals: trade.quoteDecimals,
              transactionHash: trade.txHash.toLowerCase(),
              transactionIndex: trade.transactionIndex,
              logIndex: trade.logIndex,
              blockNumber: trade.blockNumber.toString(),
              blockHash: trade.blockHash.toLowerCase(),
              blockTimestamp: new Date(trade.timestamp * 1000),
              legacyVolumeSemantics: trade.legacyVolumeSemantics,
            })),
          )
          .onConflictDoUpdate({
            target: [
              marketTrades.chainId,
              marketTrades.blockHash,
              marketTrades.transactionHash,
              marketTrades.logIndex,
            ],
            set: {
              canonical: true,
              confirmed: false,
            },
          })
        for (const trade of input.trades) {
          await tx.execute(sql`
            update market_trades
            set canonical = true, confirmed = false
            where chain_id = ${input.chainId}
              and block_hash = ${trade.blockHash.toLowerCase()}
              and transaction_hash = ${trade.txHash.toLowerCase()}
              and log_index = ${trade.logIndex}
          `)
        }

        await rebuildAffectedCandleBuckets(tx, input.chainId, input.trades)
      }

      for (const update of input.lifecycleUpdates ?? []) {
        await tx.execute(sql`
          update token_markets
          set
            stage = ${update.stage}::market_stage,
            pair_address = coalesce(${update.pairAddress ?? null}, pair_address),
            graduated_block_number = case
              when ${update.stage} = 'graduated_pending_liquidity'
              then ${update.blockNumber.toString()}::numeric
              else graduated_block_number
            end,
            graduated_at = case
              when ${update.stage} = 'graduated_pending_liquidity'
              then ${new Date(update.timestamp * 1000)}
              else graduated_at
            end,
            dex_source = case
              when ${update.stage} = 'dex_live'
              then 'uniswap_v2'::market_source
              else dex_source
            end,
            dex_live_block_number = case
              when ${update.stage} = 'dex_live'
              then ${update.blockNumber.toString()}::numeric
              else dex_live_block_number
            end,
            dex_live_at = case
              when ${update.stage} = 'dex_live'
              then ${new Date(update.timestamp * 1000)}
              else dex_live_at
            end,
            updated_at = now()
          where chain_id = ${input.chainId}
            and token_address = ${normalizeAddress(update.tokenAddress)}
            and bonding_curve_address = ${normalizeAddress(update.marketAddress)}
        `)
      }

      if ((input.poolReserveUpdates?.length ?? 0) > 0) {
        await tx
          .insert(poolReserveSnapshots)
          .values(
            input.poolReserveUpdates!.map((update) => ({
              chainId: input.chainId,
              tokenAddress: normalizeAddress(update.tokenAddress),
              marketAddress: normalizeAddress(update.marketAddress),
              pairAddress: normalizeAddress(update.pairAddress),
              tokenReserveRaw: update.tokenReserveRaw.toString(),
              quoteReserveRaw: update.quoteReserveRaw.toString(),
              liquidityQuoteRaw: update.liquidityQuoteRaw.toString(),
              quoteTokenAddress: update.quoteTokenAddress
                ? normalizeAddress(update.quoteTokenAddress)
                : null,
              blockNumber: update.blockNumber.toString(),
              blockHash: update.blockHash.toLowerCase(),
              transactionHash: update.transactionHash.toLowerCase(),
              transactionIndex: update.transactionIndex,
              logIndex: update.logIndex,
              blockTimestamp: new Date(update.timestamp * 1000),
            })),
          )
          .onConflictDoUpdate({
            target: [
              poolReserveSnapshots.chainId,
              poolReserveSnapshots.blockHash,
              poolReserveSnapshots.transactionHash,
              poolReserveSnapshots.logIndex,
            ],
            set: {
              tokenReserveRaw: sql`excluded.token_reserve_raw`,
              quoteReserveRaw: sql`excluded.quote_reserve_raw`,
              liquidityQuoteRaw: sql`excluded.liquidity_quote_raw`,
              quoteTokenAddress: sql`excluded.quote_token_address`,
              blockNumber: sql`excluded.block_number`,
              transactionIndex: sql`excluded.transaction_index`,
              blockTimestamp: sql`excluded.block_timestamp`,
              canonical: true,
            },
          })

        await tx
          .insert(poolReserves)
          .values(
            input.poolReserveUpdates!.map((update) => ({
              chainId: input.chainId,
              tokenAddress: normalizeAddress(update.tokenAddress),
              marketAddress: normalizeAddress(update.marketAddress),
              pairAddress: normalizeAddress(update.pairAddress),
              tokenReserveRaw: update.tokenReserveRaw.toString(),
              quoteReserveRaw: update.quoteReserveRaw.toString(),
              liquidityQuoteRaw: update.liquidityQuoteRaw.toString(),
              quoteTokenAddress: update.quoteTokenAddress
                ? normalizeAddress(update.quoteTokenAddress)
                : null,
              blockNumber: update.blockNumber.toString(),
              blockHash: update.blockHash.toLowerCase(),
              transactionHash: update.transactionHash.toLowerCase(),
              transactionIndex: update.transactionIndex,
              logIndex: update.logIndex,
              blockTimestamp: new Date(update.timestamp * 1000),
            })),
          )
          .onConflictDoUpdate({
            target: [poolReserves.chainId, poolReserves.pairAddress],
            set: {
              tokenReserveRaw: sql`excluded.token_reserve_raw`,
              quoteReserveRaw: sql`excluded.quote_reserve_raw`,
              liquidityQuoteRaw: sql`excluded.liquidity_quote_raw`,
              quoteTokenAddress: sql`excluded.quote_token_address`,
              blockNumber: sql`excluded.block_number`,
              blockHash: sql`excluded.block_hash`,
              transactionHash: sql`excluded.transaction_hash`,
              transactionIndex: sql`excluded.transaction_index`,
              logIndex: sql`excluded.log_index`,
              blockTimestamp: sql`excluded.block_timestamp`,
              updatedAt: sql`now()`,
            },
          })
      }

      await markConfirmedTrades(tx, input.chainId, finalizedBlock)

      if (input.advanceCheckpoint !== false) {
        await upsertCheckpoint(tx, {
          chainId: input.chainId,
          cursorKey: input.cursorKey,
          lastIndexedBlock: input.block.number,
          lastFinalizedBlock: finalizedBlock,
        })
      }
    })
  }

  async advanceCheckpoint(input: AdvanceCheckpointInput): Promise<void> {
    if (!db) {
      throw new Error('PostgreSQL market store is not configured')
    }

    const finalizedBlock = getFinalizedBlock(
      input.lastIndexedBlock,
      input.confirmationDepth,
    )

    await db.transaction(async (tx) => {
      await upsertCheckpoint(tx, {
        chainId: input.chainId,
        cursorKey: input.cursorKey,
        lastIndexedBlock: input.lastIndexedBlock,
        lastFinalizedBlock: finalizedBlock,
      })

      await markConfirmedTrades(tx, input.chainId, finalizedBlock)
    })
  }

  async resetCheckpoint(input: ResetCheckpointInput): Promise<void> {
    if (!db) {
      throw new Error('PostgreSQL market store is not configured')
    }

    await upsertCheckpoint(db, input)
  }

  async rollbackCanonicalFromBlock(
    chainId: number,
    cursorKey: string,
    fromBlock: bigint,
  ): Promise<RollbackCanonicalResult> {
    if (!db) {
      throw new Error('PostgreSQL market store is not configured')
    }

    const resetToBlock = fromBlock > 0n ? fromBlock - 1n : 0n
    const marketEventNames = sql.join(MARKET_EVENT_NAMES.map((name) => sql`${name}`), sql`, `)
    const result = await db.execute(sql`
      select
        token_address,
        extract(epoch from block_timestamp)::bigint::text as timestamp
      from market_trades
      where chain_id = ${chainId}
        and canonical = true
        and block_number >= ${fromBlock.toString()}::numeric
      order by block_number asc, transaction_index asc, log_index asc
    `)

    const affectedTrades = result.rows.map((row) => ({
      tokenAddress: row.token_address as string,
      timestamp: Number(row.timestamp as string),
    }))
    const affectedReserveResult = await db.execute(sql`
      select distinct token_address, pair_address
      from pool_reserve_snapshots
      where chain_id = ${chainId}
        and canonical = true
        and block_number >= ${fromBlock.toString()}::numeric
    `)
    const affectedReserveRows = affectedReserveResult.rows.map((row) => ({
      tokenAddress: row.token_address as string,
      pairAddress: row.pair_address as string,
    }))
    const affectedPairAddresses = [
      ...new Set(affectedReserveRows.map((row) => row.pairAddress.toLowerCase())),
    ]
    const affectedTokenAddresses = [
      ...new Set([
        ...affectedTrades.map((trade) => trade.tokenAddress.toLowerCase()),
        ...affectedReserveRows.map((row) => row.tokenAddress.toLowerCase()),
      ]),
    ]

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        update raw_chain_logs
        set canonical = false
        where chain_id = ${chainId}
          and canonical = true
          and event_name in (${marketEventNames})
          and block_number >= ${fromBlock.toString()}::numeric
      `)

      await tx.execute(sql`
        update market_trades
        set canonical = false, confirmed = false
        where chain_id = ${chainId}
          and canonical = true
          and block_number >= ${fromBlock.toString()}::numeric
      `)

      await tx.execute(sql`
        delete from token_markets
        where chain_id = ${chainId}
          and created_block_number >= ${fromBlock.toString()}::numeric
      `)

      await tx.execute(sql`
        update token_markets
        set
          stage = 'bonding_curve_live',
          dex_source = null,
          pair_address = null,
          graduated_block_number = null,
          graduated_at = null,
          dex_live_block_number = null,
          dex_live_at = null,
          updated_at = now()
        where chain_id = ${chainId}
          and (
            graduated_block_number >= ${fromBlock.toString()}::numeric
            or dex_live_block_number >= ${fromBlock.toString()}::numeric
        )
      `)

      await tx.execute(sql`
        update pool_reserve_snapshots
        set canonical = false
        where chain_id = ${chainId}
          and canonical = true
          and block_number >= ${fromBlock.toString()}::numeric
      `)

      if (affectedPairAddresses.length > 0) {
        const affectedPairSql = sql.join(
          affectedPairAddresses.map((pairAddress) => sql`${pairAddress}`),
          sql`, `,
        )

        await tx.execute(sql`
          delete from pool_reserves
          where chain_id = ${chainId}
            and pair_address in (${affectedPairSql})
        `)

        await tx.execute(sql`
          insert into pool_reserves (
            chain_id,
            token_address,
            market_address,
            pair_address,
            token_reserve_raw,
            quote_reserve_raw,
            liquidity_quote_raw,
            quote_token_address,
            block_number,
            block_hash,
            transaction_hash,
            transaction_index,
            log_index,
            block_timestamp,
            updated_at
          )
          select
            latest.chain_id,
            latest.token_address,
            latest.market_address,
            latest.pair_address,
            latest.token_reserve_raw,
            latest.quote_reserve_raw,
            latest.liquidity_quote_raw,
            latest.quote_token_address,
            latest.block_number,
            latest.block_hash,
            latest.transaction_hash,
            latest.transaction_index,
            latest.log_index,
            latest.block_timestamp,
            now()
          from (
            select distinct on (chain_id, pair_address)
              chain_id,
              token_address,
              market_address,
              pair_address,
              token_reserve_raw,
              quote_reserve_raw,
              liquidity_quote_raw,
              quote_token_address,
              block_number,
              block_hash,
              transaction_hash,
              transaction_index,
              log_index,
              block_timestamp
            from pool_reserve_snapshots
            where chain_id = ${chainId}
              and canonical = true
              and pair_address in (${affectedPairSql})
            order by
              chain_id,
              pair_address,
              block_number desc,
              transaction_index desc,
              log_index desc
          ) latest
          on conflict (chain_id, pair_address) do update set
            token_reserve_raw = excluded.token_reserve_raw,
            quote_reserve_raw = excluded.quote_reserve_raw,
            liquidity_quote_raw = excluded.liquidity_quote_raw,
            quote_token_address = excluded.quote_token_address,
            block_number = excluded.block_number,
            block_hash = excluded.block_hash,
            transaction_hash = excluded.transaction_hash,
            transaction_index = excluded.transaction_index,
            log_index = excluded.log_index,
            block_timestamp = excluded.block_timestamp,
            updated_at = now()
        `)
      }

      if (affectedTrades.length > 0) {
        await rebuildAffectedCandleBuckets(tx, chainId, affectedTrades)
      }

      await upsertCheckpoint(tx, {
        chainId,
        cursorKey,
        lastIndexedBlock: resetToBlock,
        lastFinalizedBlock: resetToBlock,
      })
    })

    return {
      affectedTokenAddresses,
      resetToBlock,
    }
  }
}

export const postgresMarketStore = new PostgresMarketStore()
