import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  // arbitrum,
  // base,
  // mainnet,
  // optimism,
  // polygon,
  sepolia,
  anvil,
} from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: '0xcafe.fun',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '',
  chains: [
    anvil, // 使用原始的 anvil 配置 (id: 31337)
    // sepolia,
    // mainnet,
    // polygon,
    // optimism,
    // arbitrum,
    // base,
  ],
  ssr: true, // If your dApp uses server side rendering (SSR)
  batch: {
    multicall: false, // 禁用 multicall 批处理
  },
  pollingInterval: 0, // 禁用轮询
}); 