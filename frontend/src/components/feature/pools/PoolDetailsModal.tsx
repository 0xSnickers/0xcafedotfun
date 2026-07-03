'use client';

import { useMemo } from 'react';
import { Alert, Modal, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getPoolReserveSnapshots, type PoolListItem } from '@/lib/poolsApi';
import {
  formatEthAmount,
  formatMarketPrice,
  formatTokenDisplayValue,
} from '@/lib/formatters/market';

const { Text } = Typography;
const DAY_SECONDS = 24 * 60 * 60;

interface PoolDetailsModalProps {
  open: boolean;
  pool: PoolListItem | null;
  onClose: () => void;
}

function formatTimestamp(timestamp: number | null) {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000));
}

function buildSparklinePath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return '';
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : index * step;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function buildAreaPath(linePath: string, values: number[], width: number, height: number) {
  if (!linePath) {
    return '';
  }
  if (values.length === 1) {
    const x = width / 2;
    return `${linePath} L ${x.toFixed(2)} ${height} Z`;
  }
  return `${linePath} L ${width} ${height} L 0 ${height} Z`;
}

function getReserveSnapshotRange() {
  const nextTo = Math.floor(Date.now() / 1000);
  return {
    from: nextTo - DAY_SECONDS,
    to: nextTo,
  };
}

export function PoolDetailsModal({ open, pool, onClose }: PoolDetailsModalProps) {
  const { data: snapshots = [], isLoading, error } = useQuery({
    queryKey: ['pool-reserve-snapshots', pool?.tokenAddress],
    queryFn: () => getPoolReserveSnapshots(pool!.tokenAddress, {
      ...getReserveSnapshotRange(),
      limit: 500,
    }),
    enabled: open && pool?.stage === 'dex_live' && Boolean(pool?.tokenAddress),
    refetchInterval: 30_000,
  });

  const chart = useMemo(() => {
    const liquidityValues = snapshots.map((snapshot) => snapshot.liquidityQuote);
    const width = 420;
    const height = 150;
    const linePath = buildSparklinePath(liquidityValues, width, height);
    return {
      width,
      height,
      linePath,
      areaPath: buildAreaPath(linePath, liquidityValues, width, height),
      latest: liquidityValues.at(-1) ?? pool?.liquidityQuote ?? null,
      first: liquidityValues.at(0) ?? null,
      min: liquidityValues.length > 0 ? Math.min(...liquidityValues) : null,
      max: liquidityValues.length > 0 ? Math.max(...liquidityValues) : null,
    };
  }, [pool?.liquidityQuote, snapshots]);

  const liquidityChange =
    chart.first !== null && chart.latest !== null ? chart.latest - chart.first : null;
  const symbol = pool?.symbol || 'TOKEN';

  return (
    <Modal
      title={pool ? `${symbol} pool details` : 'Pool details'}
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      className="dark-modal"
      width={680}
      destroyOnHidden
    >
      {!pool ? null : (
        <div className="pool-details">
          <div className="pool-details-grid">
            <div>
              <Text className="pool-details-label">Liquidity</Text>
              <strong>{pool.liquidityQuote === null ? '—' : formatEthAmount(pool.liquidityQuote)}</strong>
            </div>
            <div>
              <Text className="pool-details-label">Price / ETH</Text>
              <strong>{formatMarketPrice(String(pool.latestPrice ?? ''))}</strong>
            </div>
            <div>
              <Text className="pool-details-label">Pool {symbol}</Text>
              <strong>{pool.tokenReserve === null ? '—' : formatTokenDisplayValue(pool.tokenReserve)}</strong>
            </div>
            <div>
              <Text className="pool-details-label">Pool ETH</Text>
              <strong>{pool.quoteReserve === null ? '—' : formatEthAmount(pool.quoteReserve)}</strong>
            </div>
          </div>

          <div className="pool-details-chart">
            <div className="pool-details-chart-head">
              <div>
                <Text className="pool-details-label">24H liquidity trend</Text>
                <strong>{chart.latest === null ? '—' : formatEthAmount(chart.latest)}</strong>
              </div>
              <div className={liquidityChange !== null && liquidityChange < 0 ? 'pool-details-down' : 'pool-details-up'}>
                {liquidityChange === null ? '—' : `${liquidityChange >= 0 ? '+' : ''}${formatEthAmount(liquidityChange)}`}
              </div>
            </div>

            {isLoading ? (
              <div className="pool-details-chart-state"><Spin /></div>
            ) : error ? (
              <Alert type="warning" showIcon message="Reserve history unavailable" />
            ) : snapshots.length === 0 ? (
              <div className="pool-details-chart-state">
                <Text className="text-slate-500">No reserve snapshots in the last 24 hours</Text>
              </div>
            ) : (
              <>
                <svg
                  className="pool-details-sparkline"
                  viewBox={`0 0 ${chart.width} ${chart.height}`}
                  role="img"
                  aria-label={`${symbol} 24 hour liquidity trend`}
                  preserveAspectRatio="none"
                >
                  <path d={chart.areaPath} className="pool-details-sparkline-area" />
                  <path d={chart.linePath} className="pool-details-sparkline-line" />
                </svg>
                <div className="pool-details-axis">
                  <span>{formatTimestamp(snapshots[0]?.timestamp ?? null)}</span>
                  <span>{chart.min === null ? '—' : formatEthAmount(chart.min)} low</span>
                  <span>{chart.max === null ? '—' : formatEthAmount(chart.max)} high</span>
                  <span>{formatTimestamp(snapshots.at(-1)?.timestamp ?? null)}</span>
                </div>
              </>
            )}
          </div>

          <div className="pool-details-meta">
            <span>
              Pair <strong>{pool.pairAddress ? `${pool.pairAddress.slice(0, 8)}...${pool.pairAddress.slice(-6)}` : '—'}</strong>
            </span>
            <span>
              Reserves updated <strong>{formatTimestamp(pool.reservesUpdatedAt)}</strong>
            </span>
            <span>
              DEX live <strong>{formatTimestamp(pool.dexLiveAt)}</strong>
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}
