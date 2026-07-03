'use client';

import { useMemo } from 'react';
import { useTokenList } from '@/hooks/useTokenList';

export interface PlatformStats {
  todayCreated: number;
  totalVolume: string;
  activeTokens: number;
  graduatedTokens: number;
  totalTokens: number;
  totalCreators: number;
}

export function usePlatformStats(enabled = true) {
  const { tokenList, isLoading, error, refetch } = useTokenList(enabled, 100);
  const stats = useMemo<PlatformStats>(() => ({
    todayCreated: 0,
    totalVolume: tokenList.reduce((total, token) => total + (token.volume24h || 0), 0).toString(),
    activeTokens: tokenList.filter((token) => !token.graduated).length,
    graduatedTokens: tokenList.filter((token) => token.graduated).length,
    totalTokens: tokenList.length,
    totalCreators: new Set(tokenList.map((token) => token.creator.toLowerCase())).size,
  }), [tokenList]);

  return { stats, loading: isLoading, error, refetch };
}
