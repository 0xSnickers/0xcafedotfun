import {
  createPollingSubscription,
  createUdfCompatibleDatafeed,
  fetchSegmentedHistory,
} from '@snk-tradingview-lib/core';
import type {
  DatafeedBar,
  GetBarsInput,
  MarketDataAdapter,
  SymbolInfoInput,
} from '@snk-tradingview-lib/core';
import { getCandles } from '@/lib/marketApi';
import { debugWarn } from '@/lib/debugLog';
import { MARKET_POLL_INTERVAL_MS } from '@/lib/marketPolling';

const SUPPORTED_RESOLUTIONS = ['1', '5', '15', '60'];
const SOURCE_RESOLUTION = '1';
const MAX_BARS_PER_REQUEST = 500;
const MAX_HISTORY_REQUESTS = 10;
const SECONDS_PER_DAY = 24 * 60 * 60;
const PRICE_SCALE_DECIMALS = 10_000_000;

export interface MarketTradingViewDatafeedOptions {
  tokenAddress: string;
  symbol?: string;
}

function getDisplaySymbol(symbol?: string) {
  return `${symbol?.trim() || 'TOKEN'}/ETH`;
}

function toDatafeedBar(candle: {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}): DatafeedBar {
  return {
    time: candle.time * 1000,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

function getFallbackFromTimestamp(input: GetBarsInput) {
  if (input.from > 0) {
    return input.from;
  }

  const to = input.to > 0 ? input.to : Math.floor(Date.now() / 1000);
  return Math.max(0, to - SECONDS_PER_DAY * 7);
}

async function fetchMarketBars(tokenAddress: string, input: GetBarsInput) {
  const from = getFallbackFromTimestamp(input);
  const to = input.to > 0 ? input.to : Math.floor(Date.now() / 1000);

  let candleBars: DatafeedBar[] = [];
  try {
    const candles = await getCandles(tokenAddress, from, to);
    candleBars = candles.map(toDatafeedBar);
  } catch (error) {
    debugWarn('Failed to load candle history:', {
      tokenAddress,
      from,
      to,
      error,
    });
  }

  return {
    bars: candleBars,
    noData: candleBars.length === 0,
    earliestBarTime: candleBars[0]?.time,
  };
}

export function createMarketTradingViewDatafeed({
  tokenAddress,
  symbol,
}: MarketTradingViewDatafeedOptions) {
  const displaySymbol = getDisplaySymbol(symbol);

  const adapter: MarketDataAdapter = {
    getConfiguration() {
      return {
        supported_resolutions: SUPPORTED_RESOLUTIONS,
        supports_time: false,
        supports_search: false,
      };
    },

    async getSymbolInfo(symbolName: string): Promise<SymbolInfoInput> {
      const name = symbolName || displaySymbol;

      return {
        name,
        ticker: tokenAddress,
        description: `${name} on 0xcafe.fun`,
        session: '24x7',
        timezone: 'Etc/UTC',
        exchange: '0XCAFE',
        listed_exchange: '0XCAFE',
        minmov: 1,
        pricescale: PRICE_SCALE_DECIMALS,
        has_intraday: true,
        has_daily: false,
        has_weekly_and_monthly: false,
        volume_precision: 8,
        supported_resolutions: SUPPORTED_RESOLUTIONS,
        format: 'price',
        type: 'crypto',
      };
    },

    async getBars(input: GetBarsInput) {
      return fetchSegmentedHistory(
        (segmentInput) => fetchMarketBars(tokenAddress, segmentInput),
        input,
        {
          sourceResolution: SOURCE_RESOLUTION,
          maxBarsPerRequest: MAX_BARS_PER_REQUEST,
          maxRequests: MAX_HISTORY_REQUESTS,
        },
      );
    },

    subscribeBars(input, callbacks) {
      return createPollingSubscription({
        intervalMs: MARKET_POLL_INTERVAL_MS,
        callbacks,
        getLatestBar: async () => {
          const now = Math.floor(Date.now() / 1000);
          const result = await fetchSegmentedHistory(
            (segmentInput) => fetchMarketBars(tokenAddress, segmentInput),
            {
              ...input,
              from: Math.max(0, now - SECONDS_PER_DAY),
              to: now,
              countBack: 2,
              firstDataRequest: false,
            },
            {
              sourceResolution: SOURCE_RESOLUTION,
              maxBarsPerRequest: MAX_BARS_PER_REQUEST,
              maxRequests: 4,
            },
          );
          return result.bars[result.bars.length - 1] ?? null;
        },
        shouldResetCache: (previousBar, nextBar) => (
          Boolean(previousBar && previousBar.time !== nextBar.time)
        ),
      });
    },
  };

  const datafeed = createUdfCompatibleDatafeed(adapter);
  const originalOnReady = datafeed.onReady.bind(datafeed);

  return {
    datafeed: {
      ...datafeed,
      onReady(callback: Parameters<typeof datafeed.onReady>[0]) {
        window.setTimeout(() => originalOnReady(callback), 0);
      },
    },
    symbol: displaySymbol,
  };
}
