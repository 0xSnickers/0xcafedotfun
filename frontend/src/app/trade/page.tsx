'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Empty, Input, Layout, Spin } from 'antd';
import {
  ArrowRightOutlined,
  BarChartOutlined,
  FireOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  formatCompactNumber,
  formatEthAmount,
  formatMarketPrice,
  formatPercentChange,
  getPercentChangeClassName,
} from '@/lib/formatters/market';
import UnifiedHeader from '../../components/UnifiedHeader';
import MarketVolume from '../../components/market/MarketVolume';
import { useTokenList } from '../../hooks/useTokenList';

const { Content } = Layout;

type MarketFilter = 'all' | 'active' | 'graduated';

function TradePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenAddress = searchParams.get('token');
  const { tokenList, isLoading, error } = useTokenList(true, 40);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<MarketFilter>('all');

  useEffect(() => {
    if (tokenAddress) {
      router.replace(`/trade/${tokenAddress}`);
    }
  }, [router, tokenAddress]);

  const activeCount = tokenList.filter((token) => !token.graduated).length;
  const graduatedCount = tokenList.length - activeCount;
  const totalVolume = tokenList.reduce((sum, token) => sum + (token.volume24h || 0), 0);
  const totalVolumeComplete = tokenList.every(
    (token) => token.volume24h === null || token.volume24hComplete !== false,
  );
  const avgMarketCap = tokenList.length
    ? tokenList.reduce((sum, token) => sum + Number(token.marketCap), 0) / tokenList.length
    : 0;

  const filteredTokens = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return tokenList.filter((token) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'active' && !token.graduated) ||
        (filter === 'graduated' && token.graduated);
      const matchesQuery =
        !query ||
        token.name.toLowerCase().includes(query) ||
        token.symbol.toLowerCase().includes(query) ||
        token.address.toLowerCase().includes(query);
      return matchesFilter && matchesQuery;
    });
  }, [filter, searchTerm, tokenList]);

  const featuredMarkets = filteredTokens.slice(0, 4);

  const filters: Array<{ key: MarketFilter; label: string; count: number }> = [
    { key: 'all', label: 'All markets', count: tokenList.length },
    { key: 'active', label: 'Bonding Curve', count: activeCount },
    { key: 'graduated', label: 'Launched', count: graduatedCount },
  ];

  const marketHighlights = [
    { label: 'Live markets', value: formatCompactNumber(tokenList.length), icon: <BarChartOutlined /> },
    {
      label: totalVolumeComplete ? '24H volume' : '24H volume · partial',
      value: formatEthAmount(totalVolume),
      icon: <ThunderboltOutlined />,
    },
    { label: 'Launched', value: formatCompactNumber(graduatedCount), icon: <TrophyOutlined /> },
    { label: 'Avg. market cap', value: formatEthAmount(avgMarketCap), icon: <FireOutlined /> },
  ];

  return (
    <Layout className="min-h-screen app-shell">
      <UnifiedHeader />

      <Content>
        <section className="hero-shell trade-hero-shell">
          <div className="hero-grid" aria-hidden="true" />

          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[0.68fr_1.32fr] lg:px-6 lg:py-10">
            <div className="relative z-10 min-w-0">
              <div className="status-pill mb-4">
                <span className="status-dot" />
                ONCHAIN · LIVE
              </div>
              <h1 className="hero-title trade-hero-title">
                Live markets
              </h1>

              <div className="trade-kpi-grid">
                {marketHighlights.map((item) => (
                  <div key={item.label} className="trade-kpi-card">
                    <span>{item.icon}</span>
                    <small>{item.label}</small>
                    <strong>{isLoading ? '—' : item.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 min-w-0">
              <div className="terminal-card trade-terminal-card">
                <div className="terminal-topbar">
                  <div className="flex items-center gap-3">
                    <span className="terminal-logo"><BarChartOutlined /></span>
                    <div>
                      <div className="font-semibold text-white">Market overview</div>
                    </div>
                  </div>
                  <span className="live-badge"><span /> LIVE</span>
                </div>

                <div className="terminal-summary trade-terminal-summary">
                  <div>
                    <span>All markets</span>
                    <strong>{isLoading ? '—' : formatCompactNumber(tokenList.length)}</strong>
                  </div>
                  <div>
                    <span>Trading</span>
                    <strong>{isLoading ? '—' : formatCompactNumber(activeCount)}</strong>
                  </div>
                  <div>
                    <span>Launched</span>
                    <strong>{isLoading ? '—' : formatCompactNumber(graduatedCount)}</strong>
                  </div>
                </div>

                <div className="market-table trade-market-preview">
                  <div className="market-row market-heading">
                    <span>Market</span><span>Price / ETH</span><span>24H</span><span>24H Volume</span><span>Market Cap</span>
                  </div>
                  {isLoading && <div className="market-empty">Syncing markets...</div>}
                  {!isLoading && featuredMarkets.length === 0 && <div className="market-empty">No markets yet</div>}
                  {!isLoading && featuredMarkets.map((market, index) => (
                    <button
                      type="button"
                      key={market.address}
                      className="market-row market-row-link trade-market-preview-row"
                      onClick={() => router.push(`/trade/${market.address}`)}
                    >
                      <span className="market-pair">
                        <span className={`token-orb token-orb-${(index % 4) + 1}`}>{market.symbol.slice(0, 1)}</span>
                        <span>
                          <strong>{market.symbol}</strong>
                          <small>{market.graduated ? 'Launched' : market.name}</small>
                        </span>
                      </span>
                      <span className="font-mono text-slate-200">{formatMarketPrice(market.currentPrice)}</span>
                      <span className={`font-mono ${getPercentChangeClassName(market.priceChange24h)}`}>
                        {formatPercentChange(market.priceChange24h)}
                      </span>
                      <MarketVolume value={market.volume24h} complete={market.volume24hComplete} />
                      <span className="font-mono text-slate-300">{formatEthAmount(market.marketCap)}</span>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="terminal-action w-full border-0 bg-transparent text-left"
                  onClick={() => {
                    const market = filteredTokens[0] || tokenList[0];
                    if (market) {
                      router.push(`/trade/${market.address}`);
                    }
                  }}
                >
                  Open top market <ArrowRightOutlined />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 lg:px-6 lg:pb-20">
          <div className="trade-controls-bar">
            <div>
              <div className="trade-controls-title">Browse markets</div>
            </div>

            <div className="trade-controls-actions">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Market filters">
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
                placeholder="Search name, symbol, or address"
                className="market-search"
                size="large"
              />
            </div>
          </div>

          <div className="trade-results-meta">
            <div className="trade-results-copy">
              <strong>{filteredTokens.length}</strong> / {tokenList.length} markets
            </div>
          </div>

          <section className="market-list-shell">
            <div className="market-list-scroll">
              <div className="market-list-row market-list-heading">
                <span>Market</span><span>Price / ETH</span><span>24H</span><span>24H Volume</span><span>Market Cap</span><span>Status</span>
              </div>

              {isLoading && (
                <div className="trade-state-block"><Spin /></div>
              )}

              {!isLoading && error && (
                <div className="trade-state-block px-6 text-center text-sm text-slate-500">
                  Market data is temporarily unavailable
                </div>
              )}

              {!isLoading && !error && filteredTokens.length === 0 && (
                <div className="trade-state-block">
                  <Empty
                    description={<span className="text-slate-500">No matching markets</span>}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                </div>
              )}

              {!isLoading && !error && filteredTokens.map((token) => (
                <button
                  key={token.address}
                  type="button"
                  onClick={() => router.push(`/trade/${token.address}`)}
                  className="market-list-row market-list-item"
                >
                  <span className="market-list-token">
                    <span className="market-list-orb">{token.symbol.slice(0, 1)}</span>
                    <span className="min-w-0">
                      <strong>{token.symbol}</strong>
                      <small>{token.name}</small>
                    </span>
                  </span>
                  <span className="font-mono text-slate-200">{formatMarketPrice(token.currentPrice)}</span>
                  <span className={`font-mono ${getPercentChangeClassName(token.priceChange24h)}`}>
                    {formatPercentChange(token.priceChange24h)}
                  </span>
                  <MarketVolume value={token.volume24h} complete={token.volume24hComplete} />
                  <span className="font-mono text-slate-300">{formatEthAmount(token.marketCap)}</span>
                  <span className={token.graduated ? 'market-status-graduated' : 'market-status-active'}>
                    {token.graduated ? <TrophyOutlined /> : <BarChartOutlined />}
                    {token.graduated ? 'Launched' : 'Trading'}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </section>
      </Content>
    </Layout>
  );
}

export default function TradePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#070b0e]"><Spin /></div>}>
      <TradePageContent />
    </Suspense>
  );
}
