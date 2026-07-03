'use client';

import { useCallback, useEffect, useState } from 'react';
import { waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { useAccount, useBalance, useChainId, usePublicClient } from 'wagmi';
import { FEE_VAULT_ABI } from '@/config/abis';
import { getContractAddresses } from '@/config/contracts';
import { config } from '@/config/wagmi';
import { CreatorFees, getCreatorFees } from '@/lib/creatorApi';

const CLAIM_REFRESH_RETRIES = 12;
const CLAIM_REFRESH_DELAY_MS = 1_000;
const EIP_7702_CODE_PREFIX = '0xef0100';

export interface WalletExecutionMode {
  hasCode: boolean;
  isEip7702Delegated: boolean;
  delegationTarget: string | null;
}

function toUserFriendlyCreatorFeesError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Please try again in a moment.';
  }

  if (
    error.message === 'Please try again in a moment.' ||
    error.message.startsWith('Creator fees request failed:')
  ) {
    return 'Please try again in a moment.';
  }

  return error.message;
}

function isClaimIndexed(
  nextData: CreatorFees,
  transactionHash: string,
  previousClaimCount: number,
): boolean {
  const normalizedHash = transactionHash.toLowerCase();

  return (
    nextData.claims.some((claim) => claim.transactionHash.toLowerCase() === normalizedHash) ||
    nextData.claims.length > previousClaimCount
  );
}

function didClaimableSettle(
  nextClaimable: string,
  previousClaimable: string | null,
): boolean {
  if (previousClaimable === null) {
    return true;
  }

  return BigInt(nextClaimable) < BigInt(previousClaimable);
}

function didBalanceRefresh(
  previousBalanceUpdatedAt: number,
  nextBalanceUpdatedAt: number,
  hasBalanceData: boolean,
): boolean {
  if (nextBalanceUpdatedAt > previousBalanceUpdatedAt) {
    return true;
  }

  return previousBalanceUpdatedAt === 0 && hasBalanceData;
}

export function useCreatorFees() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const [data, setData] = useState<CreatorFees | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isWalletInspectionLoading, setIsWalletInspectionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletExecutionMode, setWalletExecutionMode] = useState<WalletExecutionMode | null>(null);
  const {
    refetch: refetchWalletBalance,
    dataUpdatedAt: walletBalanceUpdatedAt,
  } = useBalance({ address, chainId });

  const refresh = useCallback(async () => {
    if (!address) {
      setData(null);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setData(await getCreatorFees(address));
    } catch (requestError) {
      setError(toUserFriendlyCreatorFeesError(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;

    const inspectWalletCode = async () => {
      if (!address || !publicClient) {
        setWalletExecutionMode(null);
        setIsWalletInspectionLoading(false);
        return;
      }

      setIsWalletInspectionLoading(true);
      try {
        const bytecode = await publicClient.getBytecode({ address });
        if (cancelled) return;

        const code = bytecode?.toLowerCase() ?? '0x';
        const isEip7702Delegated =
          code.startsWith(EIP_7702_CODE_PREFIX) &&
          code.length === EIP_7702_CODE_PREFIX.length + 40;

        setWalletExecutionMode({
          hasCode: code !== '0x',
          isEip7702Delegated,
          delegationTarget: isEip7702Delegated
            ? `0x${code.slice(EIP_7702_CODE_PREFIX.length)}`
            : null,
        });
      } catch {
        if (!cancelled) {
          setWalletExecutionMode(null);
        }
      } finally {
        if (!cancelled) {
          setIsWalletInspectionLoading(false);
        }
      }
    };

    void inspectWalletCode();

    return () => {
      cancelled = true;
    };
  }, [address, publicClient]);

  const claim = useCallback(async () => {
    if (!address) {
      throw new Error('Connect wallet before claiming');
    }
    if (!walletExecutionMode) {
      throw new Error('Unable to verify wallet type. Please refresh and try again.');
    }
    if (walletExecutionMode.isEip7702Delegated) {
      throw new Error('EIP-7702 delegated accounts cannot claim creator fees. Switch to a standard EOA wallet.');
    }
    if (walletExecutionMode.hasCode) {
      throw new Error('Contract accounts cannot claim creator fees. Switch to a standard EOA wallet.');
    }

    const feeVault = getContractAddresses(chainId).FEE_VAULT;
    if (!feeVault) {
      throw new Error('FeeVault address is not configured');
    }

    setIsClaiming(true);
    try {
      const previousClaimable = data?.claimable ?? null;
      const previousClaimCount = data?.claims.length ?? 0;
      const previousBalanceRefreshAt = walletBalanceUpdatedAt;
      const hash = await writeContract(config, {
        address: feeVault as `0x${string}`,
        abi: FEE_VAULT_ABI,
        functionName: 'claimCreatorFees',
        args: [address],
      });
      await waitForTransactionReceipt(config, { hash });

      let claimIndexed = false;
      let claimableSettled = false;
      let walletBalanceRefreshed = false;

      for (let attempt = 0; attempt < CLAIM_REFRESH_RETRIES; attempt += 1) {
        try {
          const [nextData, nextBalanceResult] = await Promise.all([
            getCreatorFees(address),
            refetchWalletBalance(),
          ]);

          setData(nextData);
          setError(null);

          claimIndexed = claimIndexed || isClaimIndexed(
            nextData,
            hash,
            previousClaimCount,
          );
          claimableSettled = claimableSettled || didClaimableSettle(
            nextData.claimable,
            previousClaimable,
          );
          walletBalanceRefreshed = walletBalanceRefreshed || didBalanceRefresh(
            previousBalanceRefreshAt,
            nextBalanceResult.dataUpdatedAt,
            nextBalanceResult.data !== undefined,
          );

          if (claimIndexed && claimableSettled && walletBalanceRefreshed) {
            return hash;
          }
        } catch {
          // Keep waiting for the indexer and wallet balance query to catch up.
        }

        if (attempt < CLAIM_REFRESH_RETRIES - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, CLAIM_REFRESH_DELAY_MS));
        }
      }

      return hash;
    } finally {
      setIsClaiming(false);
    }
  }, [address, chainId, data, refetchWalletBalance, walletBalanceUpdatedAt, walletExecutionMode]);

  return {
    address,
    isConnected,
    data,
    error,
    walletExecutionMode,
    isWalletInspectionLoading,
    isLoading,
    isClaiming,
    refresh,
    claim,
  };
}
