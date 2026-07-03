export type TradeSide = 'buy' | 'sell'

export interface NormalizedTrade {
  tokenAddress: string
  source: 'bonding_curve' | 'uniswap_v2'
  side: TradeSide
  priceWei: bigint
  tokenAmountRaw: bigint
  quoteAmountWei: bigint
  txHash: string
  logIndex: number
  blockNumber: bigint
  timestamp: number
}

export interface IndexedTrade extends NormalizedTrade {
  marketAddress: string
  pairAddress?: string | null
  traderAddress: string
  blockHash: string
  transactionIndex: number
  tokenDecimals: number
  quoteDecimals: number
  markPriceQuotePerTokenX18: bigint
  executionPriceQuotePerTokenX18: bigint | null
  quoteAmountGrossRaw: bigint | null
  quoteAmountNetRaw: bigint | null
  creatorFeeRaw: bigint | null
  platformFeeRaw: bigint | null
  reserveDeltaAmountRaw: bigint
  reserveDeltaDirection: 'increase' | 'decrease'
  legacyVolumeSemantics: boolean
}

export interface StoredTrade {
  tokenAddress: string
  source: 'bonding_curve' | 'uniswap_v2'
  side: TradeSide
  priceWei: string
  tokenAmountRaw: string
  quoteAmountWei: string
  txHash: string
  logIndex: number
  blockNumber: string
  timestamp: number
}

export interface Candle1m {
  time: number
  openWei: bigint
  highWei: bigint
  lowWei: bigint
  closeWei: bigint
  volumeWei: bigint
  volumeTokenRaw: bigint
  tradeCount: number
}

export interface StoredCandle1m {
  time: number
  openWei: string
  highWei: string
  lowWei: string
  closeWei: string
  volumeWei: string
  volumeTokenRaw: string
  tradeCount: number
}

export interface TradingViewCandlesResponse {
  s: 'ok' | 'no_data'
  t?: number[]
  o?: string[]
  h?: string[]
  l?: string[]
  c?: string[]
  v?: string[]
  volumeQuoteGrossComplete?: boolean[]
  visualAnchor?: {
    time: number
    price: string
  } | null
  lastIndexedBlock?: string | null
  lastConfirmedBlock?: string | null
}

export interface MarketTradeItem {
  id: string
  side: TradeSide
  source: 'bonding_curve' | 'uniswap_v2'
  marketAddress: string | null
  trader: string | null
  executionPrice: string | null
  markPrice: string
  tokenAmount: string
  quoteAmount: string | null
  quoteAmountGross: string | null
  quoteAmountNet: string | null
  creatorFee: string | null
  platformFee: string | null
  transactionHash: string
  timestamp: number
  confirmed: boolean
  legacyVolumeSemantics: boolean
}

export interface MarketTradesResponse {
  trades: MarketTradeItem[]
  nextCursor: string | null
}

export interface MarketHolderItem {
  address: string
  balance: string
  firstBuyAt: number | null
  lastTradeAt: number
  buyCount: number
  sellCount: number
  totalBought: string
  totalSold: string
}

export interface MarketHoldersResponse {
  holders: MarketHolderItem[]
}

export interface MarketSummaryResponse {
  latestPrice: string | null
  priceChange1h: string | null
  priceChange24h: string | null
  priceChangePercent1h: string | null
  priceChangePercent24h: string | null
  high24h: string | null
  low24h: string | null
  volume24h: string
  volume24hComplete: boolean
  tradeCount24h: number
  marketStage: 'bonding_curve_live' | 'graduated_pending_liquidity' | 'dex_live' | null
  pairAddress: string | null
  liquidityQuote: string | null
  lastTradeAt: number | null
}

export interface MarketListItem {
  tokenAddress: string
  marketAddress: string
  creatorAddress: string | null
  name: string | null
  symbol: string | null
  tokenImage: string | null
  description: string | null
  stage: 'bonding_curve_live' | 'graduated_pending_liquidity' | 'dex_live'
  pairAddress: string | null
  currentPrice: string
  currentMarketCap: string
  priceChangePercent24h: string | null
  volume24h: string
  volume24hComplete: boolean
  tradeCount24h: number
  createdAt: number | null
  lastTradeAt: number | null
}

export interface MarketListResponse {
  markets: MarketListItem[]
}

export interface PoolListItem {
  tokenAddress: string
  marketAddress: string
  name: string | null
  symbol: string | null
  tokenImage: string | null
  description: string | null
  stage: 'graduated_pending_liquidity' | 'dex_live'
  pairAddress: string | null
  quoteTokenAddress: string | null
  latestPrice: string | null
  tokenReserve: string | null
  quoteReserve: string | null
  liquidityQuote: string | null
  priceChangePercent24h: string | null
  volume24h: string
  volume24hComplete: boolean
  tradeCount24h: number
  graduatedAt: number | null
  dexLiveAt: number | null
  reservesUpdatedAt: number | null
  lastTradeAt: number | null
}

export interface PoolsResponse {
  pools: PoolListItem[]
}

export interface PoolReserveSnapshotItem {
  tokenAddress: string
  marketAddress: string
  pairAddress: string
  quoteTokenAddress: string | null
  tokenReserve: string
  quoteReserve: string
  liquidityQuote: string
  blockNumber: string
  transactionHash: string
  timestamp: number
}

export interface PoolReserveSnapshotsResponse {
  snapshots: PoolReserveSnapshotItem[]
}
