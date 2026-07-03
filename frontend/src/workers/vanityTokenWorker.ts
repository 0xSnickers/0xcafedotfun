import {
  createRandomUserSalt,
  isCafePrefixedAddress,
  predictMemeTokenAddress,
  computeMemeTokenInitCodeHash,
  type VanityTokenParams,
} from '@/lib/market/vanityTokenAddress';
import type { Hex } from 'viem';

interface VanityMineStartMessage extends VanityTokenParams {
  type: 'start';
  batchSize?: number;
  progressIntervalMs?: number;
}

type VanityWorkerInboundMessage =
  | VanityMineStartMessage
  | { type: 'cancel' };

type VanityWorkerOutboundMessage =
  | { type: 'progress'; attempts: number; rate: number; currentAddress: string }
  | { type: 'found'; attempts: number; rate: number; address: string; salt: Hex }
  | { type: 'cancelled'; attempts: number }
  | { type: 'error'; message: string };

let cancelled = false;

function post(message: VanityWorkerOutboundMessage) {
  self.postMessage(message);
}

function mine(message: VanityMineStartMessage) {
  cancelled = false;
  const params: VanityTokenParams = {
    factoryAddress: message.factoryAddress,
    creatorAddress: message.creatorAddress,
    name: message.name,
    symbol: message.symbol,
    tokenImage: message.tokenImage,
    description: message.description,
  };
  const batchSize = message.batchSize ?? 2048;
  const progressIntervalMs = message.progressIntervalMs ?? 160;
  const initCodeHash = computeMemeTokenInitCodeHash(params);
  const startedAt = performance.now();
  let attempts = 0;
  let lastProgressAt = startedAt;

  const runBatch = () => {
    try {
      let currentAddress = '';
      for (let index = 0; index < batchSize; index++) {
        if (cancelled) {
          post({ type: 'cancelled', attempts });
          return;
        }

        const salt = createRandomUserSalt();
        const address = predictMemeTokenAddress(params, salt, initCodeHash);
        attempts++;
        currentAddress = address;

        if (isCafePrefixedAddress(address)) {
          const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
          post({
            type: 'found',
            attempts,
            rate: attempts / elapsedSeconds,
            address,
            salt,
          });
          return;
        }
      }

      const now = performance.now();
      if (now - lastProgressAt >= progressIntervalMs) {
        const elapsedSeconds = Math.max((now - startedAt) / 1000, 0.001);
        post({
          type: 'progress',
          attempts,
          rate: attempts / elapsedSeconds,
          currentAddress,
        });
        lastProgressAt = now;
      }

      setTimeout(runBatch, 0);
    } catch (cause) {
      post({
        type: 'error',
        message: cause instanceof Error ? cause.message : 'Vanity mining failed',
      });
    }
  };

  runBatch();
}

self.onmessage = (event: MessageEvent<VanityWorkerInboundMessage>) => {
  if (event.data.type === 'cancel') {
    cancelled = true;
    return;
  }

  mine(event.data);
};

export {};
