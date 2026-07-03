'use client';

import '@ant-design/v5-patch-for-react-19';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useAccount, WagmiProvider } from 'wagmi';
import { WalletCoreProvider } from 'snk-wallet-kit';
import { App, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { config, walletKitConfig } from '@/config/wagmi';

import 'snk-wallet-kit/style.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: Infinity,
    },
  },
});

const antdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#16c784',
    colorInfo: '#16c784',
    colorSuccess: '#16c784',
    colorBgBase: '#070b0e',
    colorBgContainer: '#0d1317',
    colorBgElevated: '#11191e',
    colorBorder: '#233038',
    colorBorderSecondary: '#192329',
    colorText: '#f1f5f4',
    colorTextSecondary: '#88969e',
    borderRadius: 10,
    borderRadiusLG: 14,
    fontFamily: 'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  },
  components: {
    Button: {
      colorPrimary: '#16c784',
      colorPrimaryHover: '#2de39b',
      primaryColor: '#04130d',
      fontWeight: 600,
      algorithm: true,
    },
    Card: {
      colorBgContainer: '#0d1317',
      colorBorderSecondary: '#233038',
    },
    Layout: {
      headerBg: '#080d10',
      bodyBg: '#070b0e',
      triggerBg: '#11191e',
    },
  },
};

function WalletBalanceSync() {
  const { isConnected } = useAccount();
  const queryClient = useQueryClient();
  const lastRefreshAt = useRef(0);
  const refreshBalances = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAt.current < 1_000) {
      return;
    }

    lastRefreshAt.current = now;
    void queryClient.invalidateQueries({ queryKey: ['balance'] });
  }, [queryClient]);

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const refreshVisibleBalances = () => {
      if (document.visibilityState === 'visible') {
        refreshBalances();
      }
    };

    window.addEventListener('focus', refreshBalances);
    document.addEventListener('visibilitychange', refreshVisibleBalances);

    return () => {
      window.removeEventListener('focus', refreshBalances);
      document.removeEventListener('visibilitychange', refreshVisibleBalances);
    };
  }, [isConnected, refreshBalances]);

  return null;
}

function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config} reconnectOnMount={walletKitConfig.evm?.reconnectOnMount}>
        <WalletCoreProvider config={walletKitConfig} queryClient={queryClient} wagmiConfig={config}>
          <WalletBalanceSync />
          {children}
        </WalletCoreProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={antdTheme} locale={zhCN}>
      <App>
        <WalletProvider>{children}</WalletProvider>
      </App>
    </ConfigProvider>
  );
}
