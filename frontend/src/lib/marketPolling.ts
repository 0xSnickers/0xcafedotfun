import { getCandles, MarketCandle } from './marketApi';

export const MARKET_POLL_INTERVAL_MS = 5_000;
const INITIAL_RANGE_SECONDS = 7 * 24 * 60 * 60;
const CANDLE_OVERLAP_SECONDS = 60;

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

export function loadInitialCandles(
  tokenAddress: string,
  signal?: AbortSignal,
): Promise<MarketCandle[]> {
  const to = unixNow();
  return getCandles(tokenAddress, to - INITIAL_RANGE_SECONDS, to, signal);
}

export function loadLatestCandles(
  tokenAddress: string,
  latestCandleTime: number | null,
  signal?: AbortSignal,
): Promise<MarketCandle[]> {
  const to = unixNow();
  const earliestAllowed = to - INITIAL_RANGE_SECONDS;
  const from = latestCandleTime === null
    ? earliestAllowed
    : Math.max(earliestAllowed, latestCandleTime - CANDLE_OVERLAP_SECONDS);
  return getCandles(tokenAddress, from, to, signal);
}
