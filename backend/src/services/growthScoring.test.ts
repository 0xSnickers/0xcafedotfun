import assert from 'node:assert/strict'
import test from 'node:test'
import { scoreGrowthTrade } from './growthScoring'

const base = {
  grossQuoteRaw: 1_000_000_000_000_000n,
  traderAddress: '0x0000000000000000000000000000000000000001',
  creatorAddress: '0x0000000000000000000000000000000000000002',
  side: 'buy' as const,
  secondsSincePreviousOppositeTrade: null,
  distinctTradingDays: 2,
  distinctMarkets: 3,
}

test('rewards participation, independent days and market diversity', () => {
  assert.deepEqual(scoreGrowthTrade(base), {
    points: 23,
    riskFlags: [],
    eligible: true,
  })
})

test('rejects creator self-trading, dust and rapid round trips', () => {
  const result = scoreGrowthTrade({
    ...base,
    grossQuoteRaw: 1n,
    traderAddress: base.creatorAddress,
    secondsSincePreviousOppositeTrade: 60,
  })
  assert.equal(result.eligible, false)
  assert.equal(result.points, 0)
  assert.deepEqual(result.riskFlags, [
    'dust_trade',
    'creator_self_trade',
    'rapid_round_trip',
  ])
})
