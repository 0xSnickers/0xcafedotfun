'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { readContract } from '@wagmi/core';
import { config } from '../config/wagmi';
import { MEME_TOKEN_ABI } from '../config/abis';
import { bondingCurveUtils } from './useBondingCurve';

export function useTokenBalance(tokenAddress: string) {
  const [balance, setBalance] = useState<{
    raw: bigint;
    formatted: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const fetchBalance = useCallback(async () => {
    if (!isConnected || !address || !tokenAddress || tokenAddress === '') {
      setBalance(null);
      return null;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      console.log(`获取用户 ${address} 在代币 ${tokenAddress} 的余额...`);

      const balanceRaw = await readContract(config, {
        address: tokenAddress as `0x${string}`,
        abi: MEME_TOKEN_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      }) as bigint;

      const balanceFormatted = bondingCurveUtils.formatTokenDisplay(balanceRaw);
      
      console.log(`用户余额: ${balanceFormatted}`);
      
      const newBalance = {
        raw: balanceRaw,
        formatted: balanceFormatted
      };

      setBalance(newBalance);
      return newBalance;
      
    } catch (err) {
      console.error('获取代币余额失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
      setBalance(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address, tokenAddress, chainId]);

  // 自动获取余额
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return {
    balance,
    isLoading,
    error,
    refetch: fetchBalance
  };
} 