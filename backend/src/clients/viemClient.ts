import dotenv from 'dotenv'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil, mainnet, sepolia } from 'viem/chains'
import { getBackendEnvironment } from '../config/environment'

// 确保环境变量已加载
dotenv.config({ path: ['.env', '../.env'] })

const { appEnv, chainId } = getBackendEnvironment()
const chain =
  chainId === mainnet.id
    ? mainnet
    : chainId === sepolia.id
      ? sepolia
      : anvil
export const activeChain = chain
const rpcUrl =
  chain.id === mainnet.id
    ? process.env.RPC_URL_MAINNET
    : chain.id === sepolia.id
    ? process.env.RPC_URL_SEPOLIA
    : process.env.RPC_URL_LOCAL
const privateKey =
  chain.id === mainnet.id
    ? process.env.PRIVATE_KEY_MAINNET
    : chain.id === sepolia.id
    ? process.env.PRIVATE_KEY_SEPOLIA
    : process.env.PRIVATE_KEY_LOCAL
const rpcBatchEnabled = process.env.RPC_BATCH_ENABLED === 'true'

const rpcTransport = http(rpcUrl, {
  batch: rpcBatchEnabled,
  retryCount: 5,
  retryDelay: 1_000,
  timeout: 60_000,
})

// 公共客户端 - 用于读取操作
export const viemClient = createPublicClient({
  chain,
  transport: rpcTransport,
})

// 钱包客户端 - 用于写操作
export const walletClient = createWalletClient({
  chain,
  transport: rpcTransport,
  account: privateKey ? privateKeyToAccount(privateKey as `0x${string}`) : undefined,
})

if (process.env.NODE_ENV !== 'production') {
  console.log('🔑 Wallet client initialized:', {
    appEnv,
    chainId: chain.id,
    hasPrivateKey: !!privateKey,
    accountAddress: privateKey
      ? privateKeyToAccount(privateKey as `0x${string}`).address
      : 'None',
  })
} else {
  console.log('Wallet client initialized:', {
    appEnv,
    chainId: chain.id,
    hasPrivateKey: !!privateKey,
  })
}
