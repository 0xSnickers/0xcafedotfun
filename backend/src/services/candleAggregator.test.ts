import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateTrade, getMinuteBucket } from './candleAggregator'
import { NormalizedTrade } from '../types/market'

function createTrade(overrides: Partial<NormalizedTrade> = {}): NormalizedTrade {
  return {
    tokenAddress: '0x0000000000000000000000000000000000000001',
    source: 'bonding_curve',
    side: 'buy',
    priceWei: 2_000_000_000_000n,
    tokenAmountRaw: 100_000_000_000_000_000_000n,
    quoteAmountWei: 200_000_000_000_000_000n,
    txHash: '0x01',
    logIndex: 0,
    blockNumber: 1n,
    timestamp: 1710000001,
    ...overrides,
  }
}

test('creates the first candle in a minute bucket', () => {
  const trade = createTrade()
  const candle = aggregateTrade(null, trade)

  assert.equal(candle.time, getMinuteBucket(trade.timestamp))
  assert.equal(candle.openWei, trade.priceWei)
  assert.equal(candle.highWei, trade.priceWei)
  assert.equal(candle.lowWei, trade.priceWei)
  assert.equal(candle.closeWei, trade.priceWei)
  assert.equal(candle.volumeWei, trade.quoteAmountWei)
  assert.equal(candle.tradeCount, 1)
})

test('updates the current minute candle without losing bigint precision', () => {
  const first = createTrade()
  const second = createTrade({
    priceWei: 2_500_000_000_000n,
    tokenAmountRaw: 99_999_999_999_999_999_999n,
    quoteAmountWei: 333_333_333_333_333_333n,
    logIndex: 1,
  })

  const candle = aggregateTrade(aggregateTrade(null, first), second)

  assert.equal(candle.openWei, first.priceWei)
  assert.equal(candle.highWei, second.priceWei)
  assert.equal(candle.lowWei, first.priceWei)
  assert.equal(candle.closeWei, second.priceWei)
  assert.equal(candle.volumeWei, first.quoteAmountWei + second.quoteAmountWei)
  assert.equal(candle.volumeTokenRaw, first.tokenAmountRaw + second.tokenAmountRaw)
  assert.equal(candle.tradeCount, 2)
})

test('rejects aggregation into a different minute bucket', () => {
  const first = createTrade()
  const nextMinute = createTrade({ timestamp: first.timestamp + 60 })

  assert.throws(
    () => aggregateTrade(aggregateTrade(null, first), nextMinute),
    /different minute bucket/,
  )
})
