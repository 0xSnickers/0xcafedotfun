'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { readContract } from '@wagmi/core';
import { config } from '../config/wagmi';
import { MEME_PLATFORM_ABI, MEME_FACTORY_ABI, BONDING_CURVE_ABI } from '../config/abis';
import { getContractAddresses } from '../config/contracts';
import { bondingCurveUtils } from './useBondingCurve';

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  currentPrice: string;
  priceChange24h: number;
  marketCap: string;
  holders: number;
  creator: string;
  createdAt: string;
  tokenImage: string;
  description: string;
}

export function useTokenList() {
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { isConnected } = useAccount();
  const chainId = useChainId();

  const fetchTokenList = useCallback(async () => {
    if (!isConnected) {
      setTokenList([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const contractAddresses = getContractAddresses(chainId);
      
      if (!contractAddresses.MEME_PLATFORM) {
        throw new Error('MEME_PLATFORM contract address not found');
      }

      // 获取所有代币地址
      const tokenAddresses = await readContract(config, {
        address: contractAddresses.MEME_PLATFORM as `0x${string}`,
        abi: MEME_PLATFORM_ABI,
        functionName: 'getAllMemeTokens',
      }) as string[];

      console.log('获取到的代币地址列表:', tokenAddresses);

      if (!tokenAddresses || tokenAddresses.length === 0) {
        console.log('没有找到代币，使用模拟数据');
        // 如果没有真实代币，使用一些模拟数据
        const mockTokens: TokenInfo[] = [
          {
            address: '0x1234567890123456789012345678901234567890',
            name: 'PepeCoin',
            symbol: 'PEPE',
            currentPrice: '0.000012',
            priceChange24h: 12.5,
            marketCap: '156.78',
            holders: 1234,
            creator: '0x1234567890123456789012345678901234567890',
            createdAt: new Date().toISOString(),
            tokenImage: '',
            description: 'Sample meme token'
          }
        ];
        setTokenList(mockTokens);
        return;
      }

      // 获取每个代币的详细信息
      const tokenInfoPromises = tokenAddresses.slice(0, 20).map(async (tokenAddr) => {
        try {
          console.log(`获取代币 ${tokenAddr} 的信息...`);
          
          // 获取代币基本信息
          const [tokenInfo, curveParams] = await Promise.all([
            readContract(config, {
              address: contractAddresses.MEME_FACTORY as `0x${string}`,
              abi: MEME_FACTORY_ABI,
              functionName: 'getMemeTokenInfo',
              args: [tokenAddr as `0x${string}`],
            }),
            readContract(config, {
              address: contractAddresses.BONDING_CURVE as `0x${string}`,
              abi: BONDING_CURVE_ABI,
              functionName: 'curveParams',
              args: [tokenAddr as `0x${string}`],
            })
          ]);

          const info = tokenInfo as any;
          const params = curveParams as any;
          
          console.log(`代币 ${tokenAddr} 信息:`, { info, params });
          
          // 安全地处理BigInt计算
          let currentPrice = '0';
          let marketCap = '0';
          
          try {
            if (params.currentPrice && params.currentPrice !== BigInt(0)) {
              currentPrice = bondingCurveUtils.formatETH(params.currentPrice);
            }
            
            if (params.currentPrice && params.currentSupply && 
                params.currentPrice !== BigInt(0) && params.currentSupply !== BigInt(0)) {
              // 简化市值计算，避免除法
              const priceStr = bondingCurveUtils.formatETH(params.currentPrice);
              const supplyStr = bondingCurveUtils.formatTokenDisplay(params.currentSupply);
              const marketCapNum = parseFloat(priceStr) * parseFloat(supplyStr);
              marketCap = marketCapNum.toFixed(2);
            }
          } catch (calcError) {
            console.warn('计算价格或市值失败:', calcError);
          }

          return {
            address: tokenAddr,
            name: info.name || 'Unknown Token',
            symbol: info.symbol || 'UNK',
            currentPrice: currentPrice,
            priceChange24h: (Math.random() - 0.5) * 20, // 模拟24h变化，需要历史数据
            marketCap: marketCap,
            holders: Math.floor(Math.random() * 1000) + 100, // 模拟持有者数量，需要链上统计
            creator: info.creator || '0x0000000000000000000000000000000000000000',
            createdAt: info.createdAt ? new Date(Number(info.createdAt) * 1000).toISOString() : new Date().toISOString(),
            tokenImage: info.tokenImage || '',
            description: info.description || ''
          };
        } catch (tokenError) {
          console.error(`获取代币 ${tokenAddr} 信息失败:`, tokenError);
          return null;
        }
      });

      const tokenInfos = await Promise.all(tokenInfoPromises);
      const validTokens = tokenInfos.filter((token): token is TokenInfo => token !== null);
      
      // 按创建时间排序，最新的在前
      validTokens.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      console.log('处理后的代币列表:', validTokens);
      setTokenList(validTokens);
      
    } catch (err) {
      console.error('获取代币列表失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
      
      // 使用模拟数据作为降级方案
      const mockTokens: TokenInfo[] = [
        {
          address: '0x1234567890123456789012345678901234567890',
          name: 'PepeCoin',
          symbol: 'PEPE',
          currentPrice: '0.000012',
          priceChange24h: 12.5,
          marketCap: '156.78',
          holders: 1234,
          creator: '0x1234567890123456789012345678901234567890',
          createdAt: new Date().toISOString(),
          tokenImage: '',
          description: 'Sample meme token'
        },
        {
          address: '0x2345678901234567890123456789012345678901',
          name: 'DogeCoin',
          symbol: 'DOGE',
          currentPrice: '0.000034',
          priceChange24h: -5.2,
          marketCap: '234.56',
          holders: 567,
          creator: '0x2345678901234567890123456789012345678901',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          tokenImage: '',
          description: 'Doge meme token'
        },
        {
          address: '0x3456789012345678901234567890123456789012',
          name: 'ShibaCoin',
          symbol: 'SHIB',
          currentPrice: '0.000089',
          priceChange24h: 8.9,
          marketCap: '345.67',
          holders: 890,
          creator: '0x3456789012345678901234567890123456789012',
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          tokenImage: '',
          description: 'Shiba meme token'
        }
      ];
      setTokenList(mockTokens);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, chainId]);

  // 自动获取代币列表
  useEffect(() => {
    fetchTokenList();
  }, [fetchTokenList]);

  return {
    tokenList,
    isLoading,
    error,
    refetch: fetchTokenList
  };
} 