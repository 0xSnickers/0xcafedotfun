'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ContractFunctionExecutionError, isAddressEqual, type Hex } from 'viem';
import { getPublicClient, readContract } from 'wagmi/actions';
import { config } from '@/config/wagmi';
import { MEME_FACTORY_ABI } from '@/config/abis';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';
import {
  isCafePrefixedAddress,
  predictMemeTokenAddress,
  type VanityTokenParams,
} from '@/lib/market/vanityTokenAddress';

export interface TokenForm {
  name: string;
  symbol: string;
  tokenImage?: string;
  description: string;
}

export interface VanityResult {
  address: string;
  salt: Hex;
  attempts: number;
  fingerprint: string;
}

export interface VanityProgress {
  attempts: number;
  rate: number;
  currentAddress?: string;
}

type VanityWorkerMessage =
  | { type: 'progress'; attempts: number; rate: number; currentAddress: string }
  | { type: 'found'; attempts: number; rate: number; address: string; salt: Hex }
  | { type: 'cancelled'; attempts: number }
  | { type: 'error'; message: string };

interface UseVanityTokenGenerationParams {
  factoryAddress: string | null;
  creatorAddress?: string;
}

export const getVanityFingerprint = (values: TokenForm) => JSON.stringify({
  name: values.name || '',
  symbol: values.symbol || '',
  tokenImage: values.tokenImage || '',
  description: values.description || '',
});

async function ensureFactoryContractDeployed(factoryAddress: `0x${string}`) {
  const publicClient = getPublicClient(config, { chainId: DEFAULT_CHAIN_ID });

  if (!publicClient) {
    throw new Error(`No public client is configured for chain ${DEFAULT_CHAIN_ID}. Check NEXT_PUBLIC_NETWORK_RPC.`);
  }

  const code = await publicClient.getCode({ address: factoryAddress });

  if (!code || code === '0x') {
    throw new Error(
      `Factory contract is not deployed at ${factoryAddress} on chain ${DEFAULT_CHAIN_ID}. Check NEXT_PUBLIC_NETWORK_RPC and NEXT_PUBLIC_MEME_FACTORY_ADDRESS, then redeploy or refresh frontend env.`,
    );
  }
}

async function ensurePredictedTokenAddressAvailable(
  factoryAddress: `0x${string}`,
  predictedAddress: `0x${string}`,
) {
  const publicClient = getPublicClient(config, { chainId: DEFAULT_CHAIN_ID });

  if (!publicClient) {
    throw new Error(`No public client is configured for chain ${DEFAULT_CHAIN_ID}. Check NEXT_PUBLIC_NETWORK_RPC.`);
  }

  const [tokenExists, code] = await Promise.all([
    readContract(config, {
      address: factoryAddress,
      abi: MEME_FACTORY_ABI,
      functionName: 'tokenExists',
      chainId: DEFAULT_CHAIN_ID,
      args: [predictedAddress],
    }) as Promise<boolean>,
    publicClient.getCode({ address: predictedAddress }),
  ]);

  if (tokenExists || (code && code !== '0x')) {
    throw new Error(
      `Predicted token address ${predictedAddress} is already in use on chain ${DEFAULT_CHAIN_ID}. Please retry vanity mining.`,
    );
  }
}

export function useVanityTokenGeneration({
  factoryAddress,
  creatorAddress,
}: UseVanityTokenGenerationParams) {
  const [isGeneratingVanity, setIsGeneratingVanity] = useState(false);
  const [vanityResult, setVanityResult] = useState<VanityResult | null>(null);
  const [vanityProgress, setVanityProgress] = useState<VanityProgress | null>(null);
  const vanityWorkerRef = useRef<Worker | null>(null);

  const stopWorker = useCallback(() => {
    vanityWorkerRef.current?.postMessage({ type: 'cancel' });
    vanityWorkerRef.current?.terminate();
    vanityWorkerRef.current = null;
  }, []);

  useEffect(() => () => stopWorker(), [stopWorker]);

  const clearVanityResultIfChanged = useCallback((values: TokenForm) => {
    setVanityResult((current) => {
      if (!current) {
        return current;
      }

      return current.fingerprint === getVanityFingerprint(values) ? current : null;
    });
  }, []);

  const generateVanityAddress = useCallback(async (values: TokenForm): Promise<VanityResult> => {
    setIsGeneratingVanity(true);
    setVanityProgress({ attempts: 0, rate: 0 });

    try {
      if (!factoryAddress) {
        throw new Error('Factory contract address not found');
      }

      if (!creatorAddress) {
        throw new Error('Connect your wallet first');
      }

      await ensureFactoryContractDeployed(factoryAddress as `0x${string}`);
      stopWorker();

      const params: VanityTokenParams = {
        factoryAddress,
        creatorAddress,
        name: values.name,
        symbol: values.symbol,
        tokenImage: values.tokenImage || '',
        description: values.description,
      };

      const result = await new Promise<VanityResult>((resolve, reject) => {
        const worker = new Worker(new URL('../workers/vanityTokenWorker.ts', import.meta.url), {
          type: 'module',
        });
        vanityWorkerRef.current = worker;

        worker.onmessage = (event: MessageEvent<VanityWorkerMessage>) => {
          const data = event.data;

          if (data.type === 'progress') {
            setVanityProgress({
              attempts: data.attempts,
              rate: data.rate,
              currentAddress: data.currentAddress,
            });
            return;
          }

          worker.terminate();
          vanityWorkerRef.current = null;

          if (data.type === 'found') {
            resolve({
              address: data.address.toLowerCase(),
              salt: data.salt,
              attempts: data.attempts,
              fingerprint: getVanityFingerprint(values),
            });
            return;
          }

          if (data.type === 'cancelled') {
            reject(new Error('Vanity mining cancelled'));
            return;
          }

          reject(new Error(data.message));
        };

        worker.onerror = (event) => {
          worker.terminate();
          vanityWorkerRef.current = null;
          reject(new Error(event.message || 'Vanity mining worker failed'));
        };

        worker.postMessage({
          type: 'start',
          ...params,
        });
      });

      if (!isCafePrefixedAddress(result.address)) {
        throw new Error(`Vanity mining produced a non-0xcafe address: ${result.address}`);
      }

      const contractPrediction = await readContract(config, {
        address: factoryAddress as `0x${string}`,
        abi: MEME_FACTORY_ABI,
        functionName: 'predictTokenAddress',
        chainId: DEFAULT_CHAIN_ID,
        args: [
          creatorAddress,
          values.name,
          values.symbol,
          values.tokenImage || '',
          values.description,
          result.salt,
        ],
      }) as string;

      const localPrediction = predictMemeTokenAddress(params, result.salt);
      if (!isAddressEqual(contractPrediction as `0x${string}`, localPrediction as `0x${string}`)) {
        throw new Error('Local CREATE2 prediction is out of sync with the deployed Factory contract');
      }

      await ensurePredictedTokenAddressAvailable(
        factoryAddress as `0x${string}`,
        localPrediction as `0x${string}`,
      );

      setVanityResult(result);
      return result;
    } catch (error) {
      if (
        error instanceof ContractFunctionExecutionError &&
        error.message.includes('returned no data ("0x")')
      ) {
        throw new Error(
          `Factory contract at ${factoryAddress} returned no data on chain ${DEFAULT_CHAIN_ID}. The connected RPC likely does not have this deployment. Re-sync frontend env or redeploy the contracts.`,
        );
      }

      if (error instanceof Error) {
        const details = [error.message];
        let currentCause: unknown = (error as { cause?: unknown }).cause;

        while (currentCause && typeof currentCause === 'object') {
          const causeMessage = (currentCause as { message?: unknown }).message;
          if (typeof causeMessage === 'string') {
            details.push(causeMessage);
          }
          currentCause = (currentCause as { cause?: unknown }).cause;
        }

        if (details.some((message) => message.includes('returned no data ("0x")'))) {
          throw new Error(
            `Factory contract at ${factoryAddress} returned no data on chain ${DEFAULT_CHAIN_ID}. The connected RPC likely does not have this deployment. Re-sync frontend env or redeploy the contracts.`,
          );
        }
      }

      throw error;
    } finally {
      setIsGeneratingVanity(false);
      setVanityProgress(null);
    }
  }, [creatorAddress, factoryAddress, stopWorker]);

  const resolveVanityResult = useCallback(async (values: TokenForm) => {
    const fingerprint = getVanityFingerprint(values);
    if (vanityResult && vanityResult.fingerprint === fingerprint) {
      await ensurePredictedTokenAddressAvailable(
        factoryAddress as `0x${string}`,
        vanityResult.address as `0x${string}`,
      );
      return vanityResult;
    }

    return await generateVanityAddress(values);
  }, [factoryAddress, generateVanityAddress, vanityResult]);

  return {
    isGeneratingVanity,
    vanityProgress,
    vanityResult,
    clearVanityResultIfChanged,
    resolveVanityResult,
  };
}
