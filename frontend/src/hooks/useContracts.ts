import { usePublicClient, useWalletClient, useChainId } from 'wagmi';
import { getContract } from 'viem';
import { getContractAddresses } from '../config/contracts';
import { MEME_FACTORY_ABI, MEME_PLATFORM_ABI, MEME_TOKEN_ABI } from '../config/abis';
import { parseEther, formatEther, parseUnits, formatUnits, keccak256, toBytes } from 'viem';

// 合约操作类型定义
export interface CreateTokenParams {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  tokenImage: string;
  description: string;
  salt: string;
}

export interface UserProfile {
  username: string;
  avatar: string;
  createdTokens: number;
  totalVolume: string;
  reputation: number;
}

export interface TokenStats {
  totalVolume: string;
  holders: number;
  transactions: number;
  marketCap: string;
  lastUpdateTime: number;
}

export interface TokenInfo {
  tokenAddress: string;
  name: string;
  symbol: string;
  creator: string;
  createdAt: number;
  tokenImage: string;
  description: string;
}

// 基础合约 Hook
export function useContractBase() {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const addresses = getContractAddresses(chainId);
  
  return {
    chainId,
    publicClient,
    walletClient,
    addresses,
  };
}

// 使用 MemeFactory 合约
export function useMemeFactory() {
  const { publicClient, walletClient, addresses } = useContractBase();
  
  if (!addresses.MEME_FACTORY || !publicClient) return null;
  
  try {
    const contract = getContract({
      address: addresses.MEME_FACTORY as `0x${string}`,
      abi: MEME_FACTORY_ABI,
      client: { public: publicClient, wallet: walletClient },
    });
    
    return contract;
  } catch (error) {
    console.error('Failed to initialize MemeFactory contract:', error);
    return null;
  }
}

// 使用 MemePlatform 合约
export function useMemePlatform() {
  const { publicClient, walletClient, addresses } = useContractBase();
  
  if (!addresses.MEME_PLATFORM || !publicClient) return null;
  
  try {
    const contract = getContract({
      address: addresses.MEME_PLATFORM as `0x${string}`,
      abi: MEME_PLATFORM_ABI,
      client: { public: publicClient, wallet: walletClient },
    });
    
    return contract;
  } catch (error) {
    console.error('Failed to initialize MemePlatform contract:', error);
    return null;
  }
}

// 使用 MemeToken 合约
export function useMemeToken(tokenAddress: string) {
  const { publicClient, walletClient } = useContractBase();
  
  if (!tokenAddress || !publicClient) return null;
  
  try {
    const contract = getContract({
      address: tokenAddress as `0x${string}`,
      abi: MEME_TOKEN_ABI,
      client: { public: publicClient, wallet: walletClient },
    });
    
    return contract;
  } catch (error) {
    console.error('Failed to initialize MemeToken contract:', error);
    return null;
  }
}

// 工具函数：生成随机盐值
export function generateSalt(prefix: string = ''): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  return `${prefix}-${timestamp}-${random}`;
}

// 工具函数：验证代币参数
export function validateTokenParams(params: CreateTokenParams): string[] {
  const errors: string[] = [];
  
  if (!params.name || params.name.trim().length === 0) {
    errors.push('代币名称不能为空');
  }
  
  if (!params.symbol || params.symbol.trim().length === 0) {
    errors.push('代币符号不能为空');
  }
  
  if (params.decimals < 0 || params.decimals > 18) {
    errors.push('小数位数必须在0-18之间');
  }
  
  if (!params.totalSupply || Number(params.totalSupply) <= 0) {
    errors.push('总供应量必须大于0');
  }
  
  if (!params.tokenImage) {
    errors.push('代币图片URL不能为空');
  }
  
  if (!params.description) {
    errors.push('代币描述不能为空');
  }
  
  if (!params.salt) {
    errors.push('盐值不能为空');
  }
  
  return errors;
}

// 工具函数：格式化地址
export function formatAddress(address: string, length: number = 6): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

// 工具函数：格式化数字
export function formatNumber(value: string | number, decimals: number = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  
  if (num >= 1e9) {
    return `${(num / 1e9).toFixed(decimals)}B`;
  } else if (num >= 1e6) {
    return `${(num / 1e6).toFixed(decimals)}M`;
  } else if (num >= 1e3) {
    return `${(num / 1e3).toFixed(decimals)}K`;
  } else {
    return num.toFixed(decimals);
  }
}

// 工具函数：生成代币合约的盐值
export function generateTokenSalt(params: CreateTokenParams): `0x${string}` {
  const data = `${params.name}-${params.symbol}-${params.salt}-${Date.now()}`;
  return keccak256(toBytes(data));
} 