import dotenv from 'dotenv'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil, sepolia } from 'viem/chains'

// 确保环境变量已加载
dotenv.config()

// 公共客户端 - 用于读取操作
export const viemClient = createPublicClient({
  chain: anvil,
  transport: http(process.env.RPC_URL_LOCAL),
})

// 钱包客户端 - 用于写操作
export const walletClient = createWalletClient({
  chain: anvil,
  transport: http(process.env.RPC_URL_LOCAL),
  account: process.env.PRIVATE_KEY_LOCAL ? privateKeyToAccount(process.env.PRIVATE_KEY_LOCAL as `0x${string}`) : undefined,
})

// 调试输出
console.log('🔑 Wallet client initialized:', {
  hasPrivateKey: !!process.env.PRIVATE_KEY_LOCAL,
  accountAddress: process.env.PRIVATE_KEY_LOCAL ? privateKeyToAccount(process.env.PRIVATE_KEY_LOCAL as `0x${string}`).address : 'None'
})
