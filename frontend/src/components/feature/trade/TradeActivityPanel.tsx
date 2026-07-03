'use client';

import { BarChartOutlined, ClockCircleOutlined, SwapOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { formatEthPrice, formatTokenDisplayValue } from '@/lib/formatters/market';
import { getMarketTrades, type MarketTrade } from '@/lib/marketApi';

interface TradeActivityPanelProps {
  tokenAddress: string;
  refreshSignal?: number;
}

function formatTokenAmount(rawAmount: string): string {
  return formatTokenDisplayValue(formatUnits(BigInt(rawAmount), 18), 7);
}

function formatTradePrice(trade: MarketTrade): string {
  const rawPrice = trade.executionPrice ?? trade.markPrice;
  return formatEthPrice(rawPrice / 1e18);
}

function formatTradeTime(timestamp: number): string {
  return new Date(timestamp * 1_000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function TradeActivityPanel({
  tokenAddress,
  refreshSignal = 0,
}: TradeActivityPanelProps) {
  const [trades, setTrades] = useState<MarketTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenAddress) return;

    let active = true;
    const loadTrades = async () => {
      try {
        const page = await getMarketTrades(tokenAddress, { limit: 20 });
        if (!active) return;
        setTrades(page.trades);
        setError(null);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Unable to load trades');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadTrades();
    const timer = window.setInterval(() => void loadTrades(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshSignal, tokenAddress]);

  return (
    <aside className="trade-activity-panel">
      <div className="terminal-section-head">
        <div><SwapOutlined /> Activity</div>
        <span>LIVE</span>
      </div>

      <div className="activity-table-head">
        <span>Side</span><span>Amount</span><span>Price</span><span>Time</span>
      </div>

      {trades.length > 0 ? (
        <div className="activity-list">
          {trades.map((trade) => (
            <div className="activity-row" key={trade.id}>
              <span className={`activity-side activity-side-${trade.side}`}>
                {trade.side.toUpperCase()}
              </span>
              <strong title={formatTokenAmount(trade.tokenAmount)}>
                {formatTokenAmount(trade.tokenAmount)}
              </strong>
              <span>{formatTradePrice(trade)}</span>
              <time dateTime={new Date(trade.timestamp * 1_000).toISOString()}>
                {formatTradeTime(trade.timestamp)}
              </time>
            </div>
          ))}
        </div>
      ) : (
        <div className="activity-empty">
          <BarChartOutlined />
          <strong>{loading ? 'Loading activity...' : 'Onchain activity'}</strong>
          <p>{error || 'New trades will appear here as they settle.'}</p>
        </div>
      )}

      <div className="activity-foot">
        <ClockCircleOutlined />
        Auto-refresh enabled
      </div>
    </aside>
  );
}
