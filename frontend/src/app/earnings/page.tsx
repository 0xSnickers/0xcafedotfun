'use client';

import { useMemo } from 'react';
import { Alert, App, Button, Empty, Layout, Spin } from 'antd';
import {
  ArrowRightOutlined,
  BankOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import UnifiedHeader from '@/components/UnifiedHeader';
import { formatAddress } from '@/hooks/useContracts';
import { useCreatorFees } from '@/hooks/useCreatorFees';
import { formatRawAssetAmount } from '@/lib/formatters/market';

const { Content } = Layout;

function formatEth(raw: string): string {
  return formatRawAssetAmount(raw, 'ETH');
}

export default function EarningsPage() {
  const { message } = App.useApp();
  const {
    isConnected,
    data,
    error,
    isLoading,
    isClaiming,
    isWalletInspectionLoading,
    walletExecutionMode,
    refresh,
    claim,
  } = useCreatorFees();

  const claimable = BigInt(data?.claimable ?? '0');
  const walletRestriction = useMemo(() => {
    if (!isConnected || !data) {
      return null;
    }
    if (isWalletInspectionLoading || !walletExecutionMode) {
      return {
        title: 'Checking wallet type',
        description: 'Claim is available only after the connected wallet is verified as a standard EOA.',
      };
    }
    if (walletExecutionMode.isEip7702Delegated) {
      return {
        title: 'EIP-7702 delegated accounts cannot claim',
        description: `Switch to a standard EOA wallet to claim creator fees. Delegation target: ${formatAddress(walletExecutionMode.delegationTarget ?? '')}.`,
      };
    }
    if (walletExecutionMode.hasCode) {
      return {
        title: 'Contract accounts cannot claim',
        description: 'Creator fee claims are currently limited to standard EOA wallets with no account code.',
      };
    }

    return null;
  }, [data, isConnected, isWalletInspectionLoading, walletExecutionMode]);
  const isClaimDisabled = claimable === 0n || walletRestriction !== null;
  const tokenEarnings = useMemo(
    () => [...(data?.tokenEarnings ?? [])].sort((a, b) => {
      const left = BigInt(a.accrued);
      const right = BigInt(b.accrued);
      return left === right ? 0 : left > right ? -1 : 1;
    }),
    [data?.tokenEarnings],
  );
  const hasCreatorActivity = tokenEarnings.length > 0 || (data?.claims.length ?? 0) > 0 || claimable > 0n;

  const handleClaim = async () => {
    try {
      await claim();
      message.success('Creator fees claimed');
    } catch (claimError) {
      message.error(claimError instanceof Error ? claimError.message : 'Claim failed');
    }
  };

  return (
    <Layout className="min-h-screen app-shell">
      <UnifiedHeader />
      <Content>
        <section className="hero-shell creator-earnings-hero">
          <div className="hero-grid" aria-hidden="true" />
          <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6 lg:py-10">
            <div className="relative z-10 max-w-3xl">
              <div className="status-pill mb-4">
                <span className="status-dot" />
                FEEVAULT · ONCHAIN
              </div>
              <h1 className="hero-title">
                Creator earnings
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Every trade routes 0.25% to the token creator. Earnings stay in FeeVault until you claim them.
              </p>
            </div>
          </div>
        </section>

        <main className="mx-auto max-w-7xl px-4 pb-20 lg:px-6">
          {!isConnected && (
            <div className="terminal-card creator-empty-state">
              <BankOutlined />
              <h2>Connect your creator wallet</h2>
              <p>The connected address is used to read and claim its FeeVault earnings.</p>
            </div>
          )}

          {isConnected && isLoading && !data && (
            <div className="creator-loading"><Spin /></div>
          )}

          {isConnected && error && !data && (
            <div className="terminal-card creator-empty-state">
              <HistoryOutlined />
              <h2>Unable to refresh earnings right now</h2>
              <p>Your wallet is connected, but the latest creator earnings snapshot is not ready yet.</p>
              <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>Try again</Button>
            </div>
          )}

          {isConnected && data && (
            <>
              <section className="creator-metric-grid">
                <div className="creator-metric-card creator-metric-card-primary">
                  <span><DollarOutlined /></span>
                  <small>Available to claim</small>
                  <strong>{formatEth(data.claimable)}</strong>
                </div>
                <div className="creator-metric-card">
                  <span><BankOutlined /></span>
                  <small>Lifetime earnings</small>
                  <strong>{formatEth(data.totalAccrued)}</strong>
                </div>
                <div className="creator-metric-card">
                  <span><CheckCircleOutlined /></span>
                  <small>Already claimed</small>
                  <strong>{formatEth(data.totalClaimed)}</strong>
                </div>
              </section>

              {walletRestriction && (
                <Alert
                  showIcon
                  type="warning"
                  className="creator-wallet-warning"
                  message={walletRestriction.title}
                  description={walletRestriction.description}
                />
              )}

              <section className="creator-claim-card">
                <div>
                  <span className="creator-section-kicker">PULL PAYMENT</span>
                  <h2>Claim creator fees</h2>
                  <p>Funds are sent only after your wallet signs the FeeVault claim transaction.</p>
                </div>
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  disabled={isClaimDisabled}
                  loading={isClaiming || isWalletInspectionLoading}
                  onClick={() => void handleClaim()}
                >
                  {isClaiming
                    ? 'Confirming payout…'
                    : isWalletInspectionLoading
                      ? 'Checking wallet'
                      : walletRestriction
                        ? 'Claim unavailable'
                        : claimable === 0n
                      ? 'Nothing to claim'
                      : `Claim ${formatEth(data.claimable)}`}
                </Button>
              </section>

              {!hasCreatorActivity && (
                <div className="terminal-card creator-empty-state">
                  <BankOutlined />
                  <h2>No creator earnings yet</h2>
                  <p>This wallet has not earned any creator fees yet.</p>
                </div>
              )}

              <section className="creator-section">
                <div className="creator-section-heading">
                  <div>
                    <span className="creator-section-kicker">BY TOKEN</span>
                    <h2>Token earnings</h2>
                  </div>
                  <Button icon={<ReloadOutlined />} loading={isLoading} onClick={() => void refresh()}>
                    Refresh
                  </Button>
                </div>
                <div className="market-list-shell">
                  <div className="market-list-row creator-list-heading">
                    <span>Token</span><span>Address</span><span>Lifetime creator fees</span>
                  </div>
                  {tokenEarnings.length === 0 ? (
                    <Empty description="No creator tokens yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : tokenEarnings.map((token) => (
                    <div className="market-list-row creator-list-row" key={token.tokenAddress}>
                      <span className="market-pair">
                        <span className="token-orb">{token.symbol.slice(0, 1)}</span>
                        <span><strong>{token.symbol}</strong><small>{token.name}</small></span>
                      </span>
                      <span className="font-mono text-slate-400">{formatAddress(token.tokenAddress)}</span>
                      <strong className="font-mono text-emerald-300">{formatEth(token.accrued)}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className="creator-section">
                <div className="creator-section-heading">
                  <div>
                    <span className="creator-section-kicker">HISTORY</span>
                    <h2>Claims</h2>
                  </div>
                </div>
                <div className="market-list-shell">
                  <div className="market-list-row creator-history-heading">
                    <span>Amount</span><span>Recipient</span><span>Date</span><span>Transaction</span>
                  </div>
                  {data.claims.length === 0 ? (
                    <Empty description="No claims yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : data.claims.map((item) => (
                    <div className="market-list-row creator-history-row" key={`${item.transactionHash}:${item.blockNumber}`}>
                      <strong className="font-mono text-emerald-300">{formatEth(item.amount)}</strong>
                      <span className="font-mono text-slate-400">{formatAddress(item.recipient)}</span>
                      <span>{item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : `Block ${item.blockNumber}`}</span>
                      <span className="font-mono text-slate-400">{formatAddress(item.transactionHash)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      </Content>
    </Layout>
  );
}
