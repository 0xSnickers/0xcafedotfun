import { IndexedTrade, TradeSide } from '../types/market'

const TOKEN_DECIMALS = 18
const QUOTE_DECIMALS = 18
const X18 = 1_000_000_000_000_000_000n

export interface DexSwapTradeInput {
  tokenAddress: string
  marketAddress: string
  pairAddress: string
  token0: string
  token1: string
  wethAddress: string
  senderAddress: string
  recipientAddress: string
  amount0In: bigint
  amount1In: bigint
  amount0Out: bigint
  amount1Out: bigint
  transactionHash: string
  transactionIndex: number
  logIndex: number
  blockNumber: bigint
  blockHash: string
  timestamp: number
}

function normalizeAddress(value: string): string {
  return value.toLowerCase()
}

function getExecutionPriceX18(quoteAmount: bigint, tokenAmount: bigint): bigint {
  if (tokenAmount === 0n) {
    throw new Error('DEX swap token amount is zero')
  }
  return (quoteAmount * X18) / tokenAmount
}

export function normalizeDexSwapTrade(input: DexSwapTradeInput): IndexedTrade {
  const tokenAddress = normalizeAddress(input.tokenAddress)
  const token0 = normalizeAddress(input.token0)
  const token1 = normalizeAddress(input.token1)
  const wethAddress = normalizeAddress(input.wethAddress)

  const tokenIsToken0 = token0 === tokenAddress
  const wethIsToken0 = token0 === wethAddress
  if (!((tokenIsToken0 && token1 === wethAddress) || (wethIsToken0 && token1 === tokenAddress))) {
    throw new Error('DEX pair token order does not match token/WETH')
  }

  const tokenIn = tokenIsToken0 ? input.amount0In : input.amount1In
  const tokenOut = tokenIsToken0 ? input.amount0Out : input.amount1Out
  const quoteIn = wethIsToken0 ? input.amount0In : input.amount1In
  const quoteOut = wethIsToken0 ? input.amount0Out : input.amount1Out

  let side: TradeSide
  let tokenAmount: bigint
  let quoteAmount: bigint
  if (quoteIn > 0n && tokenOut > 0n) {
    side = 'buy'
    tokenAmount = tokenOut
    quoteAmount = quoteIn
  } else if (tokenIn > 0n && quoteOut > 0n) {
    side = 'sell'
    tokenAmount = tokenIn
    quoteAmount = quoteOut
  } else {
    throw new Error('DEX swap does not contain a token/WETH exact-input trade')
  }

  const executionPriceX18 = getExecutionPriceX18(quoteAmount, tokenAmount)

  return {
    tokenAddress,
    marketAddress: normalizeAddress(input.marketAddress),
    pairAddress: normalizeAddress(input.pairAddress),
    source: 'uniswap_v2',
    side,
    priceWei: executionPriceX18,
    tokenAmountRaw: tokenAmount,
    quoteAmountWei: quoteAmount,
    txHash: input.transactionHash.toLowerCase(),
    logIndex: input.logIndex,
    blockNumber: input.blockNumber,
    timestamp: input.timestamp,
    traderAddress: normalizeAddress(input.recipientAddress || input.senderAddress),
    blockHash: input.blockHash.toLowerCase(),
    transactionIndex: input.transactionIndex,
    tokenDecimals: TOKEN_DECIMALS,
    quoteDecimals: QUOTE_DECIMALS,
    markPriceQuotePerTokenX18: executionPriceX18,
    executionPriceQuotePerTokenX18: executionPriceX18,
    quoteAmountGrossRaw: quoteAmount,
    quoteAmountNetRaw: quoteAmount,
    creatorFeeRaw: 0n,
    platformFeeRaw: 0n,
    reserveDeltaAmountRaw: quoteAmount,
    reserveDeltaDirection: side === 'buy' ? 'increase' : 'decrease',
    legacyVolumeSemantics: false,
  }
}
