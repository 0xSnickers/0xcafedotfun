import { sql } from 'drizzle-orm'
import {
  bigserial,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

const uint256 = (name: string) => numeric(name, { precision: 78, scale: 0 })

export const marketSource = pgEnum('market_source', [
  'bonding_curve',
  'uniswap_v2',
])
export const tradeSide = pgEnum('trade_side', ['buy', 'sell'])
export const reserveDeltaDirection = pgEnum('reserve_delta_direction', [
  'increase',
  'decrease',
])
export const marketStage = pgEnum('market_stage', [
  'bonding_curve_live',
  'graduated_pending_liquidity',
  'dex_live',
])
export const growthRewardStatus = pgEnum('growth_reward_status', [
  'pending',
  'confirmed',
  'rejected',
])
export const growthAppealStatus = pgEnum('growth_appeal_status', [
  'open',
  'approved',
  'rejected',
])

export const chainBlocks = pgTable(
  'chain_blocks',
  {
    chainId: integer('chain_id').notNull(),
    blockNumber: uint256('block_number').notNull(),
    blockHash: text('block_hash').notNull(),
    parentHash: text('parent_hash').notNull(),
    blockTimestamp: timestamp('block_timestamp', { withTimezone: true }).notNull(),
    canonical: boolean('canonical').notNull().default(true),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.chainId, table.blockNumber, table.blockHash],
    }),
    uniqueIndex('chain_blocks_one_canonical_height')
      .on(table.chainId, table.blockNumber)
      .where(sql`${table.canonical} = true`),
  ],
)

export const rawChainLogs = pgTable(
  'raw_chain_logs',
  {
    chainId: integer('chain_id').notNull(),
    blockNumber: uint256('block_number').notNull(),
    blockHash: text('block_hash').notNull(),
    transactionHash: text('transaction_hash').notNull(),
    transactionIndex: integer('transaction_index').notNull(),
    logIndex: integer('log_index').notNull(),
    contractAddress: text('contract_address').notNull(),
    topic0: text('topic0').notNull(),
    topics: jsonb('topics').notNull(),
    data: text('data').notNull(),
    eventName: text('event_name'),
    decodedArgs: jsonb('decoded_args'),
    canonical: boolean('canonical').notNull().default(true),
    observedAt: timestamp('observed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.chainId,
        table.blockHash,
        table.transactionHash,
        table.logIndex,
      ],
    }),
    index('raw_chain_logs_contract_block_idx').on(
      table.chainId,
      table.contractAddress,
      table.blockNumber,
    ),
    index('raw_chain_logs_tx_idx').on(table.chainId, table.transactionHash),
  ],
)

export const tokenMarkets = pgTable(
  'token_markets',
  {
    chainId: integer('chain_id').notNull(),
    tokenAddress: text('token_address').notNull(),
    marketAddress: text('bonding_curve_address').notNull(),
    factoryAddress: text('factory_address'),
    creatorAddress: text('creator_address'),
    isOfficial: boolean('is_official').notNull().default(false),
    configVersion: uint256('config_version'),
    name: text('name'),
    symbol: text('symbol'),
    tokenImage: text('token_image'),
    description: text('description'),
    initialPriceX18: uint256('initial_price_x18'),
    createdBlockNumber: uint256('created_block_number'),
    stage: marketStage('stage').notNull().default('bonding_curve_live'),
    dexSource: marketSource('dex_source'),
    pairAddress: text('pair_address'),
    quoteTokenAddress: text('quote_token_address'),
    tokenDecimals: integer('token_decimals').notNull(),
    quoteDecimals: integer('quote_decimals').notNull().default(18),
    graduatedBlockNumber: uint256('graduated_block_number'),
    graduatedAt: timestamp('graduated_at', { withTimezone: true }),
    dexLiveBlockNumber: uint256('dex_live_block_number'),
    dexLiveAt: timestamp('dex_live_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.tokenAddress] }),
    uniqueIndex('token_markets_pair_idx')
      .on(table.chainId, table.pairAddress)
      .where(sql`${table.pairAddress} is not null`),
  ],
)

export const marketTrades = pgTable(
  'market_trades',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    chainId: integer('chain_id').notNull(),
    tokenAddress: text('token_address').notNull(),
    marketAddress: text('market_address'),
    source: marketSource('source').notNull(),
    pairAddress: text('pair_address'),
    side: tradeSide('side').notNull(),
    traderAddress: text('trader_address'),
    markPriceQuotePerTokenX18: uint256(
      'mark_price_quote_per_token_x18',
    ).notNull(),
    executionPriceQuotePerTokenX18: uint256(
      'execution_price_quote_per_token_x18',
    ),
    tokenAmountRaw: uint256('token_amount_raw').notNull(),
    quoteAmountGrossRaw: uint256('quote_amount_gross_raw'),
    quoteAmountNetRaw: uint256('quote_amount_net_raw'),
    creatorFeeRaw: uint256('creator_fee_raw'),
    platformFeeRaw: uint256('platform_fee_raw'),
    reserveDeltaAmountRaw: uint256('reserve_delta_amount_raw'),
    reserveDeltaDirection: reserveDeltaDirection('reserve_delta_direction'),
    tokenDecimals: integer('token_decimals').notNull(),
    quoteDecimals: integer('quote_decimals').notNull(),
    transactionHash: text('transaction_hash').notNull(),
    transactionIndex: integer('transaction_index').notNull(),
    logIndex: integer('log_index').notNull(),
    blockNumber: uint256('block_number').notNull(),
    blockHash: text('block_hash').notNull(),
    blockTimestamp: timestamp('block_timestamp', { withTimezone: true }).notNull(),
    confirmed: boolean('confirmed').notNull().default(false),
    canonical: boolean('canonical').notNull().default(true),
    legacyVolumeSemantics: boolean('legacy_volume_semantics')
      .notNull()
      .default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('market_trades_chain_log_idx').on(
      table.chainId,
      table.blockHash,
      table.transactionHash,
      table.logIndex,
    ),
    index('market_trades_token_time_idx')
      .on(table.chainId, table.tokenAddress, table.blockTimestamp)
      .where(sql`${table.canonical} = true`),
    index('market_trades_unconfirmed_idx')
      .on(table.chainId, table.blockNumber)
      .where(sql`${table.canonical} = true and ${table.confirmed} = false`),
  ],
)

export const marketCandles1m = pgTable(
  'market_candles_1m',
  {
    chainId: integer('chain_id').notNull(),
    tokenAddress: text('token_address').notNull(),
    bucketStart: timestamp('bucket_start', { withTimezone: true }).notNull(),
    openPriceQuotePerTokenX18: uint256(
      'open_price_quote_per_token_x18',
    ).notNull(),
    highPriceQuotePerTokenX18: uint256(
      'high_price_quote_per_token_x18',
    ).notNull(),
    lowPriceQuotePerTokenX18: uint256(
      'low_price_quote_per_token_x18',
    ).notNull(),
    closePriceQuotePerTokenX18: uint256(
      'close_price_quote_per_token_x18',
    ).notNull(),
    volumeTokenRaw: uint256('volume_token_raw').notNull().default('0'),
    volumeQuoteGrossRaw: uint256('volume_quote_gross_raw')
      .notNull()
      .default('0'),
    volumeQuoteNetRaw: uint256('volume_quote_net_raw').notNull().default('0'),
    volumeQuoteGrossComplete: boolean('volume_quote_gross_complete')
      .notNull()
      .default(true),
    volumeQuoteNetComplete: boolean('volume_quote_net_complete')
      .notNull()
      .default(true),
    tradeCount: integer('trade_count').notNull().default(0),
    firstTradeId: bigint('first_trade_id', { mode: 'bigint' })
      .notNull()
      .references(() => marketTrades.id),
    lastTradeId: bigint('last_trade_id', { mode: 'bigint' })
      .notNull()
      .references(() => marketTrades.id),
    dirty: boolean('dirty').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.chainId, table.tokenAddress, table.bucketStart],
    }),
    index('market_candles_1m_token_time_idx').on(
      table.chainId,
      table.tokenAddress,
      table.bucketStart,
    ),
  ],
)

export const poolReserves = pgTable(
  'pool_reserves',
  {
    chainId: integer('chain_id').notNull(),
    tokenAddress: text('token_address').notNull(),
    marketAddress: text('market_address').notNull(),
    pairAddress: text('pair_address').notNull(),
    tokenReserveRaw: uint256('token_reserve_raw').notNull(),
    quoteReserveRaw: uint256('quote_reserve_raw').notNull(),
    liquidityQuoteRaw: uint256('liquidity_quote_raw').notNull(),
    quoteTokenAddress: text('quote_token_address'),
    blockNumber: uint256('block_number').notNull(),
    blockHash: text('block_hash').notNull(),
    transactionHash: text('transaction_hash').notNull(),
    transactionIndex: integer('transaction_index').notNull(),
    logIndex: integer('log_index').notNull(),
    blockTimestamp: timestamp('block_timestamp', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.pairAddress] }),
    index('pool_reserves_token_idx').on(table.chainId, table.tokenAddress),
    index('pool_reserves_updated_idx').on(table.chainId, table.blockNumber),
  ],
)

export const poolReserveSnapshots = pgTable(
  'pool_reserve_snapshots',
  {
    chainId: integer('chain_id').notNull(),
    tokenAddress: text('token_address').notNull(),
    marketAddress: text('market_address').notNull(),
    pairAddress: text('pair_address').notNull(),
    tokenReserveRaw: uint256('token_reserve_raw').notNull(),
    quoteReserveRaw: uint256('quote_reserve_raw').notNull(),
    liquidityQuoteRaw: uint256('liquidity_quote_raw').notNull(),
    quoteTokenAddress: text('quote_token_address'),
    blockNumber: uint256('block_number').notNull(),
    blockHash: text('block_hash').notNull(),
    transactionHash: text('transaction_hash').notNull(),
    transactionIndex: integer('transaction_index').notNull(),
    logIndex: integer('log_index').notNull(),
    blockTimestamp: timestamp('block_timestamp', { withTimezone: true }).notNull(),
    canonical: boolean('canonical').notNull().default(true),
    observedAt: timestamp('observed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.chainId,
        table.blockHash,
        table.transactionHash,
        table.logIndex,
      ],
    }),
    index('pool_reserve_snapshots_token_time_idx')
      .on(table.chainId, table.tokenAddress, table.blockTimestamp)
      .where(sql`${table.canonical} = true`),
    index('pool_reserve_snapshots_pair_time_idx')
      .on(table.chainId, table.pairAddress, table.blockTimestamp)
      .where(sql`${table.canonical} = true`),
  ],
)

export const indexerCheckpoints = pgTable(
  'indexer_checkpoints',
  {
    consumerName: text('consumer_name').notNull(),
    chainId: integer('chain_id').notNull(),
    cursorKey: text('cursor_key').notNull(),
    lastIndexedBlock: uint256('last_indexed_block').notNull(),
    lastFinalizedBlock: uint256('last_finalized_block').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.consumerName, table.chainId, table.cursorKey],
    }),
  ],
)

export const creatorFeeClaims = pgTable(
  'creator_fee_claims',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    chainId: integer('chain_id').notNull(),
    creatorAddress: text('creator_address').notNull(),
    recipientAddress: text('recipient_address').notNull(),
    amountRaw: uint256('amount_raw').notNull(),
    transactionHash: text('transaction_hash').notNull(),
    transactionIndex: integer('transaction_index').notNull(),
    logIndex: integer('log_index').notNull(),
    blockNumber: uint256('block_number').notNull(),
    blockHash: text('block_hash').notNull(),
    blockTimestamp: timestamp('block_timestamp', { withTimezone: true }).notNull(),
    confirmed: boolean('confirmed').notNull().default(false),
    canonical: boolean('canonical').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('creator_fee_claims_chain_log_idx').on(
      table.chainId,
      table.blockHash,
      table.transactionHash,
      table.logIndex,
    ),
    index('creator_fee_claims_creator_time_idx')
      .on(table.chainId, table.creatorAddress, table.blockTimestamp)
      .where(sql`${table.canonical} = true`),
    index('creator_fee_claims_unconfirmed_idx')
      .on(table.chainId, table.blockNumber)
      .where(sql`${table.canonical} = true and ${table.confirmed} = false`),
  ],
)

export const creatorFeeAccruals = pgTable(
  'creator_fee_accruals',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    chainId: integer('chain_id').notNull(),
    tokenAddress: text('token_address').notNull(),
    marketAddress: text('market_address').notNull(),
    creatorAddress: text('creator_address').notNull(),
    platformFeeRaw: uint256('platform_fee_raw').notNull(),
    creatorFeeRaw: uint256('creator_fee_raw').notNull(),
    transactionHash: text('transaction_hash').notNull(),
    transactionIndex: integer('transaction_index').notNull(),
    logIndex: integer('log_index').notNull(),
    blockNumber: uint256('block_number').notNull(),
    blockHash: text('block_hash').notNull(),
    blockTimestamp: timestamp('block_timestamp', { withTimezone: true }).notNull(),
    confirmed: boolean('confirmed').notNull().default(false),
    canonical: boolean('canonical').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('creator_fee_accruals_chain_log_idx').on(
      table.chainId,
      table.blockHash,
      table.transactionHash,
      table.logIndex,
    ),
    index('creator_fee_accruals_creator_time_idx')
      .on(table.chainId, table.creatorAddress, table.blockTimestamp)
      .where(sql`${table.canonical} = true`),
    index('creator_fee_accruals_token_time_idx')
      .on(table.chainId, table.tokenAddress, table.blockTimestamp)
      .where(sql`${table.canonical} = true`),
    index('creator_fee_accruals_unconfirmed_idx')
      .on(table.chainId, table.blockNumber)
      .where(sql`${table.canonical} = true and ${table.confirmed} = false`),
  ],
)

export const creatorTokenFeeFacts = pgTable(
  'creator_token_fee_facts',
  {
    chainId: integer('chain_id').notNull(),
    creatorAddress: text('creator_address').notNull(),
    tokenAddress: text('token_address').notNull(),
    accruedRaw: uint256('accrued_raw').notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.creatorAddress, table.tokenAddress] }),
    index('creator_token_fee_facts_creator_idx').on(
      table.chainId,
      table.creatorAddress,
      table.updatedAt,
    ),
  ],
)

export const creatorFeeFacts = pgTable(
  'creator_fee_facts',
  {
    chainId: integer('chain_id').notNull(),
    creatorAddress: text('creator_address').notNull(),
    totalAccruedRaw: uint256('total_accrued_raw').notNull().default('0'),
    totalClaimedRaw: uint256('total_claimed_raw').notNull().default('0'),
    tokenCount: integer('token_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.chainId, table.creatorAddress] })],
)

export const growthReferrals = pgTable(
  'growth_referrals',
  {
    chainId: integer('chain_id').notNull(),
    inviteeAddress: text('invitee_address').notNull(),
    inviterAddress: text('inviter_address').notNull(),
    qualified: boolean('qualified').notNull().default(false),
    qualifiedAt: timestamp('qualified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.inviteeAddress] }),
    index('growth_referrals_inviter_idx').on(table.chainId, table.inviterAddress),
  ],
)

export const growthRewards = pgTable(
  'growth_rewards',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    chainId: integer('chain_id').notNull(),
    walletAddress: text('wallet_address').notNull(),
    sourceTradeId: bigint('source_trade_id', { mode: 'bigint' }).references(() => marketTrades.id),
    reason: text('reason').notNull(),
    points: integer('points').notNull(),
    status: growthRewardStatus('status').notNull().default('pending'),
    riskFlags: jsonb('risk_flags').notNull().default([]),
    settlesAt: timestamp('settles_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('growth_rewards_trade_reason_idx').on(table.chainId, table.sourceTradeId, table.reason),
    index('growth_rewards_wallet_idx').on(table.chainId, table.walletAddress, table.status),
  ],
)

export const growthAppeals = pgTable(
  'growth_appeals',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    chainId: integer('chain_id').notNull(),
    walletAddress: text('wallet_address').notNull(),
    reason: text('reason').notNull(),
    evidence: text('evidence'),
    status: growthAppealStatus('status').notNull().default('open'),
    resolution: text('resolution'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('growth_appeals_wallet_idx').on(table.chainId, table.walletAddress, table.status),
  ],
)
