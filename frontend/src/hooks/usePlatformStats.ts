import { useState, useEffect, useCallback } from 'react';
import { readContract } from '@wagmi/core';
import { config } from '../config/wagmi';
import { getContractAddresses } from '../config/contracts';
import { MEME_FACTORY_ABI, BONDING_CURVE_ABI } from '../config/abis';
import { formatEther } from 'ethers';

export interface PlatformStats {
  todayCreated: number;
  totalVolume: string;
  activeTokens: number;
  graduatedTokens: number;
  totalTokens: number;
  totalCreators: number;
}

export function usePlatformStats(chainId?: number) {
  const [stats, setStats] = useState<PlatformStats>({
    todayCreated: 0,
    totalVolume: '0',
    activeTokens: 0,
    graduatedTokens: 0,
    totalTokens: 0,
    totalCreators: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!chainId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const contractAddresses = getContractAddresses(chainId);
      
      if (!contractAddresses.MEME_FACTORY || !contractAddresses.MEME_PLATFORM || !contractAddresses.BONDING_CURVE) {
        throw new Error('合约地址未配置');
      }

      // 并行获取所有统计数据
      const [
        totalTokenCount,
        allTokens,
        // platformStats
      ] = await Promise.all([
        // 总代币数量
        readContract(config, {
          address: contractAddresses.MEME_FACTORY as `0x${string}`,
          abi: MEME_FACTORY_ABI,
          functionName: 'getMemeTokenCount',
        }) as Promise<bigint>,
        
        // 所有代币地址
        readContract(config, {
          address: contractAddresses.MEME_FACTORY as `0x${string}`,
          abi: MEME_FACTORY_ABI,
          functionName: 'getAllMemeTokens',
        }) as Promise<string[]>,
        
        // 平台统计 - 如果有这个函数的话
        // readContract(config, {
        //   address: contractAddresses.MEME_PLATFORM as `0x${string}`,
        //   abi: MEME_PLATFORM_ABI,
        //   functionName: 'getPlatformStats',
        // })
      ]);

      // 获取代币详情以统计毕业状态和创建时间
      let graduatedCount = 0;
      let todayCount = 0;
      let activeCount = 0;
      let totalVolumeWei = BigInt(0);
      const creators = new Set<string>();
      
      const todayStart = Math.floor(Date.now() / 1000) - (24 * 60 * 60); // 24小时前
      
      // 批量获取代币信息
      const tokenInfoPromises = allTokens.map(async (tokenAddress) => {
        try {
          // 获取代币基本信息
          const tokenInfo = await readContract(config, {
            address: contractAddresses.MEME_FACTORY as `0x${string}`,
            abi: MEME_FACTORY_ABI,
            functionName: 'getMemeTokenInfo',
            args: [tokenAddress],
          }) as any;
          
          creators.add(tokenInfo.creator.toLowerCase());
          
          // 检查是否是今天创建的
          if (Number(tokenInfo.createdAt) >= todayStart) {
            todayCount++;
          }
          
          // 获取代币在Bonding Curve中的状态
          try {
            const details = await readContract(config, {
              address: contractAddresses.BONDING_CURVE as `0x${string}`,
              abi: BONDING_CURVE_ABI,
              functionName: 'getTokenDetails',
              args: [tokenAddress],
            }) as any;
            
            const [params, info] = details;
            
            if (params.graduated) {
              graduatedCount++;
            } else {
              activeCount++;
            }
            
            // 累加交易量
            if (info.totalRaised) {
              totalVolumeWei += BigInt(info.totalRaised.toString());
            }
          } catch (error) {
            console.warn(`获取代币 ${tokenAddress} 的Bonding Curve信息失败:`, error);
            // 如果获取失败，假设为活跃状态
            activeCount++;
          }
        } catch (error) {
          console.warn(`获取代币 ${tokenAddress} 信息失败:`, error);
        }
      });
      
      await Promise.allSettled(tokenInfoPromises);

      setStats({
        todayCreated: todayCount,
        totalVolume: formatEther(totalVolumeWei),
        activeTokens: activeCount,
        graduatedTokens: graduatedCount,
        totalTokens: Number(totalTokenCount),
        totalCreators: creators.size
      });
      
    } catch (err) {
      console.error('获取平台统计失败:', err);
      setError(err instanceof Error ? err.message : '获取统计数据失败');
    } finally {
      setLoading(false);
    }
  }, [chainId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats
  };
} 