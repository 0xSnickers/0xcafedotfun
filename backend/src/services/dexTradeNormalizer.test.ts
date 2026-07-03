import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DexSwapTradeInput,
  normalizeDexSwapTrade,
} from './dexTradeNormalizer'

const TOKEN = '0x0000000000000000000000000000000000000001'
const MARKET = '0x0000000000000000000000000000000000000002'
const PAIR = '0x0000000000000000000000000000000000000003'
const WETH = '0x0000000000000000000000000000000000000004'
const TRADER = '0x0000000000000000000000000000000000000005'

function createInput(overrides: Partial<DexSwapTradeInput> = {}): DexSwapTradeInput {
  return {
    tokenAddress: TOKEN,
    marketAddress: MARKET,
    pairAddress: PAIR,
    token0: WETH,
    token1: TOKEN,
    wethAddress: WETH,
    senderAddress: '0x0000000000000000000000000000000000000006',
    recipientAddress: TRADER,
    amount0In: 2_000n,
    amount1In: 0n,
    amount0Out: 0n,
    amount1Out: 1_000n,
    transactionHash: '0xswap',
    transactionIndex: 7,
    logIndex: 9,
    blockNumber: 12n,
    blockHash: '0xblock',
    timestamp: 1_710_000_000,
    ...overrides,
  }
}

test('normalizes DEX buy when WETH is token0', () => {
  const trade = normalizeDexSwapTrade(createInput())

  assert.equal(trade.source, 'uniswap_v2')
  assert.equal(trade.side, 'buy')
  assert.equal(trade.tokenAmountRaw, 1_000n)
  assert.equal(trade.quoteAmountGrossRaw, 2_000n)
  assert.equal(trade.quoteAmountNetRaw, 2_000n)
  assert.equal(trade.markPriceQuotePerTokenX18, 2_000_000_000_000_000_000n)
  assert.equal(trade.executionPriceQuotePerTokenX18, 2_000_000_000_000_000_000n)
  assert.equal(trade.reserveDeltaDirection, 'increase')
  assert.equal(trade.pairAddress, PAIR)
  assert.equal(trade.traderAddress, TRADER)
})

test('normalizes DEX sell when token is token0', () => {
  const trade = normalizeDexSwapTrade(
    createInput({
      token0: TOKEN,
      token1: WETH,
      amount0In: 1_000n,
      amount1In: 0n,
      amount0Out: 0n,
      amount1Out: 1_500n,
    }),
  )

  assert.equal(trade.side, 'sell')
  assert.equal(trade.tokenAmountRaw, 1_000n)
  assert.equal(trade.quoteAmountGrossRaw, 1_500n)
  assert.equal(trade.reserveDeltaDirection, 'decrease')
  assert.equal(trade.markPriceQuotePerTokenX18, 1_500_000_000_000_000_000n)
})

test('rejects swaps that do not match the token/WETH pair', () => {
  assert.throws(
    () =>
      normalizeDexSwapTrade(
        createInput({
          token0: '0x00000000000000000000000000000000000000aa',
          token1: TOKEN,
        }),
      ),
    /token order/,
  )
})
