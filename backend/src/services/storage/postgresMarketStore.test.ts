import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { db, postgresPool } from '../../clients/postgresClient'
import { IndexedTrade } from '../../types/market'
import { rebuildCandleBucket } from '../candleProjector'
import {
  PostgresMarketStore,
  ProcessBlockInput,
} from './postgresMarketStore'
import { postgresCandleStore } from './postgresCandleStore'

const TEST_CHAIN_ID = 9_913_137
const CURSOR = '0x0000000000000000000000000000000000000001'
const TOKEN = '0xcafe000000000000000000000000000000000002'

function createTrade(): IndexedTrade {
  return {
    tokenAddress: TOKEN,
    marketAddress: CURSOR,
    source: 'bonding_curve',
    side: 'buy',
    priceWei: 2_000n,
    tokenAmountRaw: 10_000n,
    quoteAmountWei: 20_000n,
    txHash: '0xtransaction',
    logIndex: 0,
    blockNumber: 100n,
    timestamp: 1_710_000_000,
    traderAddress: '0x0000000000000000000000000000000000000003',
    blockHash: '0xblock100',
    transactionIndex: 0,
    tokenDecimals: 18,
    quoteDecimals: 18,
    markPriceQuotePerTokenX18: 2_000n,
    executionPriceQuotePerTokenX18: 2_000n,
    quoteAmountGrossRaw: 20_000n,
    quoteAmountNetRaw: null,
    creatorFeeRaw: 0n,
    platformFeeRaw: 0n,
    reserveDeltaAmountRaw: 20_000n,
    reserveDeltaDirection: 'increase',
    legacyVolumeSemantics: true,
  }
}

function createBlockInput(): ProcessBlockInput {
  const trade = createTrade()
  return {
    chainId: TEST_CHAIN_ID,
    cursorKey: CURSOR,
    confirmationDepth: 3n,
    block: {
      number: 100n,
      hash: trade.blockHash,
      parentHash: '0xblock99',
      timestamp: trade.timestamp,
    },
    logs: [
      {
        blockNumber: 100n,
        blockHash: trade.blockHash,
        transactionHash: trade.txHash,
        transactionIndex: 0,
        logIndex: 0,
        contractAddress: CURSOR,
        topic0: '0xtopic',
        topics: ['0xtopic'],
        data: '0x',
        eventName: 'TokenBought',
        decodedArgs: { token: TOKEN },
      },
    ],
    trades: [trade],
  }
}

async function cleanup(): Promise<void> {
  if (!postgresPool) {
    return
  }
  await postgresPool.query('delete from market_candles_1m where chain_id = $1', [
    TEST_CHAIN_ID,
  ])
  await postgresPool.query('delete from pool_reserve_snapshots where chain_id = $1', [
    TEST_CHAIN_ID,
  ])
  await postgresPool.query('delete from pool_reserves where chain_id = $1', [
    TEST_CHAIN_ID,
  ])
  await postgresPool.query('delete from market_trades where chain_id = $1', [
    TEST_CHAIN_ID,
  ])
  await postgresPool.query('delete from raw_chain_logs where chain_id = $1', [
    TEST_CHAIN_ID,
  ])
  await postgresPool.query('delete from token_markets where chain_id = $1', [
    TEST_CHAIN_ID,
  ])
  await postgresPool.query('delete from indexer_checkpoints where chain_id = $1', [
    TEST_CHAIN_ID,
  ])
  await postgresPool.query('delete from chain_blocks where chain_id = $1', [
    TEST_CHAIN_ID,
  ])
}

after(async () => {
  await postgresPool?.end()
})

test(
  'persists a block idempotently and advances checkpoint in the same fact transaction',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()

    await store.processBlock(createBlockInput())
    await store.processBlock(createBlockInput())

    const trades = await postgresPool!.query(
      'select count(*)::int as count from market_trades where chain_id = $1',
      [TEST_CHAIN_ID],
    )
    const logs = await postgresPool!.query(
      'select count(*)::int as count from raw_chain_logs where chain_id = $1',
      [TEST_CHAIN_ID],
    )
    const checkpoint = await store.getMarketCheckpointMetadata(TEST_CHAIN_ID, CURSOR)

    assert.equal(trades.rows[0].count, 1)
    assert.equal(logs.rows[0].count, 1)
    assert.equal(checkpoint.lastIndexedBlock, 100n)
    assert.equal(checkpoint.lastFinalizedBlock, 97n)
    await cleanup()
  },
)

test(
  'rebuilds candles in chain order and exposes incomplete legacy gross volume',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()

    const input = createBlockInput()
    const first = createTrade()
    first.transactionIndex = 0
    first.logIndex = 2
    first.markPriceQuotePerTokenX18 = 1_000n
    first.priceWei = 1_000n
    first.quoteAmountGrossRaw = 5_000n
    first.quoteAmountWei = 5_000n
    first.txHash = '0xfirst'

    const middle = createTrade()
    middle.transactionIndex = 1
    middle.logIndex = 1
    middle.markPriceQuotePerTokenX18 = 3_000n
    middle.priceWei = 3_000n
    middle.quoteAmountGrossRaw = null
    middle.quoteAmountNetRaw = 7_000n
    middle.quoteAmountWei = 7_000n
    middle.side = 'sell'
    middle.txHash = '0xmiddle'

    const last = createTrade()
    last.transactionIndex = 2
    last.logIndex = 0
    last.markPriceQuotePerTokenX18 = 2_000n
    last.priceWei = 2_000n
    last.quoteAmountGrossRaw = 11_000n
    last.quoteAmountWei = 11_000n
    last.txHash = '0xlast'

    input.trades = [last, first, middle]
    input.logs = []
    await store.processBlock(input)

    const result = await postgresPool!.query(
      `select
         open_price_quote_per_token_x18::text as open,
         high_price_quote_per_token_x18::text as high,
         low_price_quote_per_token_x18::text as low,
         close_price_quote_per_token_x18::text as close,
         volume_quote_gross_raw::text as gross,
         volume_quote_gross_complete,
         trade_count
       from market_candles_1m
       where chain_id = $1`,
      [TEST_CHAIN_ID],
    )

    assert.deepEqual(result.rows, [
      {
        open: '1000',
        high: '3000',
        low: '1000',
        close: '2000',
        gross: '16000',
        volume_quote_gross_complete: false,
        trade_count: 3,
      },
    ])

    const nextMinute = createBlockInput()
    nextMinute.block = {
      number: 101n,
      hash: '0xblock101',
      parentHash: input.block.hash,
      timestamp: input.block.timestamp + 5 * 60,
    }
    nextMinute.logs = []
    nextMinute.trades[0].blockNumber = 101n
    nextMinute.trades[0].blockHash = '0xblock101'
    nextMinute.trades[0].timestamp = input.block.timestamp + 5 * 60
    nextMinute.trades[0].txHash = '0xnextminute'
    nextMinute.trades[0].side = 'sell'
    nextMinute.trades[0].markPriceQuotePerTokenX18 = 1_500n
    nextMinute.trades[0].priceWei = 1_500n
    nextMinute.trades[0].quoteAmountGrossRaw = null
    nextMinute.trades[0].quoteAmountNetRaw = 8_000n
    await store.processBlock(nextMinute)

    const candles = await postgresCandleStore.getCandles(
      TEST_CHAIN_ID,
      TOKEN,
      input.block.timestamp - 60,
      nextMinute.block.timestamp + 60,
    )
    assert.equal(candles.length, 2)
    assert.equal(candles[0].open, '1000')
    assert.equal(candles[0].close, '2000')
    assert.equal(candles[0].volumeQuoteGrossComplete, false)
    assert.equal(candles[1].open, '2000')
    assert.equal(candles[1].high, '2000')
    assert.equal(candles[1].low, '1500')
    assert.equal(candles[1].close, '1500')
    assert.equal(candles[1].volumeQuoteGrossComplete, false)
    await cleanup()
  },
)

test(
  'uses the registered initial price as the first candle open',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()

    const input = createBlockInput()
    input.logs = []
    input.marketRegistrations = [
      {
        tokenAddress: TOKEN,
        marketAddress: CURSOR,
        creatorAddress: '0x0000000000000000000000000000000000000003',
        configVersion: 1n,
        name: 'Cafe',
        symbol: 'CAFE',
        tokenImage: '',
        description: '',
        initialPriceX18: 100n,
        blockNumber: input.block.number,
      },
    ]
    input.trades[0].markPriceQuotePerTokenX18 = 2_000n
    input.trades[0].executionPriceQuotePerTokenX18 = 2_000n
    input.trades[0].priceWei = 2_000n

    await store.processBlock(input)

    const result = await postgresPool!.query(
      `select
         open_price_quote_per_token_x18::text as open,
         high_price_quote_per_token_x18::text as high,
         low_price_quote_per_token_x18::text as low,
         close_price_quote_per_token_x18::text as close
       from market_candles_1m
       where chain_id = $1`,
      [TEST_CHAIN_ID],
    )
    const config = await store.getMarketConfigByTokenAddress(TEST_CHAIN_ID, TOKEN)

    assert.deepEqual(result.rows, [
      {
        open: '100',
        high: '2000',
        low: '100',
        close: '2000',
      },
    ])
    assert.equal(config?.initialPriceX18, '100')
    await cleanup()
  },
)

test(
  'projects market list rows from PostgreSQL facts',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()

    const input = createBlockInput()
    input.logs = []
    input.marketRegistrations = [
      {
        tokenAddress: TOKEN,
        marketAddress: CURSOR,
        creatorAddress: '0x0000000000000000000000000000000000000003',
        configVersion: 1n,
        name: 'Cafe',
        symbol: 'CAFE',
        tokenImage: 'ipfs://image',
        description: 'listed token',
        initialPriceX18: 100n,
        blockNumber: input.block.number,
      },
    ]
    input.trades[0].tokenAmountRaw = 1_000_000_000_000_000_000n
    input.trades[0].markPriceQuotePerTokenX18 = 2_000_000_000_000_000_000n
    input.trades[0].executionPriceQuotePerTokenX18 = 2_000_000_000_000_000_000n
    input.trades[0].priceWei = 2_000_000_000_000_000_000n
    input.trades[0].quoteAmountGrossRaw = 2_000_000_000_000_000_000n
    input.trades[0].quoteAmountWei = 2_000_000_000_000_000_000n

    await store.processBlock(input)

    const list = await store.getMarketList(TEST_CHAIN_ID, input.block.timestamp + 60, 10)

    assert.equal(list.markets.length, 1)
    assert.equal(list.markets[0].tokenAddress, TOKEN)
    assert.equal(list.markets[0].name, 'Cafe')
    assert.equal(list.markets[0].symbol, 'CAFE')
    assert.equal(list.markets[0].currentPrice, '2000000000000000000')
    assert.equal(list.markets[0].currentMarketCap, '2000000000000000000')
    assert.equal(list.markets[0].volume24h, '2000000000000000000')
    assert.equal(list.markets[0].volume24hComplete, true)
    assert.equal(list.markets[0].tradeCount24h, 1)
    await cleanup()
  },
)

test(
  'treats the candle query upper bound as exclusive',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()

    const firstMinute = createBlockInput()
    firstMinute.logs = []
    firstMinute.trades[0].txHash = '0xexclusive-first'
    firstMinute.trades[0].blockHash = '0xexclusive-block-100'
    firstMinute.block.hash = '0xexclusive-block-100'
    await store.processBlock(firstMinute)

    const secondMinute = createBlockInput()
    secondMinute.logs = []
    secondMinute.block = {
      number: 101n,
      hash: '0xexclusive-block-101',
      parentHash: firstMinute.block.hash,
      timestamp: firstMinute.block.timestamp + 60,
    }
    secondMinute.trades[0].txHash = '0xexclusive-second'
    secondMinute.trades[0].blockNumber = 101n
    secondMinute.trades[0].blockHash = '0xexclusive-block-101'
    secondMinute.trades[0].timestamp = firstMinute.block.timestamp + 60
    await store.processBlock(secondMinute)

    const candles = await postgresCandleStore.getCandles(
      TEST_CHAIN_ID,
      TOKEN,
      firstMinute.block.timestamp,
      secondMinute.block.timestamp,
    )

    assert.equal(candles.length, 1)
    assert.equal(candles[0].time, firstMinute.block.timestamp)
    await cleanup()
  },
)

test(
  'removes a stale candle when its bucket has no canonical trades',
  { skip: !postgresPool || !db },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()

    const input = createBlockInput()
    input.logs = []
    await store.processBlock(input)

    await postgresPool!.query(
      'update market_trades set canonical = false where chain_id = $1',
      [TEST_CHAIN_ID],
    )
    await rebuildCandleBucket(db!, TEST_CHAIN_ID, {
      tokenAddress: TOKEN,
      bucketStart: new Date(input.block.timestamp * 1000),
    })

    const candles = await postgresPool!.query(
      'select count(*)::int as count from market_candles_1m where chain_id = $1',
      [TEST_CHAIN_ID],
    )
    assert.equal(candles.rows[0].count, 0)
    await cleanup()
  },
)

test(
  'does not advance checkpoint when a block transaction fails',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()
    await store.processBlock(createBlockInput())

    const conflicting = createBlockInput()
    conflicting.block.hash = '0xconflicting'
    conflicting.logs = []
    conflicting.trades = []

    await assert.rejects(store.processBlock(conflicting))
    const checkpoint = await store.getMarketCheckpointMetadata(TEST_CHAIN_ID, CURSOR)
    assert.equal(checkpoint.lastIndexedBlock, 100n)
    assert.equal(checkpoint.lastFinalizedBlock, 97n)
    await cleanup()
  },
)

test(
  'advances a scanned log range without persisting empty blocks',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()

    await store.advanceCheckpoint({
      chainId: TEST_CHAIN_ID,
      cursorKey: CURSOR,
      confirmationDepth: 3n,
      lastIndexedBlock: 101n,
    })

    const blocks = await postgresPool!.query(
      'select count(*)::int as count from chain_blocks where chain_id = $1',
      [TEST_CHAIN_ID],
    )
    const checkpoint = await store.getMarketCheckpointMetadata(TEST_CHAIN_ID, CURSOR)
    assert.equal(blocks.rows[0].count, 0)
    assert.equal(checkpoint.lastIndexedBlock, 101n)
    assert.equal(checkpoint.lastFinalizedBlock, 98n)
    await cleanup()
  },
)

test(
  'maps token metadata lookup to its formal factory checkpoint',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()

    await store.processBlock(createBlockInput())

    const checkpoint = await store.getMarketCheckpointMetadataByTokenAddress(
      TEST_CHAIN_ID,
      TOKEN,
    )
    assert.equal(checkpoint.lastIndexedBlock, 100n)
    assert.equal(checkpoint.lastFinalizedBlock, 97n)
    await cleanup()
  },
)

test(
  'stores formal Factory registration, fee facts, and graduation lifecycle',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()
    const input = createBlockInput()
    input.marketRegistrations = [
      {
        tokenAddress: TOKEN,
        marketAddress: CURSOR,
        creatorAddress: '0x0000000000000000000000000000000000000003',
        configVersion: 7n,
        name: 'Formal Token',
        symbol: 'FORMAL',
        tokenImage: 'ipfs://formal',
        description: 'formal market',
        blockNumber: 100n,
      },
    ]
    input.trades[0].platformFeeRaw = 200n
    input.trades[0].creatorFeeRaw = 50n
    input.lifecycleUpdates = [
      {
        tokenAddress: TOKEN,
        marketAddress: CURSOR,
        stage: 'dex_live',
        pairAddress: '0x0000000000000000000000000000000000000004',
        blockNumber: 100n,
        timestamp: input.block.timestamp,
      },
    ]

    await store.processBlock(input)

    const config = await store.getMarketConfigByTokenAddress(TEST_CHAIN_ID, TOKEN)
    const trade = await postgresPool!.query(
      `select platform_fee_raw::text, creator_fee_raw::text
       from market_trades where chain_id = $1 and token_address = $2`,
      [TEST_CHAIN_ID, TOKEN],
    )
    assert.equal(config?.factoryAddress, CURSOR)
    assert.equal(config?.marketAddress, CURSOR)
    assert.equal(config?.configVersion, '7')
    assert.equal(config?.stage, 'dex_live')
    assert.equal(trade.rows[0].platform_fee_raw, '200')
    assert.equal(trade.rows[0].creator_fee_raw, '50')
    await cleanup()
  },
)

test(
  'projects latest pool reserves into pools response',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()
    const input = createBlockInput()
    input.marketRegistrations = [
      {
        tokenAddress: TOKEN,
        marketAddress: CURSOR,
        creatorAddress: '0x0000000000000000000000000000000000000003',
        configVersion: 7n,
        name: 'Formal Token',
        symbol: 'FORMAL',
        tokenImage: 'ipfs://formal',
        description: 'formal market',
        blockNumber: 100n,
      },
    ]
    input.lifecycleUpdates = [
      {
        tokenAddress: TOKEN,
        marketAddress: CURSOR,
        stage: 'dex_live',
        pairAddress: '0x0000000000000000000000000000000000000004',
        blockNumber: 100n,
        timestamp: input.block.timestamp,
      },
    ]
    input.poolReserveUpdates = [
      {
        tokenAddress: TOKEN,
        marketAddress: CURSOR,
        pairAddress: '0x0000000000000000000000000000000000000004',
        tokenReserveRaw: 1_000_000n,
        quoteReserveRaw: 25_000n,
        liquidityQuoteRaw: 50_000n,
        quoteTokenAddress: '0x0000000000000000000000000000000000000005',
        blockNumber: 100n,
        blockHash: input.block.hash,
        transactionHash: '0xpool-sync',
        transactionIndex: 1,
        logIndex: 5,
        timestamp: input.block.timestamp,
      },
    ]

    await store.processBlock(input)

    const pools = await store.getPools(TEST_CHAIN_ID, input.block.timestamp + 60)
    assert.equal(pools.pools.length, 1)
    assert.equal(pools.pools[0].tokenReserve, '1000000')
    assert.equal(pools.pools[0].quoteReserve, '25000')
    assert.equal(pools.pools[0].liquidityQuote, '50000')
    assert.equal(pools.pools[0].reservesUpdatedAt, input.block.timestamp)

    const snapshots = await store.getPoolReserveSnapshots(
      TEST_CHAIN_ID,
      TOKEN,
      input.block.timestamp - 1,
      input.block.timestamp + 1,
    )
    assert.equal(snapshots.snapshots.length, 1)
    assert.equal(snapshots.snapshots[0].tokenReserve, '1000000')
    assert.equal(snapshots.snapshots[0].quoteReserve, '25000')
    await cleanup()
  },
)

test(
  'rebuilds latest pool reserves from canonical snapshots after rollback',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()

    const pairAddress = '0x0000000000000000000000000000000000000004'
    const quoteTokenAddress = '0x0000000000000000000000000000000000000005'
    const first = createBlockInput()
    first.logs = []
    first.trades = []
    first.marketRegistrations = [
      {
        tokenAddress: TOKEN,
        marketAddress: CURSOR,
        creatorAddress: '0x0000000000000000000000000000000000000003',
        configVersion: 7n,
        name: 'Formal Token',
        symbol: 'FORMAL',
        tokenImage: 'ipfs://formal',
        description: 'formal market',
        blockNumber: 100n,
      },
    ]
    first.lifecycleUpdates = [
      {
        tokenAddress: TOKEN,
        marketAddress: CURSOR,
        stage: 'dex_live',
        pairAddress,
        blockNumber: 100n,
        timestamp: first.block.timestamp,
      },
    ]
    first.poolReserveUpdates = [
      {
        tokenAddress: TOKEN,
        marketAddress: CURSOR,
        pairAddress,
        tokenReserveRaw: 1_000_000n,
        quoteReserveRaw: 25_000n,
        liquidityQuoteRaw: 50_000n,
        quoteTokenAddress,
        blockNumber: 100n,
        blockHash: first.block.hash,
        transactionHash: '0xpool-sync-100',
        transactionIndex: 1,
        logIndex: 5,
        timestamp: first.block.timestamp,
      },
    ]
    await store.processBlock(first)

    const second = createBlockInput()
    second.logs = []
    second.trades = []
    second.block = {
      number: 101n,
      hash: '0xpool-block-101',
      parentHash: first.block.hash,
      timestamp: first.block.timestamp + 60,
    }
    second.poolReserveUpdates = [
      {
        tokenAddress: TOKEN,
        marketAddress: CURSOR,
        pairAddress,
        tokenReserveRaw: 2_000_000n,
        quoteReserveRaw: 40_000n,
        liquidityQuoteRaw: 80_000n,
        quoteTokenAddress,
        blockNumber: 101n,
        blockHash: second.block.hash,
        transactionHash: '0xpool-sync-101',
        transactionIndex: 1,
        logIndex: 5,
        timestamp: second.block.timestamp,
      },
    ]
    await store.processBlock(second)

    const beforeRollback = await store.getPools(TEST_CHAIN_ID, second.block.timestamp)
    assert.equal(beforeRollback.pools[0].tokenReserve, '2000000')

    const rollback = await store.rollbackCanonicalFromBlock(TEST_CHAIN_ID, CURSOR, 101n)
    assert.deepEqual(rollback.affectedTokenAddresses, [TOKEN])

    const afterRollback = await store.getPools(TEST_CHAIN_ID, second.block.timestamp)
    assert.equal(afterRollback.pools[0].tokenReserve, '1000000')
    assert.equal(afterRollback.pools[0].quoteReserve, '25000')

    const snapshots = await store.getPoolReserveSnapshots(
      TEST_CHAIN_ID,
      TOKEN,
      first.block.timestamp - 1,
      second.block.timestamp + 1,
    )
    assert.equal(snapshots.snapshots.length, 1)
    assert.equal(snapshots.snapshots[0].transactionHash, '0xpool-sync-100')

    await cleanup()
  },
)

test(
  'returns recent canonical trades in descending order with cursor pagination',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()

    const first = createBlockInput()
    first.logs = []
    first.block = {
      number: 100n,
      hash: '0xtrades-block-100',
      parentHash: '0xtrades-block-99',
      timestamp: 1_710_000_000,
    }
    first.trades = [
      {
        ...createTrade(),
        txHash: '0xtrades-first',
        blockNumber: 100n,
        blockHash: '0xtrades-block-100',
        timestamp: 1_710_000_000,
        transactionIndex: 0,
        logIndex: 0,
        markPriceQuotePerTokenX18: 1_000n,
        executionPriceQuotePerTokenX18: 900n,
        quoteAmountGrossRaw: 5_000n,
        quoteAmountNetRaw: null,
        legacyVolumeSemantics: true,
      },
    ]
    await store.processBlock(first)

    const second = createBlockInput()
    second.logs = []
    second.block = {
      number: 101n,
      hash: '0xtrades-block-101',
      parentHash: '0xtrades-block-100',
      timestamp: 1_710_000_060,
    }
    second.trades = [
      {
        ...createTrade(),
        txHash: '0xtrades-second',
        blockNumber: 101n,
        blockHash: '0xtrades-block-101',
        timestamp: 1_710_000_060,
        transactionIndex: 0,
        logIndex: 0,
        side: 'sell',
        markPriceQuotePerTokenX18: 2_000n,
        executionPriceQuotePerTokenX18: 1_900n,
        quoteAmountGrossRaw: null,
        quoteAmountNetRaw: 7_000n,
        legacyVolumeSemantics: false,
      },
    ]
    await store.processBlock(second)

    const third = createBlockInput()
    third.logs = []
    third.block = {
      number: 102n,
      hash: '0xtrades-block-102',
      parentHash: '0xtrades-block-101',
      timestamp: 1_710_000_120,
    }
    third.trades = [
      {
        ...createTrade(),
        txHash: '0xtrades-third',
        blockNumber: 102n,
        blockHash: '0xtrades-block-102',
        timestamp: 1_710_000_120,
        transactionIndex: 0,
        logIndex: 0,
        side: 'buy',
        markPriceQuotePerTokenX18: 3_000n,
        executionPriceQuotePerTokenX18: 2_900n,
        quoteAmountGrossRaw: 9_000n,
        quoteAmountNetRaw: null,
        legacyVolumeSemantics: false,
      },
    ]
    await store.processBlock(third)

    await postgresPool!.query(
      `update market_trades
       set canonical = false
       where chain_id = $1 and transaction_hash = $2`,
      [TEST_CHAIN_ID, '0xtrades-first'],
    )

    const pageOne = await store.getRecentTradesByTokenAddress(TEST_CHAIN_ID, TOKEN, 1)
    assert.equal(pageOne.trades.length, 1)
    assert.equal(pageOne.trades[0].transactionHash, '0xtrades-third')
    assert.equal(pageOne.trades[0].confirmed, false)
    assert.equal(pageOne.trades[0].legacyVolumeSemantics, false)
    assert.equal(pageOne.trades[0].quoteAmount, '9000')
    assert.equal(typeof pageOne.nextCursor, 'string')

    const pageTwo = await store.getRecentTradesByTokenAddress(
      TEST_CHAIN_ID,
      TOKEN,
      1,
      pageOne.nextCursor,
    )
    assert.equal(pageTwo.trades.length, 1)
    assert.equal(pageTwo.trades[0].transactionHash, '0xtrades-second')
    assert.equal(pageTwo.trades[0].quoteAmount, '7000')
    assert.equal(pageTwo.nextCursor, null)
    await cleanup()
  },
)

test(
  'computes market summary from canonical trades using window reference prices',
  { skip: !postgresPool },
  async () => {
    const store = new PostgresMarketStore()
    await cleanup()

    await postgresPool!.query(
      `insert into token_markets (
        chain_id,
        token_address,
        bonding_curve_address,
        is_official,
        stage,
        pair_address,
        token_decimals,
        quote_decimals,
        created_at,
        updated_at
      )
      values ($1, $2, $3, true, 'bonding_curve_live', $4, 18, 18, now(), now())`,
      [TEST_CHAIN_ID, TOKEN, CURSOR, '0x0000000000000000000000000000000000000004'],
    )

    await postgresPool!.query(
      `insert into market_trades (
        chain_id,
        token_address,
        source,
        side,
        trader_address,
        mark_price_quote_per_token_x18,
        execution_price_quote_per_token_x18,
        token_amount_raw,
        quote_amount_gross_raw,
        quote_amount_net_raw,
        token_decimals,
        quote_decimals,
        transaction_hash,
        transaction_index,
        log_index,
        block_number,
        block_hash,
        block_timestamp,
        confirmed,
        canonical,
        legacy_volume_semantics
      ) values
        ($1, $2, 'bonding_curve', 'buy',  $3, '1000', '1000', '10', '100', null, 18, 18, '0xsummary-ref24h', 0, 0, '10', '0xsummary-block-10', to_timestamp($4), true,  true,  false),
        ($1, $2, 'bonding_curve', 'buy',  $3, '1500', '1500', '10', '200', null, 18, 18, '0xsummary-ref1h',  0, 0, '20', '0xsummary-block-20', to_timestamp($5), true,  true,  false),
        ($1, $2, 'bonding_curve', 'sell', $3, '2200', '2200', '10', null,  '300', 18, 18, '0xsummary-window-1',0, 0, '30', '0xsummary-block-30', to_timestamp($6), false, true,  true),
        ($1, $2, 'bonding_curve', 'buy',  $3, '2500', '2500', '10', '400', null, 18, 18, '0xsummary-window-2',0, 0, '31', '0xsummary-block-31', to_timestamp($7), false, true,  false),
        ($1, $2, 'bonding_curve', 'buy',  $3, '9999', '9999', '10', '500', null, 18, 18, '0xsummary-noncanonical',0,0,'32', '0xsummary-block-32', to_timestamp($7), false, false, false)
      `,
      [
        TEST_CHAIN_ID,
        TOKEN,
        '0x0000000000000000000000000000000000000003',
        1_699_900_000,
        1_709_996_300,
        1_709_999_000,
        1_709_999_900,
      ],
    )

    const summary = await store.getMarketSummaryByTokenAddress(
      TEST_CHAIN_ID,
      TOKEN,
      1_710_000_000,
    )
    assert.equal(summary.latestPrice, '2500')
    assert.equal(summary.priceChange1h, '1000')
    assert.equal(summary.priceChange24h, '1500')
    assert.equal(summary.priceChangePercent1h, '66666666')
    assert.equal(summary.priceChangePercent24h, '150000000')
    assert.equal(summary.high24h, '2500')
    assert.equal(summary.low24h, '1500')
    assert.equal(summary.volume24h, '600')
    assert.equal(summary.volume24hComplete, false)
    assert.equal(summary.tradeCount24h, 3)
    assert.equal(summary.marketStage, 'dex_live')
    assert.equal(summary.pairAddress, '0x0000000000000000000000000000000000000004')
    assert.equal(summary.lastTradeAt, 1_709_999_900)

    await postgresPool!.query('delete from market_trades where chain_id = $1', [
      TEST_CHAIN_ID,
    ])
    await postgresPool!.query(
      `insert into market_trades (
        chain_id,
        token_address,
        source,
        side,
        trader_address,
        mark_price_quote_per_token_x18,
        execution_price_quote_per_token_x18,
        token_amount_raw,
        quote_amount_gross_raw,
        quote_amount_net_raw,
        token_decimals,
        quote_decimals,
        transaction_hash,
        transaction_index,
        log_index,
        block_number,
        block_hash,
        block_timestamp,
        confirmed,
        canonical,
        legacy_volume_semantics
      ) values
        ($1, $2, 'bonding_curve', 'buy', $3, '1000', '1000', '10', '100', null, 18, 18, '0xsummary-young-first', 0, 0, '40', '0xsummary-young-block-40', to_timestamp($4), true, true, false),
        ($1, $2, 'bonding_curve', 'buy', $3, '1250', '1250', '10', '100', null, 18, 18, '0xsummary-young-latest', 0, 0, '41', '0xsummary-young-block-41', to_timestamp($5), true, true, false)`,
      [
        TEST_CHAIN_ID,
        TOKEN,
        '0x0000000000000000000000000000000000000003',
        1_709_999_000,
        1_709_999_900,
      ],
    )
    const youngMarketSummary = await store.getMarketSummaryByTokenAddress(
      TEST_CHAIN_ID,
      TOKEN,
      1_710_000_000,
    )
    assert.equal(youngMarketSummary.priceChange24h, '250')
    assert.equal(youngMarketSummary.priceChangePercent24h, '25000000')

    await postgresPool!.query('delete from market_trades where chain_id = $1', [
      TEST_CHAIN_ID,
    ])
    const noReferenceSummary = await store.getMarketSummaryByTokenAddress(
      TEST_CHAIN_ID,
      TOKEN,
      1_710_000_000,
    )
    assert.equal(noReferenceSummary.latestPrice, null)
    assert.equal(noReferenceSummary.priceChangePercent1h, null)
    assert.equal(noReferenceSummary.priceChangePercent24h, null)
    assert.equal(noReferenceSummary.volume24h, '0')
    assert.equal(noReferenceSummary.tradeCount24h, 0)

    await postgresPool!.query(
      'update token_markets set initial_price_x18 = $1 where chain_id = $2 and token_address = $3',
      ['500', TEST_CHAIN_ID, TOKEN],
    )
    await postgresPool!.query(
      `insert into market_trades (
        chain_id,
        token_address,
        source,
        side,
        trader_address,
        mark_price_quote_per_token_x18,
        execution_price_quote_per_token_x18,
        token_amount_raw,
        quote_amount_gross_raw,
        quote_amount_net_raw,
        token_decimals,
        quote_decimals,
        transaction_hash,
        transaction_index,
        log_index,
        block_number,
        block_hash,
        block_timestamp,
        confirmed,
        canonical,
        legacy_volume_semantics
      ) values
        ($1, $2, 'bonding_curve', 'buy', $3, '1250', '1250', '10', '100', null, 18, 18, '0xsummary-single-graduation', 0, 0, '42', '0xsummary-single-block-42', to_timestamp($4), true, true, false)`,
      [
        TEST_CHAIN_ID,
        TOKEN,
        '0x0000000000000000000000000000000000000003',
        1_709_999_900,
      ],
    )
    const singleTradeSummary = await store.getMarketSummaryByTokenAddress(
      TEST_CHAIN_ID,
      TOKEN,
      1_710_000_000,
    )
    assert.equal(singleTradeSummary.priceChange24h, '750')
    assert.equal(singleTradeSummary.priceChangePercent24h, '150000000')

    await cleanup()
  },
)
