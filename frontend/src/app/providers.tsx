'use client';
import '@ant-design/v5-patch-for-react-19';
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider, theme, App } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { config } from '@/config/wagmi';

import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: Infinity,
    },
  },
});

// Ant Design 主题配置
const antdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#1890ff',
    colorBgContainer: '#1f1f1f',
    colorBgElevated: '#262626',
    colorBorder: '#434343',
    colorText: '#ffffff',
    colorTextSecondary: '#a6a6a6',
    fontFamily: 'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  },
  components: {
    Button: {
      colorPrimary: '#1890ff',
      algorithm: true,
    },
    Card: {
      colorBgContainer: '#1f1f1f',
      colorBorder: '#434343',
    },
    Layout: {
      colorBgHeader: '#001529',
      colorBgBody: '#141414',
      colorBgTrigger: '#1f1f1f',
    },
  },
};

function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#1890ff',
            accentColorForeground: 'white',
            borderRadius: 'medium',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
          modalSize="compact"
          showRecentTransactions={false}
          initialChain={config.chains[0]}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider
        theme={antdTheme}
        locale={zhCN}
      >
        <App>
        <WalletProvider>
          {children}
        </WalletProvider>
        </App>
      </ConfigProvider>
    </AntdRegistry>
  );
} 