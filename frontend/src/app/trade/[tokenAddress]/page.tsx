'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Layout, Alert, ConfigProvider } from 'antd';
import { useAccount } from 'wagmi';
import UnifiedHeader from '@/components/UnifiedHeader';
import ETHTradePanel from '@/components/ETHTradePanel';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';
import { useTokenInfo } from '@/hooks/useTokenInfo';
import { DEXTradePanel } from '@/components/feature/trade/DEXTradePanel';
import { PendingLiquidityPanel } from '@/components/feature/trade/PendingLiquidityPanel';
import { TradeChartCard } from '@/components/feature/trade/TradeChartCard';
import { TradeTokenOverviewCard } from '@/components/feature/trade/TradeTokenOverviewCard';
import { TradeActivityPanel } from '@/components/feature/trade/TradeActivityPanel';
import { TradeHoldersPanel } from '@/components/feature/trade/TradeHoldersPanel';
import { TradePageBootLoading, TradePageInvalidState, TradePageSkeleton } from '@/components/feature/trade/TradePageStates';

const { Content } = Layout;

function TokenTradePage() {
  const params = useParams();
  const router = useRouter();
  const tokenAddress = params.tokenAddress as string;
  const { isConnected, chain } = useAccount();
  const [chartRefreshSignal, setChartRefreshSignal] = useState(0);

  const {
    isReady,
    tokenInfo,
    tokenDetails,
    initialDataLoaded,
    tokenBalance,
    refetchTokenBalance,
    refetch,
  } = useTokenInfo(tokenAddress);

  useEffect(() => {
    if (isConnected && refetchTokenBalance) {
      void refetchTokenBalance();
    }
  }, [isConnected, refetchTokenBalance]);

  const handleTradeComplete = async () => {
    setChartRefreshSignal(Date.now());

    await Promise.allSettled([
      refetch(),
      refetchTokenBalance ? refetchTokenBalance() : Promise.resolve(null),
    ]);

    [2_000, 5_000, 10_000].forEach((delay) => {
      window.setTimeout(() => {
        setChartRefreshSignal(Date.now());
        void refetch();
      }, delay);
    });
  };

  if (!isReady) {
    return <TradePageBootLoading label="Loading market..." />;
  }

  if (!initialDataLoaded) {
    return <TradePageSkeleton />;
  }

  if (!tokenAddress) {
    return <TradePageInvalidState onBack={() => router.push('/trade')} />;
  }

  return (
    <ConfigProvider
      theme={{
        components: {
          Layout: {
            bodyBg: 'transparent',
            headerBg: 'transparent',
            triggerBg: 'transparent',
          },
        },
      }}
    >
      <Layout className="min-h-screen app-shell">
        <UnifiedHeader />

        <Content className="trade-detail-shell">
          <div className="trade-terminal-page">
            {isConnected && chain?.id !== DEFAULT_CHAIN_ID && (
              <Alert
                showIcon
                type="warning"
                className="trade-network-alert"
                message="Wallet network mismatch"
                description={`Switch your wallet to Chain ${DEFAULT_CHAIN_ID} before trading.`}
              />
            )}

            <TradeTokenOverviewCard
              tokenAddress={tokenAddress}
              tokenInfo={tokenInfo}
              tokenDetails={tokenDetails}
            />

            <div className="trade-terminal-grid">
              <div className="trade-terminal-chart">
                <TradeChartCard
                  tokenAddress={tokenAddress}
                  symbol={tokenInfo?.symbol}
                  refreshSignal={chartRefreshSignal}
                />
              </div>

              <aside className="trade-terminal-order">
                {tokenInfo && tokenDetails?.marketStage === 'graduated_pending_liquidity' && (
                  <PendingLiquidityPanel
                    tokenAddress={tokenAddress}
                    tokenSymbol={tokenInfo.symbol}
                    onFinalized={handleTradeComplete}
                  />
                )}

                {tokenInfo && tokenDetails?.marketStage === 'dex_live' && (
                  <DEXTradePanel
                    tokenAddress={tokenAddress}
                    tokenSymbol={tokenInfo.symbol}
                    tokenBalance={tokenBalance}
                    onTradeComplete={handleTradeComplete}
                    refetchTokenBalance={refetchTokenBalance}
                  />
                )}

                {tokenInfo && tokenDetails?.marketStage !== 'graduated_pending_liquidity' && tokenDetails?.marketStage !== 'dex_live' && (
                  <ETHTradePanel
                    tokenAddress={tokenAddress}
                    tokenSymbol={tokenInfo.symbol}
                    tokenBalance={tokenBalance}
                    onTradeComplete={handleTradeComplete}
                    refetchTokenBalance={refetchTokenBalance}
                  />
                )}
              </aside>
            </div>

            <div className="trade-terminal-market-data">
              <TradeActivityPanel
                tokenAddress={tokenAddress}
                refreshSignal={chartRefreshSignal}
              />

              <TradeHoldersPanel
                tokenAddress={tokenAddress}
                refreshSignal={chartRefreshSignal}
              />
            </div>

          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}

export default function TokenTradePageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-400 border-t-transparent mx-auto mb-4" />
            <span className="text-slate-300 block mt-4 text-lg">Loading token market...</span>
          </div>
        </div>
      }
    >
      <TokenTradePage />
    </Suspense>
  );
}
