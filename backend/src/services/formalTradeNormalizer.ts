import { IndexedTrade, TradeSide } from '../types/market'

const TOKEN_DECIMALS = 18
const QUOTE_DECIMALS = 18

export interface FormalTradeInput {
  eventName: 'TokenBought' | 'TokenSold'
  tokenAddress: string
  marketAddress: string
  traderAddress: string
  tokenAmount: bigint
  grossEthAmount: bigint
  netEthAmount: bigint
  platformFee: bigint
  creatorFee: bigint
  executionPriceX18: bigint
  markPriceX18: bigint
  transactionHash: string
  transactionIndex: number
  logIndex: number
  blockNumber: bigint
  blockHash: string
  timestamp: number
}

export function normalizeFormalTrade(input: FormalTradeInput): IndexedTrade {
  const side: TradeSide = input.eventName === 'TokenBought' ? 'buy' : 'sell'

  return {
    tokenAddress: input.tokenAddress.toLowerCase(),
    marketAddress: input.marketAddress.toLowerCase(),
    source: 'bonding_curve',
    side,
    priceWei: input.markPriceX18,
    tokenAmountRaw: input.tokenAmount,
    quoteAmountWei: input.grossEthAmount,
    txHash: input.transactionHash.toLowerCase(),
    logIndex: input.logIndex,
    blockNumber: input.blockNumber,
    timestamp: input.timestamp,
    traderAddress: input.traderAddress.toLowerCase(),
    blockHash: input.blockHash.toLowerCase(),
    transactionIndex: input.transactionIndex,
    tokenDecimals: TOKEN_DECIMALS,
    quoteDecimals: QUOTE_DECIMALS,
    markPriceQuotePerTokenX18: input.markPriceX18,
    executionPriceQuotePerTokenX18: input.executionPriceX18,
    quoteAmountGrossRaw: input.grossEthAmount,
    quoteAmountNetRaw: input.netEthAmount,
    creatorFeeRaw: input.creatorFee,
    platformFeeRaw: input.platformFee,
    reserveDeltaAmountRaw: side === 'buy' ? input.netEthAmount : input.grossEthAmount,
    reserveDeltaDirection: side === 'buy' ? 'increase' : 'decrease',
    legacyVolumeSemantics: false,
  }
}
