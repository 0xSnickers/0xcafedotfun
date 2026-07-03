'use client';

import { BarChartOutlined, TeamOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { formatAddress } from '@/hooks/useContracts';
import { formatTokenDisplayValue } from '@/lib/formatters/market';
import { getMarketHolders, type MarketHolder } from '@/lib/marketApi';

interface TradeHoldersPanelProps {
  tokenAddress: string;
  refreshSignal?: number;
}

function formatHolderBalance(rawAmount: string): string {
  return formatTokenDisplayValue(formatUnits(BigInt(rawAmount), 18), 7);
}

function formatHolderTime(timestamp: number | null): string {
  if (timestamp === null) return '—';
  return new Date(timestamp * 1_000).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TradeHoldersPanel({
  tokenAddress,
  refreshSignal = 0,
}: TradeHoldersPanelProps) {
  const [holders, setHolders] = useState<MarketHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenAddress) return;

    let active = true;
    const loadHolders = async () => {
      try {
        const nextHolders = await getMarketHolders(tokenAddress, { limit: 10 });
        if (!active) return;
        setHolders(nextHolders);
        setError(null);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Unable to load holders');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadHolders();
    const timer = window.setInterval(() => void loadHolders(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshSignal, tokenAddress]);

  return (
    <aside className="trade-holders-panel">
      <div className="terminal-section-head">
        <div><TeamOutlined /> Top holders</div>
        <span>TOP 10</span>
      </div>

      <div className="holders-table-head">
        <span>#</span><span>Address</span><span>Holdings</span><span>First buy</span><span>Trades</span>
      </div>

      {holders.length > 0 ? (
        <div className="holders-list">
          {holders.map((holder, index) => (
            <div className="holders-row" key={holder.address}>
              <span className="holders-rank">{index + 1}</span>
              <strong title={holder.address}>{formatAddress(holder.address, 5).toLowerCase()}</strong>
              <span title={formatHolderBalance(holder.balance)}>
                {formatHolderBalance(holder.balance)}
              </span>
              <time dateTime={holder.firstBuyAt ? new Date(holder.firstBuyAt * 1_000).toISOString() : undefined}>
                {formatHolderTime(holder.firstBuyAt)}
              </time>
              <small>{holder.buyCount}B / {holder.sellCount}S</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="activity-empty holders-empty">
          <BarChartOutlined />
          <strong>{loading ? 'Loading holders...' : 'No holders yet'}</strong>
          <p>{error || 'Holder rankings update as trades are indexed.'}</p>
        </div>
      )}
    </aside>
  );
}
