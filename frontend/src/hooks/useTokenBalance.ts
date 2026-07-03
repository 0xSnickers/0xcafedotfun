'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { config } from '../config/wagmi';
import { MEME_TOKEN_ABI } from '../config/abis';
import { marketUtils } from './useMarket';
import { DEFAULT_CHAIN_ID } from '../config/contracts';
import { formatTokenDisplayValue } from '@/lib/formatters/market';
import { debugError, debugLog } from '@/lib/debugLog';

export function useTokenBalance(tokenAddress: string) {
  const [balance, setBalance] = useState<{
    raw: bigint;
    formatted: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { address, isConnected } = useAccount();

  const fetchBalance = useCallback(async () => {
    if (!isConnected || !address || !tokenAddress || tokenAddress === '') {
      setBalance(null);
      return null;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      debugLog('Fetching token balance:', { address, tokenAddress });

      const balanceRaw = await readContract(config, {
        address: tokenAddress as `0x${string}`,
        abi: MEME_TOKEN_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
        chainId: DEFAULT_CHAIN_ID,
      }) as bigint;

      const balanceFormatted = formatTokenDisplayValue(marketUtils.formatTokenDisplay(balanceRaw), 7);
      
      debugLog('Token balance loaded:', balanceFormatted);
      
      const newBalance = {
        raw: balanceRaw,
        formatted: balanceFormatted
      };

      setBalance(newBalance);
      return newBalance;
      
    } catch (err) {
      debugError('Failed to fetch token balance:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setBalance(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address, tokenAddress]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchBalance();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchBalance]);

  return {
    balance,
    isLoading,
    error,
    refetch: fetchBalance
  };
} 
