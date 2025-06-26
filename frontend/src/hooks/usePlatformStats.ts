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
    // 如果没有chainId，显示默认数据并停止loading
    if (!chainId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const contractAddresses = getContractAddresses(chainId);
      
      if (!contractAddresses.MEME_FACTORY || !contractAddresses.MEME_PLATFORM || !contractAddresses.BONDING_CURVE) {
        console.warn('合约地址未配置，使用默认数据');
        setStats({
          todayCreated: 0,
          totalVolume: '0',
          activeTokens: 0,
          graduatedTokens: 0,
          totalTokens: 0,
          totalCreators: 0
        });
        setLoading(false);
        return;
      }

      try {
        // 首先尝试获取基本的代币数量
        const totalTokenCount = await readContract(config, {
          address: contractAddresses.MEME_FACTORY as `0x${string}`,
          abi: MEME_FACTORY_ABI,
          functionName: 'getMemeTokenCount',
        }) as bigint;

        console.log('Total token count:', totalTokenCount.toString());

        // 如果没有代币，直接返回空数据
        if (totalTokenCount === BigInt(0)) {
          console.log('No tokens found, returning empty stats');
          setStats({
            todayCreated: 0,
            totalVolume: '0',
            activeTokens: 0,
            graduatedTokens: 0,
            totalTokens: 0,
            totalCreators: 0
          });
          setLoading(false);
          return;
        }

        // 尝试获取所有代币地址
        let allTokens: string[] = [];
        try {
          allTokens = await readContract(config, {
            address: contractAddresses.MEME_FACTORY as `0x${string}`,
            abi: MEME_FACTORY_ABI,
            functionName: 'getAllMemeTokens',
          }) as string[];

          console.log('All tokens:', allTokens);
        } catch (err) {
          console.warn('Failed to get all tokens, using count only:', err);
          // 如果获取失败，只使用总数
          setStats({
            todayCreated: 0,
            totalVolume: '0',
            activeTokens: Number(totalTokenCount),
            graduatedTokens: 0,
            totalTokens: Number(totalTokenCount),
            totalCreators: 0
          });
          setLoading(false);
          return;
        }

        // 如果没有代币数组或为空，使用基本数据
        if (!allTokens || allTokens.length === 0) {
          console.log('Empty token array, using basic stats');
          setStats({
            todayCreated: 0,
            totalVolume: '0',
            activeTokens: Number(totalTokenCount),
            graduatedTokens: 0,
            totalTokens: Number(totalTokenCount),
            totalCreators: 0
          });
          setLoading(false);
          return;
        }

        // 获取代币详情以统计毕业状态和创建时间
        let graduatedCount = 0;
        let todayCount = 0;
        let activeCount = 0;
        let totalVolumeWei = BigInt(0);
        const creators = new Set<string>();
        
        // 修复今日创建数量计算 - 使用当地时区的今日开始时间
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const todayStartTimestamp = Math.floor(todayStart.getTime() / 1000);
        
        console.log('今日开始时间戳:', todayStartTimestamp, '当前时间:', Math.floor(Date.now() / 1000));
        
        // 批量获取代币信息，限制并发数量以避免RPC限制
        const batchSize = 5;
        for (let i = 0; i < allTokens.length; i += batchSize) {
          const batch = allTokens.slice(i, i + batchSize);
          
          const batchPromises = batch.map(async (tokenAddress) => {
            try {
              // 获取代币基本信息
              const tokenInfo = await readContract(config, {
                address: contractAddresses.MEME_FACTORY as `0x${string}`,
                abi: MEME_FACTORY_ABI,
                functionName: 'getMemeTokenInfo',
                args: [tokenAddress],
              }) as any;
              
              creators.add(tokenInfo.creator.toLowerCase());
              
              // 检查是否是今天创建的 - 使用修正后的时间比较
              const tokenCreatedAt = Number(tokenInfo.createdAt);
              console.log(`代币 ${tokenAddress} 创建时间:`, tokenCreatedAt, '今日开始:', todayStartTimestamp);
              
              if (tokenCreatedAt >= todayStartTimestamp) {
                todayCount++;
                console.log(`✅ 代币 ${tokenAddress} 是今日创建的`);
              } else {
                console.log(`❌ 代币 ${tokenAddress} 不是今日创建的`);
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
          
          // 等待当前批次完成
          await Promise.allSettled(batchPromises);
          
          // 添加小延迟以避免RPC限制
          if (i + batchSize < allTokens.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        const finalStats = {
          todayCreated: todayCount,
          totalVolume: formatEther(totalVolumeWei),
          activeTokens: activeCount,
          graduatedTokens: graduatedCount,
          totalTokens: Number(totalTokenCount),
          totalCreators: creators.size
        };

        console.log('Final stats:', finalStats);
        setStats(finalStats);
        
      } catch (contractError) {
        console.error('合约调用失败:', contractError);
        // 即使合约调用失败，也要设置默认数据并停止loading
        setStats({
          todayCreated: 0,
          totalVolume: '0',
          activeTokens: 0,
          graduatedTokens: 0,
          totalTokens: 0,
          totalCreators: 0
        });
        setError('暂时无法获取平台数据，请稍后重试');
      }
      
    } catch (err) {
      console.error('获取平台统计失败:', err);
      setError(err instanceof Error ? err.message : '获取统计数据失败');
      // 设置默认数据
      setStats({
        todayCreated: 0,
        totalVolume: '0',
        activeTokens: 0,
        graduatedTokens: 0,
        totalTokens: 0,
        totalCreators: 0
      });
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