'use client';

import { useAccount } from 'wagmi';
import { Layout, Typography, Button } from 'antd';
import {
  ArrowRightOutlined,
  BarChartOutlined,
  CodeOutlined,
  FireOutlined,
  LockOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import {
  formatCompactNumber,
  formatEthAmount,
  formatMarketPrice,
  formatPercentChange,
  getPercentChangeClassName,
} from '@/lib/formatters/market';
import UnifiedHeader from '../components/UnifiedHeader';
import MarketVolume from '../components/market/MarketVolume';
import { usePlatformStats } from '../hooks/usePlatformStats';
import { useTokenList } from '../hooks/useTokenList';

const { Content, Footer } = Layout;
const { Text } = Typography;

const featureCards = [
  {
    icon: <BarChartOutlined />,
    kicker: 'FAIR PRICE DISCOVERY',
    title: 'Fair curve pricing',
    copy: 'Every quote is calculated and settled onchain. No private rounds, no hidden pricing.',
  },
  {
    icon: <SafetyCertificateOutlined />,
    kicker: 'AUTOMATED LIQUIDITY',
    title: 'Automatic launch',
    copy: 'Markets migrate to DEX liquidity automatically when the target market cap is reached.',
  },
  {
    icon: <CodeOutlined />,
    kicker: 'ONCHAIN IDENTITY',
    title: 'Distinct cafe address',
    copy: 'CREATE2 gives every launch a recognizable cafe-prefixed onchain identity.',
  },
];

export default function Home() {
  const { isConnecting } = useAccount();
  const { stats, loading: statsLoading } = usePlatformStats();
  const { tokenList, isLoading: marketsLoading, error: marketsError } = useTokenList(true, 8);


  const platformStats = [
    { label: 'Total volume', value: formatEthAmount(stats.totalVolume).replace(' ETH', ''), icon: <ThunderboltOutlined /> },
    { label: 'Live tokens', value: formatCompactNumber(stats.activeTokens), icon: <RocketOutlined /> },
    { label: 'Launched today', value: formatCompactNumber(stats.todayCreated), icon: <FireOutlined /> },
    { label: 'Launched', value: formatCompactNumber(stats.graduatedTokens), icon: <TrophyOutlined /> },
  ];

  return (
    <Layout className="min-h-screen app-shell">
      <UnifiedHeader />

      <Content>
        <section className="hero-shell">
          <div className="hero-grid" aria-hidden="true" />

          <div className="mx-auto grid max-w-7xl items-start gap-8 px-4 py-8 lg:grid-cols-[0.74fr_1.26fr] lg:px-6 lg:py-10">
            <div className="relative z-10 min-w-0">
              <div className="status-pill mb-4">
                <span className="status-dot" />
                PERMISSIONLESS · ONCHAIN
              </div>
              <h1 className="hero-title">
                Create and trade tokens
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                Launch a market, trade the bonding curve, and track launch progress from one place.
              </p>

              <div className="mt-5 flex">
                <Link href="/trade">
                  <Button className="primary-cta" icon={<BarChartOutlined />} loading={isConnecting}>
                    Explore markets
                  </Button>
                </Link>
              </div>
            </div>

            <div className="relative z-10 min-w-0">
              <div className="terminal-card">
                <div className="terminal-topbar">
                  <div className="flex items-center gap-3">
                    <span className="terminal-logo"><BarChartOutlined /></span>
                    <div>
                      <div className="font-semibold text-white">Live launch markets</div>
                      <div className="text-xs text-slate-500">Bonding Curve · Onchain</div>
                    </div>
                  </div>
                  <span className="live-badge"><span /> LIVE</span>
                </div>

                <div className="terminal-summary">
                  <div>
                    <span>Live markets</span>
                    <strong>{statsLoading ? '—' : formatCompactNumber(stats.activeTokens)}</strong>
                  </div>
                  <div>
                    <span>Total volume</span>
                    <strong>{statsLoading ? '—' : formatEthAmount(stats.totalVolume)}</strong>
                  </div>
                  <div>
                    <span>Launched</span>
                    <strong>{statsLoading ? '—' : formatCompactNumber(stats.graduatedTokens)}</strong>
                  </div>
                </div>

                <div className="market-table">
                  <div className="market-row market-heading">
                    <span>Market</span><span>Price / ETH</span><span>24H</span><span>24H Volume</span><span>Market Cap</span>
                  </div>
                  {marketsLoading && (
                    <div className="market-empty">Syncing onchain markets...</div>
                  )}
                  {!marketsLoading && marketsError && (
                    <div className="market-empty">Market data unavailable</div>
                  )}
                  {!marketsLoading && !marketsError && tokenList.length === 0 && (
                    <div className="market-empty">No live markets yet</div>
                  )}
                  {!marketsLoading && tokenList.slice(0, 5).map((market, index) => (
                    <Link className="market-row market-row-link" href={`/trade/${market.address}`} key={market.address}>
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
                    </Link>
                  ))}
                </div>

                <Link href="/trade" className="terminal-action">
                  View all markets <ArrowRightOutlined />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/[0.06] bg-black/20">
          <div className="mx-auto grid max-w-7xl grid-cols-2 px-4 md:grid-cols-4 lg:px-6">
            {platformStats.map((item) => (
              <div className="stat-strip-item" key={item.label}>
                <span>{item.icon}</span>
                <div>
                  <small>{item.label}</small>
                  <strong>{statsLoading ? '—' : item.value}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-12 lg:px-6 lg:py-14">
          <div className="section-heading">
            <span>BUILT FOR TRUST</span>
            <h2>Simple launches. Verifiable markets.</h2>
            <p>The protocol handles the mechanics. You see the market.</p>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {featureCards.map((feature, index) => (
              <article className="feature-panel" key={feature.title}>
                <span className="feature-index">0{index + 1}</span>
                <div className="feature-icon">{feature.icon}</div>
                <small>{feature.kicker}</small>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-14 lg:px-6 lg:pb-16">
          <div className="launch-panel">
            <div>
              <span className="mb-4 block text-xs font-semibold tracking-[0.2em] text-emerald-300">THREE STEPS TO MARKET</span>
              <h2>From an idea to a live onchain market</h2>
              <p>Launch, discover price, and complete launch through one verifiable path.</p>
            </div>
            <div className="launch-steps">
              {[
                ['01', 'Create', 'Set the identity and generate a cafe-prefixed address.'],
                ['02', 'Trade', 'The bonding curve prices every buy and sell.'],
                ['03', 'Graduate', 'Target market cap triggers DEX liquidity migration.'],
              ].map(([step, title, copy]) => (
                <div className="launch-step" key={step}>
                  <span>{step}</span><strong>{title}</strong><p>{copy}</p>
                </div>
              ))}
            </div>
            <div className="launch-cta">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <LockOutlined className="text-emerald-400" />
                Public rules. Automated execution.
              </div>
            </div>
          </div>
        </section>
      </Content>

      <Footer className="site-footer">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm md:flex-row md:items-center md:justify-between lg:px-6">
          <Text className="text-slate-400">© 2026 0xcafe.fun · Onchain meme launch protocol</Text>
          <Text className="text-slate-500">Bonding Curve · CREATE2 · Automated Liquidity</Text>
        </div>
      </Footer>
    </Layout>
  );
}
