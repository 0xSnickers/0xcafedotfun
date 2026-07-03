import {
  Candle1m,
  NormalizedTrade,
  StoredCandle1m,
  StoredTrade,
} from '../types/market'

export const ONE_MINUTE_SECONDS = 60

export function getMinuteBucket(timestamp: number): number {
  return Math.floor(timestamp / ONE_MINUTE_SECONDS) * ONE_MINUTE_SECONDS
}

export function aggregateTrade(
  current: Candle1m | null,
  trade: NormalizedTrade,
): Candle1m {
  const time = getMinuteBucket(trade.timestamp)

  if (!current) {
    return {
      time,
      openWei: trade.priceWei,
      highWei: trade.priceWei,
      lowWei: trade.priceWei,
      closeWei: trade.priceWei,
      volumeWei: trade.quoteAmountWei,
      volumeTokenRaw: trade.tokenAmountRaw,
      tradeCount: 1,
    }
  }

  if (current.time !== time) {
    throw new Error('Cannot aggregate a trade into a different minute bucket')
  }

  return {
    ...current,
    highWei: current.highWei > trade.priceWei ? current.highWei : trade.priceWei,
    lowWei: current.lowWei < trade.priceWei ? current.lowWei : trade.priceWei,
    closeWei: trade.priceWei,
    volumeWei: current.volumeWei + trade.quoteAmountWei,
    volumeTokenRaw: current.volumeTokenRaw + trade.tokenAmountRaw,
    tradeCount: current.tradeCount + 1,
  }
}

export function serializeTrade(trade: NormalizedTrade): StoredTrade {
  return {
    ...trade,
    priceWei: trade.priceWei.toString(),
    tokenAmountRaw: trade.tokenAmountRaw.toString(),
    quoteAmountWei: trade.quoteAmountWei.toString(),
    blockNumber: trade.blockNumber.toString(),
  }
}

export function serializeCandle(candle: Candle1m): StoredCandle1m {
  return {
    ...candle,
    openWei: candle.openWei.toString(),
    highWei: candle.highWei.toString(),
    lowWei: candle.lowWei.toString(),
    closeWei: candle.closeWei.toString(),
    volumeWei: candle.volumeWei.toString(),
    volumeTokenRaw: candle.volumeTokenRaw.toString(),
  }
}

export function deserializeCandle(candle: StoredCandle1m): Candle1m {
  return {
    ...candle,
    openWei: BigInt(candle.openWei),
    highWei: BigInt(candle.highWei),
    lowWei: BigInt(candle.lowWei),
    closeWei: BigInt(candle.closeWei),
    volumeWei: BigInt(candle.volumeWei),
    volumeTokenRaw: BigInt(candle.volumeTokenRaw),
  }
}
