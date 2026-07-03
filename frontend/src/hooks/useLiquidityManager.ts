'use client';

import { useCallback, useState } from 'react';
import { useAccount } from 'wagmi';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';
import {
  finalizeGraduationPermissionless,
  type GraduationStep,
} from '@/lib/market/graduationClient';

export type LiquidityFinalizeStatus = GraduationStep | 'idle';

export function useLiquidityManager() {
  const [finalizingToken, setFinalizingToken] = useState<string | null>(null);
  const [finalizeStatus, setFinalizeStatus] = useState<LiquidityFinalizeStatus>('idle');
  const { isConnected, chain } = useAccount();

  const finalizeGraduatedPool = useCallback(async (tokenAddress: string) => {
    if (!isConnected) {
      throw new Error('Connect wallet to finalize DEX migration.');
    }

    if (chain?.id !== DEFAULT_CHAIN_ID) {
      throw new Error(`Switch your wallet to Chain ${DEFAULT_CHAIN_ID} before finalizing.`);
    }

    const normalizedToken = tokenAddress.toLowerCase();
    setFinalizingToken(normalizedToken);
    setFinalizeStatus('checking_stage');

    try {
      await finalizeGraduationPermissionless(tokenAddress, setFinalizeStatus);
      return tokenAddress;
    } finally {
      setFinalizingToken((current) => current === normalizedToken ? null : current);
      setFinalizeStatus('idle');
    }
  }, [chain?.id, isConnected]);

  const isFinalizingPool = useCallback((tokenAddress: string) => (
    finalizingToken === tokenAddress.toLowerCase()
  ), [finalizingToken]);

  return {
    finalizingToken,
    finalizeStatus,
    finalizeGraduatedPool,
    isFinalizingPool,
    canFinalize: isConnected && chain?.id === DEFAULT_CHAIN_ID,
  };
}
