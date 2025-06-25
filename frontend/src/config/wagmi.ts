import { http, createConfig } from 'wagmi'
import {
  // arbitrum,
  // base,
  mainnet,
  // optimism,
  // polygon,
  sepolia,
  anvil,
} from 'wagmi/chains'
import { walletConnect } from 'wagmi/connectors'

// 添加全局错误处理
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    // 忽略钱包连接相关的chrome.runtime错误
    if (event.error?.message?.includes('chrome.runtime.sendMessage')) {
      console.warn('Ignoring chrome.runtime.sendMessage error:', event.error);
      event.preventDefault();
      return false;
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    // 忽略钱包连接相关的Promise rejection
    if (event.reason?.message?.includes('chrome.runtime.sendMessage')) {
      console.warn('Ignoring chrome.runtime.sendMessage promise rejection:', event.reason);
      event.preventDefault();
      return false;
    }
  });
}

export const config = createConfig({
  chains: [anvil, sepolia, mainnet],
  connectors: [
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '2c8ff89c9df4e5b30e5892b98d5c67e8',
      metadata: {
        name: '0xcafe.fun',
        description: '去中心化 Meme 代币创造平台',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://0xcafe.fun',
        icons: ['https://0xcafe.fun/favicon.png']
      },
      showQrModal: true,
    }),
  ],
  transports: {
    [anvil.id]: http(),
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
} 