'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { readContract } from '@wagmi/core';
import { config } from '../config/wagmi';
import { MEME_FACTORY_ABI, BONDING_CURVE_ABI, MEME_TOKEN_ABI } from '../config/abis';
import { getContractAddresses } from '../config/contracts';
import { bondingCurveUtils } from './useBondingCurve';

export interface DetailedTokenInfo {
  // 基本信息
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  description: string;
  tokenImage: string;
  creator: string;
  createdAt: string;
  
  // 价格信息
  currentPrice: string;
  currentSupply: string;
  targetSupply: string;
  targetPrice: string;
  initialPrice: string;
  
  // 计算信息
  marketCap: string;
  progress: number;
  isGraduated: boolean;
}

export function useTokenInfo(tokenAddress: string) {
  const [tokenInfo, setTokenInfo] = useState<DetailedTokenInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { isConnected } = useAccount();
  const chainId = useChainId();

  const fetchTokenInfo = useCallback(async () => {
    if (!isConnected || !tokenAddress || tokenAddress === '') {
      setTokenInfo(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const contractAddresses = getContractAddresses(chainId);
      
      if (!contractAddresses.MEME_FACTORY || !contractAddresses.BONDING_CURVE) {
        throw new Error('Contract addresses not found');
      }

      console.log(`获取代币 ${tokenAddress} 的详细信息...`);

      // 并行获取所有需要的信息
      const [factoryInfo, curveParams, tokenName, tokenSymbol, tokenDecimals, totalSupply] = await Promise.all([
        // 从工厂合约获取基本信息
        readContract(config, {
          address: contractAddresses.MEME_FACTORY as `0x${string}`,
          abi: MEME_FACTORY_ABI,
          functionName: 'getMemeTokenInfo',
          args: [tokenAddress as `0x${string}`],
        }),
        // 从bonding curve获取价格信息
        readContract(config, {
          address: contractAddresses.BONDING_CURVE as `0x${string}`,
          abi: BONDING_CURVE_ABI,
          functionName: 'curveParams',
          args: [tokenAddress as `0x${string}`],
        }),
        // 从代币合约获取基本ERC20信息
        readContract(config, {
          address: tokenAddress as `0x${string}`,
          abi: MEME_TOKEN_ABI,
          functionName: 'name',
        }),
        readContract(config, {
          address: tokenAddress as `0x${string}`,
          abi: MEME_TOKEN_ABI,
          functionName: 'symbol',
        }),
        readContract(config, {
          address: tokenAddress as `0x${string}`,
          abi: MEME_TOKEN_ABI,
          functionName: 'decimals',
        }),
        readContract(config, {
          address: tokenAddress as `0x${string}`,
          abi: MEME_TOKEN_ABI,
          functionName: 'totalSupply',
        }),
      ]);

      const factory = factoryInfo as any;
      const curve = curveParams as any;
      
      console.log('代币信息:', { factory, curve, tokenName, tokenSymbol, tokenDecimals, totalSupply });

      // 安全地格式化所有数值
      const currentPrice = curve.currentPrice ? bondingCurveUtils.formatETH(curve.currentPrice) : '0';
      const currentSupply = curve.currentSupply ? bondingCurveUtils.formatTokenDisplay(curve.currentSupply) : '0.0000';
      const targetSupply = curve.targetSupply ? bondingCurveUtils.formatTokenDisplay(curve.targetSupply) : '0.0000';
      const targetPrice = curve.targetPrice ? bondingCurveUtils.formatETH(curve.targetPrice) : '0';
      const initialPrice = curve.initialPrice ? bondingCurveUtils.formatETH(curve.initialPrice) : '0';
      const formattedTotalSupply = totalSupply ? bondingCurveUtils.formatTokenDisplay(totalSupply as bigint) : '0.0000';
      
      // 计算市值
      let marketCap = '0';
      try {
        if (curve.currentPrice && curve.currentSupply && 
            curve.currentPrice !== BigInt(0) && curve.currentSupply !== BigInt(0)) {
          const marketCapNum = parseFloat(currentPrice) * parseFloat(currentSupply);
          marketCap = marketCapNum.toFixed(2);
        }
      } catch (calcError) {
        console.warn('计算市值失败:', calcError);
      }
      
      // 计算进度
      let progress = 0;
      let isGraduated = false;
      try {
        if (curve.currentSupply && curve.targetSupply && 
            curve.targetSupply !== BigInt(0)) {
          progress = Number((curve.currentSupply * BigInt(100)) / curve.targetSupply);
          progress = Math.min(Math.max(progress, 0), 100);
          isGraduated = progress >= 100;
        }
      } catch (progressError) {
        console.warn('计算进度失败:', progressError);
      }

      const detailedInfo: DetailedTokenInfo = {
        address: tokenAddress,
        name: (tokenName as string) || factory.name || 'Unknown Token',
        symbol: (tokenSymbol as string) || factory.symbol || 'UNK',
        decimals: Number(tokenDecimals) || 18,
        totalSupply: formattedTotalSupply,
        description: factory.description || '',
        tokenImage: factory.tokenImage || '',
        creator: factory.creator || '0x0000000000000000000000000000000000000000',
        createdAt: factory.createdAt ? new Date(Number(factory.createdAt) * 1000).toISOString() : new Date().toISOString(),
        
        currentPrice,
        currentSupply,
        targetSupply,
        targetPrice,
        initialPrice,
        
        marketCap,
        progress,
        isGraduated,
      };

      console.log('格式化后的代币信息:', detailedInfo);
      setTokenInfo(detailedInfo);
      
    } catch (err) {
      console.error('获取代币信息失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
      setTokenInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, chainId, tokenAddress]);

  // 自动获取代币信息
  useEffect(() => {
    fetchTokenInfo();
  }, [fetchTokenInfo]);

  return {
    tokenInfo,
    isLoading,
    error,
    refetch: fetchTokenInfo
  };
} 