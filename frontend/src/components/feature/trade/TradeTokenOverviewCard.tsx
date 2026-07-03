'use client';

import { App, Avatar, Progress } from 'antd';
import { CopyOutlined, FireOutlined, LinkOutlined, TrophyOutlined } from '@ant-design/icons';
import {
  formatEthAmount,
  formatEthPrice,
  formatPercentChange,
  formatTokenDisplayValue,
  getPercentChangeClassName,
} from '@/lib/formatters/market';
import { formatAddress } from '@/hooks/useContracts';
import type { TradeTokenDetails, TradeTokenMeta } from '@/hooks/useTokenInfo';

interface TradeTokenOverviewCardProps {
  tokenAddress: string;
  tokenInfo: TradeTokenMeta | null;
  tokenDetails: TradeTokenDetails | null;
}

export function TradeTokenOverviewCard({
  tokenAddress,
  tokenInfo,
  tokenDetails,
}: TradeTokenOverviewCardProps) {
  const { message } = App.useApp();

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(tokenAddress.toLowerCase());
      message.success('Contract address copied');
    } catch {
      message.error('Unable to copy contract address');
    }
  };

  const metrics = tokenDetails
    ? [
        ['Price', `${formatEthPrice(tokenDetails.currentPrice)} ETH`],
        ['Market cap', formatEthAmount(tokenDetails.marketCap)],
        ['Liquidity', formatEthAmount(tokenDetails.totalRaised)],
        ['Supply', formatTokenDisplayValue(tokenDetails.currentSupply, 7)],
        ['24h volume', formatEthAmount(tokenDetails.volume24h)],
      ]
    : [];

  const currentMarketCap = Number(tokenDetails?.marketCap || 0);
  const targetMarketCap = Number(tokenDetails?.targetMarketCap || 0);
  const graduationPending = tokenDetails?.marketStage === 'graduated_pending_liquidity';
  const graduationProgress = tokenDetails?.graduated
    ? 100
    : targetMarketCap > 0
      ? Math.min(100, Math.max(0, (currentMarketCap / targetMarketCap) * 100))
      : 0;

  return (
    <>
      <section className="terminal-market-header">
        <div className="terminal-token-identity">
          <Avatar src={tokenInfo?.tokenImage || '/favicon.png'} size={50} className="terminal-token-avatar" />
          <div>
            <div className="terminal-token-title">
              <h1>{tokenInfo?.symbol || 'TOKEN'}</h1>
              <span>{tokenInfo?.name || 'Onchain market'}</span>
            </div>
            <div className="terminal-token-meta">
              <span className={tokenDetails?.graduated ? 'token-state-graduated' : 'token-state-live'}>
                {tokenDetails?.graduated || graduationPending ? <TrophyOutlined /> : <i />}
                {tokenDetails?.graduated ? 'Launched' : graduationPending ? 'Launching' : 'Live'}
              </span>
              <button type="button" onClick={copyAddress}>
                <LinkOutlined /> {formatAddress(tokenAddress).toLowerCase()}
                <CopyOutlined />
              </button>
            </div>
            <div className="terminal-token-change-row">
              <span>24h change</span>
              <strong
                className={getPercentChangeClassName(tokenDetails?.priceChange24h ?? null)}
              >
                {formatPercentChange(tokenDetails?.priceChange24h ?? null)}
              </strong>
            </div>
          </div>
        </div>

        <div className="terminal-market-metrics">
          {metrics.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

      </section>

      <section className={`terminal-graduation-strip ${tokenDetails?.graduated ? 'is-graduated' : ''}`}>
        <div className="terminal-graduation-copy">
          <span className="terminal-graduation-icon">
            {tokenDetails?.graduated ? <TrophyOutlined /> : <FireOutlined />}
          </span>
          <div>
            <div className="terminal-graduation-title">
              <span>{tokenDetails?.graduated ? 'Launched' : graduationPending ? 'Launch in progress' : 'Launch progress'}</span>
              <strong>{graduationProgress.toFixed(graduationProgress >= 10 ? 1 : 2)}%</strong>
            </div>
            <small>
              {tokenDetails
                ? `${formatEthAmount(tokenDetails.marketCap)} / ${formatEthAmount(tokenDetails.targetMarketCap)} market cap`
                : 'Loading market progress...'}
            </small>
          </div>
        </div>

        <div className="terminal-graduation-meter">
          <Progress
            percent={graduationProgress}
            showInfo={false}
            strokeColor={tokenDetails?.graduated ? '#f0c94d' : '#2de39b'}
            trailColor="#222833"
          />
          <div>
            <span>Bonding curve</span>
            <span>{tokenDetails?.graduated ? 'Launched' : 'DEX liquidity at 100%'}</span>
          </div>
        </div>
      </section>
    </>
  );
}
