import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FormalTradeInput,
  normalizeFormalTrade,
} from './formalTradeNormalizer'

function createInput(
  overrides: Partial<FormalTradeInput> = {},
): FormalTradeInput {
  return {
    eventName: 'TokenBought',
    tokenAddress: '0x0000000000000000000000000000000000000001',
    marketAddress: '0x0000000000000000000000000000000000000002',
    traderAddress: '0x0000000000000000000000000000000000000003',
    tokenAmount: 1_000n,
    grossEthAmount: 1_012_500n,
    netEthAmount: 1_000_000n,
    platformFee: 10_000n,
    creatorFee: 2_500n,
    executionPriceX18: 1_000n,
    markPriceX18: 1_100n,
    transactionHash: '0x01',
    transactionIndex: 2,
    logIndex: 3,
    blockNumber: 10n,
    blockHash: '0x10',
    timestamp: 1_710_000_000,
    ...overrides,
  }
}

test('normalizes formal buy with complete gross, net and fee facts', () => {
  const trade = normalizeFormalTrade(createInput())

  assert.equal(trade.side, 'buy')
  assert.equal(trade.quoteAmountGrossRaw, 1_012_500n)
  assert.equal(trade.quoteAmountNetRaw, 1_000_000n)
  assert.equal(trade.platformFeeRaw, 10_000n)
  assert.equal(trade.creatorFeeRaw, 2_500n)
  assert.equal(trade.reserveDeltaAmountRaw, 1_000_000n)
  assert.equal(trade.reserveDeltaDirection, 'increase')
  assert.equal(trade.legacyVolumeSemantics, false)
})

test('normalizes formal sell without reconstructing event amounts', () => {
  const trade = normalizeFormalTrade(
    createInput({
      eventName: 'TokenSold',
      grossEthAmount: 1_000_000n,
      netEthAmount: 987_500n,
    }),
  )

  assert.equal(trade.side, 'sell')
  assert.equal(trade.quoteAmountGrossRaw, 1_000_000n)
  assert.equal(trade.quoteAmountNetRaw, 987_500n)
  assert.equal(trade.reserveDeltaAmountRaw, 1_000_000n)
  assert.equal(trade.reserveDeltaDirection, 'decrease')
})
