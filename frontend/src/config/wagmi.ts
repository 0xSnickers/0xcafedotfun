import { http, createConfig, injected } from 'wagmi'
import {
  mainnet,
  sepolia,
} from 'wagmi/chains'
import { defineChain } from 'viem'
import type { WalletKitConfig } from 'snk-wallet-kit'

export const networkRpc = process.env.NEXT_PUBLIC_NETWORK_RPC || 'http://127.0.0.1:8545'
export const defaultSepoliaRpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com'
export const defaultMainnetRpcUrl = 'https://ethereum-rpc.publicnode.com'
export const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || defaultSepoliaRpcUrl
export const mainnetRpcUrl = process.env.NEXT_PUBLIC_MAINNET_RPC_URL || defaultMainnetRpcUrl
export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '2c8ff89c9df4e5b30e5892b98d5c67e8'

export const anvil = defineChain({
  id: 31337,
  name: '0xcafe Remote Anvil',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [networkRpc],
    },
  },
  testnet: true,
})

export const supportedChains = [anvil, sepolia, mainnet] as const

export const walletKitConfig: WalletKitConfig = {
  evm: {
    enabled: true,
    chains: ['sepolia', 'mainnet'],
    wallets: ['metaMask', 'okxWallet', 'walletConnect'],
    walletConnectProjectId,
    reconnectOnMount: true,
  },
  app: {
    storageKey: '0xcafe-wallet-kit',
    ssr: true,
  },
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (event.error?.message?.includes('chrome.runtime.sendMessage')) {
      console.warn('Ignoring chrome.runtime.sendMessage error:', event.error)
      event.preventDefault()
      return false
    }
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.message?.includes('chrome.runtime.sendMessage')) {
      console.warn('Ignoring chrome.runtime.sendMessage promise rejection:', event.reason)
      event.preventDefault()
      return false
    }
  })
}

export const config = createConfig({
  chains: supportedChains,
  connectors: [
    injected(),
  ],
  transports: {
    [anvil.id]: http(networkRpc, {
      retryCount: 2,
      retryDelay: 500,
      timeout: 30_000,
    }),
    [sepolia.id]: http(sepoliaRpcUrl),
    [mainnet.id]: http(mainnetRpcUrl),
  },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
