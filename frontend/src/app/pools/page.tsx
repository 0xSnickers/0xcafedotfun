'use client';

import { useCallback, useMemo, useState } from 'react';
import { App, Button, Empty, Input, Layout, Spin } from 'antd';
import {
  BarChartOutlined,
  DatabaseOutlined,
  GoldOutlined,
  RocketOutlined,
  SearchOutlined,
  SwapOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import UnifiedHeader from '@/components/UnifiedHeader';
import { PoolDetailsModal } from '@/components/feature/pools/PoolDetailsModal';
import { PoolLiquidityModal } from '@/components/feature/pools/PoolLiquidityModal';
import MarketVolume from '@/components/market/MarketVolume';
import { useLiquidityManager } from '@/hooks/useLiquidityManager';
import { getPools } from '@/lib/poolsApi';
import type { PoolListItem } from '@/lib/poolsApi';
import {
  formatCompactNumber,
  formatEthAmount,
  formatMarketPrice,
  formatPercentChange,
  getPercentChangeClassName,
} from '@/lib/formatters/market';

const { Content } = Layout;

type PoolFilter = 'all' | 'live' | 'pending';

function getStatus(pool: PoolListItem) {
  return pool.stage === 'dex_live' ? 'DEX live' : 'Pending liquidity';
}

export default function PoolsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<PoolFilter>('all');
  const [liquidityPool, setLiquidityPool] = useState<PoolListItem | null>(null);
  const [detailsPool, setDetailsPool] = useState<PoolListItem | null>(null);
  const { finalizeGraduatedPool, isFinalizingPool } = useLiquidityManager();
  const { data: pools = [], isLoading, error, refetch } = useQuery({
    queryKey: ['pools'],
    queryFn: () => getPools({ limit: 100 }),
    refetchInterval: 30_000,
  });

  const liveCount = pools.filter((pool) => pool.stage === 'dex_live').length;
  const pendingCount = pools.length - liveCount;
  const totalVolume24h = pools.reduce((sum, pool) => sum + pool.volume24h, 0);
  const totalLiquidity = pools.reduce((sum, pool) => sum + (pool.liquidityQuote ?? 0), 0);
  const totalVolumeComplete = pools.every((pool) => pool.volume24hComplete);

  const filteredPools = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return pools.filter((pool) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'live' && pool.stage === 'dex_live') ||
        (filter === 'pending' && pool.stage === 'graduated_pending_liquidity');
      const matchesQuery =
        !query ||
        pool.name?.toLowerCase().includes(query) ||
        pool.symbol?.toLowerCase().includes(query) ||
        pool.tokenAddress.toLowerCase().includes(query) ||
        pool.pairAddress?.toLowerCase().includes(query);
      return matchesFilter && matchesQuery;
    });
  }, [filter, pools, searchTerm]);

  const filters: Array<{ key: PoolFilter; label: string; count: number }> = [
    { key: 'all', label: 'All pools', count: pools.length },
    { key: 'live', label: 'DEX live', count: liveCount },
    { key: 'pending', label: 'Pending', count: pendingCount },
  ];

  const highlights = [
    { label: 'Pools', value: formatCompactNumber(pools.length), icon: <DatabaseOutlined /> },
    { label: 'DEX live', value: formatCompactNumber(liveCount), icon: <TrophyOutlined /> },
    { label: 'Liquidity', value: formatEthAmount(totalLiquidity), icon: <GoldOutlined /> },
    {
      label: totalVolumeComplete ? '24H volume' : '24H volume · partial',
      value: formatEthAmount(totalVolume24h),
      icon: <SwapOutlined />,
    },
  ];

  const openTradePage = useCallback((tokenAddress: string) => {
    router.push(`/trade/${tokenAddress}`);
  }, [router]);

  const handleFinalizePool = useCallback(async (pool: PoolListItem) => {
    message.loading({
      content: `Migrating ${pool.symbol || 'token'} to DEX...`,
      key: `finalize-${pool.tokenAddress}`,
      duration: 0,
    });

    try {
      await finalizeGraduatedPool(pool.tokenAddress);
      message.success({
        content: `${pool.symbol || 'Token'} pool is live`,
        key: `finalize-${pool.tokenAddress}`,
        duration: 3,
      });
      await refetch();
    } catch (error) {
      message.destroy(`finalize-${pool.tokenAddress}`);
      message.error(error instanceof Error ? error.message : 'DEX migration is still pending');
    }
  }, [finalizeGraduatedPool, message, refetch]);

  return (
    <Layout className="min-h-screen app-shell">
      <UnifiedHeader />

      <Content>
        <section className="mx-auto max-w-7xl px-4 py-8 lg:px-6 lg:py-10">
          <div className="trade-controls-bar pools-hero-bar">
            <div>
              <div className="status-pill mb-3">
                <span className="status-dot" />
                DEX · LIQUIDITY
              </div>
              <div className="trade-controls-title">Launched pools</div>
              <div className="trade-controls-subtitle">
                Tokens that have launched and moved into DEX liquidity.
              </div>
            </div>

            <div className="pools-kpi-row">
              {highlights.map((item) => (
                <div key={item.label} className="trade-kpi-card pools-kpi-card">
                  <span>{item.icon}</span>
                  <small>{item.label}</small>
                  <strong>{isLoading ? '—' : item.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="trade-controls-bar mt-5">
            <div>
              <div className="trade-controls-title">Browse pools</div>
            </div>

            <div className="trade-controls-actions">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Pool filters">
                {filters.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilter(item.key)}
                    className={`trade-filter-chip ${filter === item.key ? 'trade-filter-chip-active' : ''}`}
                  >
                    {item.label}
                    <span>{item.count}</span>
                  </button>
                ))}
              </div>

              <Input
                allowClear
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                prefix={<SearchOutlined className="text-slate-500" />}
                placeholder="Search symbol, token, or pair"
                className="market-search"
                size="large"
              />
            </div>
          </div>

          <div className="trade-results-meta">
            <div className="trade-results-copy">
              <strong>{filteredPools.length}</strong> / {pools.length} pools
            </div>
          </div>

          <section className="market-list-shell">
            <div className="market-list-scroll">
              <div className="market-list-row pool-list-row market-list-heading">
                <span>Pool</span><span>Price / ETH</span><span>24H</span><span>24H Volume</span><span>Liquidity</span><span>Pair</span><span>Status</span><span>Action</span>
              </div>

              {isLoading && (
                <div className="trade-state-block"><Spin /></div>
              )}

              {!isLoading && error && (
                <div className="trade-state-block px-6 text-center text-sm text-slate-500">
                  Pool data is temporarily unavailable
                </div>
              )}

              {!isLoading && !error && filteredPools.length === 0 && (
                <div className="trade-state-block">
                  <Empty
                    description={<span className="text-slate-500">No launched pools yet</span>}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                </div>
              )}

              {!isLoading && !error && filteredPools.map((pool) => (
                <div
                  key={pool.tokenAddress}
                  role="button"
                  tabIndex={0}
                  onClick={() => openTradePage(pool.tokenAddress)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openTradePage(pool.tokenAddress);
                    }
                  }}
                  className="market-list-row pool-list-row market-list-item"
                >
                  <span className="market-list-token">
                    <span className="market-list-orb">{(pool.symbol || 'T').slice(0, 1)}</span>
                    <span className="min-w-0">
                      <strong>{pool.symbol || 'TOKEN'}</strong>
                      <small>{pool.name || pool.tokenAddress}</small>
                    </span>
                  </span>
                  <span className="font-mono text-slate-200">{formatMarketPrice(String(pool.latestPrice ?? ''))}</span>
                  <span className={`font-mono ${getPercentChangeClassName(pool.priceChangePercent24h)}`}>
                    {formatPercentChange(pool.priceChangePercent24h)}
                  </span>
                  <MarketVolume value={pool.volume24h} complete={pool.volume24hComplete} />
                  <span className="font-mono text-slate-200">
                    {pool.liquidityQuote === null ? '—' : formatEthAmount(pool.liquidityQuote)}
                  </span>
                  <span className="font-mono text-slate-400">
                    {pool.pairAddress ? `${pool.pairAddress.slice(0, 6)}...${pool.pairAddress.slice(-4)}` : '—'}
                  </span>
                  <span className={pool.stage === 'dex_live' ? 'market-status-graduated' : 'market-status-active'}>
                    {pool.stage === 'dex_live' ? <TrophyOutlined /> : <BarChartOutlined />}
                    {getStatus(pool)}
                  </span>
                  <span className="pool-row-actions">
                    {pool.stage === 'graduated_pending_liquidity' ? (
                      <Button
                        type="primary"
                        size="small"
                        icon={<RocketOutlined />}
                        loading={isFinalizingPool(pool.tokenAddress)}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleFinalizePool(pool);
                        }}
                        className="pool-action-button"
                      >
                        Retry migration
                      </Button>
                    ) : (
                      <span className="pool-action-group">
                        <Button
                          type="text"
                          size="small"
                          icon={<SwapOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            openTradePage(pool.tokenAddress);
                          }}
                          className="pool-trade-button"
                        >
                          Trade
                        </Button>
                        <Button
                          type="text"
                          size="small"
                          icon={<BarChartOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDetailsPool(pool);
                          }}
                          className="pool-details-button"
                        >
                          Details
                        </Button>
                        <Button
                          type="text"
                          size="small"
                          icon={<GoldOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            setLiquidityPool(pool);
                          }}
                          className="pool-manage-button"
                        >
                          Manage
                        </Button>
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </section>
      </Content>

      <PoolLiquidityModal
        open={liquidityPool !== null}
        pool={liquidityPool}
        onClose={() => setLiquidityPool(null)}
        onComplete={async () => {
          await refetch();
        }}
      />
      <PoolDetailsModal
        open={detailsPool !== null}
        pool={detailsPool}
        onClose={() => setDetailsPool(null)}
      />
    </Layout>
  );
}
