'use client';

import { useEffect, useMemo, useState } from 'react';
import { TradingViewChart as SnkTradingViewChart } from '@snk-tradingview-lib/react';
import type { ChartController } from '@snk-tradingview-lib/core';
import { createMarketTradingViewDatafeed } from '@/lib/market/tradingViewDatafeed';

interface TradingViewChartProps {
  tokenAddress: string;
  symbol?: string;
  refreshSignal?: number;
}

const CHART_RESOLUTIONS = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '1h', value: '60' },
] as const;

export default function TradingViewChart({
  tokenAddress,
  symbol,
  refreshSignal = 0,
}: TradingViewChartProps) {
  const [interval, setInterval] = useState('1');
  const chartKey = `${tokenAddress}:${symbol ?? ''}`;

  return (
    <div className="terminal-chart-shell">
      <div className="terminal-chart-toolbar">
        <div>
          <div className="terminal-chart-pair">{symbol || 'Token'} / ETH</div>
          <div className="terminal-chart-subtitle">TradingView · Onchain</div>
        </div>
        <div className="terminal-chart-controls">
          <div>
            {CHART_RESOLUTIONS.map((resolution) => (
              <button
                key={resolution.value}
                type="button"
                onClick={() => setInterval(resolution.value)}
                className={`terminal-time-button ${
                  interval === resolution.value ? 'is-active' : ''
                }`}
              >
                {resolution.label}
              </button>
            ))}
          </div>
          <span>ETH</span>
          <span>0xcafe</span>
        </div>
      </div>

      <TradingViewChartCanvas
        key={chartKey}
        interval={interval}
        refreshSignal={refreshSignal}
        symbol={symbol}
        tokenAddress={tokenAddress}
      />
    </div>
  );
}

interface TradingViewChartCanvasProps {
  interval: string;
  refreshSignal: number;
  symbol?: string;
  tokenAddress: string;
}

function TradingViewChartCanvas({
  interval,
  refreshSignal,
  symbol,
  tokenAddress,
}: TradingViewChartCanvasProps) {
  const [controller, setController] = useState<ChartController | null>(null);
  const [chartReady, setChartReady] = useState(false);

  const chartData = useMemo(
    () => createMarketTradingViewDatafeed({ tokenAddress, symbol }),
    [symbol, tokenAddress],
  );

  useEffect(() => {
    if (chartReady) {
      return;
    }

    const fallbackTimer = window.setTimeout(() => setChartReady(true), 3_500);
    return () => window.clearTimeout(fallbackTimer);
  }, [chartReady]);

  useEffect(() => {
    if (refreshSignal > 0) {
      controller?.resetData();
    }
  }, [controller, refreshSignal]);

  return (
    <>
      <div className="terminal-chart-canvas">
        <SnkTradingViewChart
          symbol={chartData.symbol}
          interval={interval}
          theme="Dark"
          preset="minimal"
          libraryPath="/tradingview/charting_library/"
          locale="en"
          timezone="Etc/UTC"
          autosize
          datafeed={chartData.datafeed}
          loadingScreen={{
            backgroundColor: '#0a0d12',
            foregroundColor: '#38bdf8',
          }}
          disabledFeatures={[
            'header_symbol_search',
            'symbol_search_hot_key',
            'compare_symbol',
          ]}
          overrides={{
            'paneProperties.background': '#0a0d12',
            'paneProperties.backgroundType': 'solid',
            'paneProperties.vertGridProperties.color': 'rgba(71, 85, 105, 0.18)',
            'paneProperties.horzGridProperties.color': 'rgba(71, 85, 105, 0.18)',
            'scalesProperties.textColor': '#7d8795',
            'mainSeriesProperties.candleStyle.upColor': '#26a69a',
            'mainSeriesProperties.candleStyle.downColor': '#ef5350',
            'mainSeriesProperties.candleStyle.borderUpColor': '#26a69a',
            'mainSeriesProperties.candleStyle.borderDownColor': '#ef5350',
            'mainSeriesProperties.candleStyle.wickUpColor': '#26a69a',
            'mainSeriesProperties.candleStyle.wickDownColor': '#ef5350',
          }}
          onReady={(nextController) => {
            setController(nextController);
            setChartReady(true);
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {!chartReady && (
        <div className="absolute inset-x-0 top-[57px] bottom-0 flex items-center justify-center bg-slate-900/80 text-sm text-slate-300">
          Loading chart...
        </div>
      )}
    </>
  );
}
