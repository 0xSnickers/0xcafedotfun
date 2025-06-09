import { parseUnits, formatUnits } from 'ethers';

// 合约地址配置
export const CONTRACT_ADDRESSES = {
  // 主网地址（需要部署后更新）
  mainnet: {
    MEME_FACTORY: process.env.NEXT_PUBLIC_MEME_FACTORY_ADDRESS || '',
    MEME_PLATFORM: process.env.NEXT_PUBLIC_MEME_PLATFORM_ADDRESS || '',
    BONDING_CURVE: process.env.NEXT_PUBLIC_BONDING_CURVE_ADDRESS || '',
  },
  // Sepolia 测试网地址
  sepolia: {
    MEME_FACTORY: process.env.NEXT_PUBLIC_MEME_FACTORY_ADDRESS || '',
    MEME_PLATFORM: process.env.NEXT_PUBLIC_MEME_PLATFORM_ADDRESS || '',
    BONDING_CURVE: process.env.NEXT_PUBLIC_BONDING_CURVE_ADDRESS || '',
  },
  // 本地测试网地址
  localhost: {
    MEME_FACTORY: process.env.NEXT_PUBLIC_MEME_FACTORY_ADDRESS || '',
    MEME_PLATFORM: process.env.NEXT_PUBLIC_MEME_PLATFORM_ADDRESS || '',
    BONDING_CURVE: process.env.NEXT_PUBLIC_BONDING_CURVE_ADDRESS || '',
  },
} as const;

// 网络配置
export const NETWORK_CONFIG = {
  mainnet: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: process.env.NEXT_PUBLIC_MAINNET_RPC_URL || '',
    blockExplorer: 'https://etherscan.io',
  },
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || '',
    blockExplorer: 'https://sepolia.etherscan.io',
  },
  localhost: {
    chainId: 31337,
    name: 'Local Testnet',
    rpcUrl: 'http://127.0.0.1:8545',
    blockExplorer: '',
  },
} as const;

// 合约常量
export const CONTRACT_CONSTANTS = {
  // 平台费用（基点）
  PLATFORM_FEE_PERCENTAGE: 200, // 2%
  CREATOR_FEE_PERCENTAGE: 300,  // 3%
  FEE_BASE: 10000,
  
  // ETH 相关常量
  ETH_DECIMALS: 18,
  ETH_SYMBOL: 'ETH',
  
  // 毕业机制
  TARGET_MARKET_CAP: '10',      // 10 ETH 市值毕业门槛
  
  // 价格范围（ETH）
  MIN_ETH_AMOUNT: '0.001',      // 最小 0.001 ETH
  MAX_ETH_AMOUNT: '10',         // 最大 10 ETH
  
  // 代币创建参数范围
  MIN_INITIAL_PRICE: '0.0001',  // 最小初始价格 0.0001 ETH
  MAX_INITIAL_PRICE: '0.01',    // 最大初始价格 0.01 ETH
  MIN_TARGET_PRICE: '0.001',    // 最小目标价格 0.001 ETH
  MAX_TARGET_PRICE: '1',        // 最大目标价格 1 ETH
  MIN_TARGET_SUPPLY: '100000',  // 最小目标供应量 10万
  MAX_TARGET_SUPPLY: '1000000000', // 最大目标供应量 10亿
  
  // 默认代币创建参数（ETH）
  DEFAULT_TARGET_SUPPLY: '100000000',  // 1亿代币目标供应量 (仅用于价格计算)
  DEFAULT_TARGET_PRICE: '0.001',       // 0.001 ETH 目标价格
  DEFAULT_INITIAL_PRICE: '0.0000001',  // 0.0000001 ETH 初始价格
  
  // 滑点保护
  DEFAULT_SLIPPAGE: 2, // 2%
  MAX_SLIPPAGE: 10,    // 10%
} as const;

// 获取当前网络的合约地址
export function getContractAddresses(chainId?: number) {
  switch (chainId) {
    case 1:
      return CONTRACT_ADDRESSES.mainnet;
    case 11155111:
      return CONTRACT_ADDRESSES.sepolia;
    case 31337:
      return CONTRACT_ADDRESSES.localhost;
    default:
      return CONTRACT_ADDRESSES.sepolia; // 默认使用 Sepolia
  }
}

// 获取网络配置
export function getNetworkConfig(chainId: number) {
  switch (chainId) {
    case 1:
      return NETWORK_CONFIG.mainnet;
    case 11155111:
      return NETWORK_CONFIG.sepolia;
    case 31337:
      return NETWORK_CONFIG.localhost;
    default:
      return NETWORK_CONFIG.sepolia;
  }
}

// 工具函数
export function formatETH(amount: bigint): string {
  return formatUnits(amount, CONTRACT_CONSTANTS.ETH_DECIMALS);
}

export function parseETH(amount: string): bigint {
  return parseUnits(amount, CONTRACT_CONSTANTS.ETH_DECIMALS);
}

// 检查是否为有效的ETH金额
export function isValidETHAmount(amount: string): boolean {
  try {
    const parsed = parseETH(amount);
    const min = parseETH(CONTRACT_CONSTANTS.MIN_ETH_AMOUNT);
    const max = parseETH(CONTRACT_CONSTANTS.MAX_ETH_AMOUNT);
    return parsed >= min && parsed <= max;
  } catch {
    return false;
  }
} 