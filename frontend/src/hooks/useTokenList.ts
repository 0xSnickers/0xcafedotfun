'use client';

import { useCallback, useEffect, useState } from 'react';
import { readContract } from 'wagmi/actions';
import { config } from '@/config/wagmi';
import { MEME_FACTORY_ABI, MEME_TOKEN_ABI } from '@/config/abis';
import { DEFAULT_CHAIN_ID, getContractAddresses } from '@/config/contracts';
import {
  getMarketList,
  getMarketConfig,
  getMarketSummary,
  getMarketTrades,
  parsePriceChangePercent,
  type MarketSummary,
  type MarketTrade,
} from '@/lib/marketApi';
import { getMarketState, resolveMarketAddress } from '@/lib/market/tokenMarketClient';
import { formatRawAssetValue } from '@/lib/formatters/market';
import { MARKET_STAGE } from '@/lib/marketStages';

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  currentPrice: string;
  priceChange24h: number | null;
  volume24h: number | null;
  volume24hComplete: boolean | null;
  marketCap: string;
  creator: string;
  createdAt: number;
  tokenImage: string;
  description: string;
  graduated: boolean;
}

const hiddenTokenAddresses = new Set(
  (process.env.NEXT_PUBLIC_HIDDEN_TOKEN_ADDRESSES ?? '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean),
);
const hideLocalE2ETokens = process.env.NEXT_PUBLIC_HIDE_LOCAL_E2E_TOKENS !== 'false';
const isMainnet = DEFAULT_CHAIN_ID === 1;
const isLocalChain = DEFAULT_CHAIN_ID === 31337;
const fallbackTokenLimit = Number(process.env.NEXT_PUBLIC_MARKET_LIST_FALLBACK_LIMIT ?? '20');
const marketListFallbackLogsEnabled = process.env.NEXT_PUBLIC_MARKET_LIST_FALLBACK_LOGS !== 'false';

function logMarketListFallback(message: string, details?: Record<string, unknown>) {
  if (!marketListFallbackLogsEnabled) return;
  console.warn(`[market-list-fallback] ${message}`, details ?? {});
}

function getMarketListFallbackLimit(limit: number): number {
  if (isLocalChain) return Math.max(limit * 3, limit);
  if (isMainnet && process.env.NEXT_PUBLIC_ENABLE_MARKET_LIST_CHAIN_FALLBACK !== 'true') return 0;
  if (Number.isFinite(fallbackTokenLimit) && fallbackTokenLimit > 0) {
    return Math.min(fallbackTokenLimit, Math.max(limit * 3, limit));
  }
  return Math.max(limit, 1);
}

function isLocalE2EToken(name: string | null | undefined, symbol: string | null | undefined) {
  return (
    hideLocalE2ETokens &&
    name?.trim().toLowerCase() === 'local formal token' &&
    symbol?.trim().toLowerCase() === 'lft'
  );
}

function isHiddenTokenAddress(tokenAddress: string) {
  return hiddenTokenAddresses.has(tokenAddress.toLowerCase());
}

function computeFallbackPriceChange24h(summary: MarketSummary, trades: MarketTrade[]): number | null {
  const latestPrice = summary.latestPrice;
  if (latestPrice === null || latestPrice === 0 || trades.length === 0) {
    return null;
  }

  const windowEnd = summary.lastTradeAt ?? Math.floor(Date.now() / 1000);
  const windowStart = windowEnd - 24 * 60 * 60;
  const referenceTrade = [...trades]
    .filter((trade) => trade.timestamp >= windowStart && trade.timestamp <= windowEnd)
    .sort((left, right) => left.timestamp - right.timestamp)[0];

  const referencePrice = referenceTrade?.executionPrice ?? referenceTrade?.markPrice ?? null;
  if (referencePrice === null || referencePrice === 0) {
    return null;
  }

  return ((latestPrice - referencePrice) / referencePrice) * 100;
}

async function getTokenMetadata(tokenAddress: string) {
  const [name, symbol] = await Promise.all([
    readContract(config, {
      address: tokenAddress as `0x${string}`,
      abi: MEME_TOKEN_ABI,
      functionName: 'name',
      chainId: DEFAULT_CHAIN_ID,
    }) as Promise<string>,
    readContract(config, {
      address: tokenAddress as `0x${string}`,
      abi: MEME_TOKEN_ABI,
      functionName: 'symbol',
      chainId: DEFAULT_CHAIN_ID,
    }) as Promise<string>,
  ]);

  return { name, symbol };
}

function marketAddressFromConfig(marketAddress: string | null | undefined): `0x${string}` | null {
  return marketAddress && !/^0x0{40}$/i.test(marketAddress)
    ? marketAddress as `0x${string}`
    : null;
}

export function useTokenList(enabled = true, limit = 20) {
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchTokenList = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);

    const fetchChainFallbackRows = async (
      excludedTokenAddresses = new Set<string>(),
      desiredLimit = limit,
      throwWhenDisabled = true,
    ): Promise<TokenInfo[]> => {
      const maxFallbackTokens = getMarketListFallbackLimit(limit);
      if (maxFallbackTokens <= 0) {
        logMarketListFallback('chain fan-out fallback disabled', {
          chainId: DEFAULT_CHAIN_ID,
          requestedLimit: limit,
        });
        if (throwWhenDisabled) {
          throw new Error('Market list API is unavailable and chain fallback is disabled for this environment');
        }
        return [];
      }

      const factoryAddress = getContractAddresses(DEFAULT_CHAIN_ID).MEME_FACTORY;
      if (!factoryAddress) throw new Error('MemeFactory address is not configured');
      const tokens = await readContract(config, {
        address: factoryAddress as `0x${string}`,
        abi: MEME_FACTORY_ABI,
        functionName: 'getAllMemeTokens',
        chainId: DEFAULT_CHAIN_ID,
      }) as string[];

      const visibleTokens = tokens.filter((tokenAddress) => {
        const normalizedTokenAddress = tokenAddress.toLowerCase();
        return (
          !isHiddenTokenAddress(tokenAddress) &&
          !excludedTokenAddresses.has(normalizedTokenAddress)
        );
      });
      const fallbackTokens = visibleTokens
        .slice(-maxFallbackTokens)
        .reverse();
      const hiddenCount = tokens.length - visibleTokens.length - excludedTokenAddresses.size;
      let failedTokenCount = 0;
      let filteredTokenCount = 0;

      logMarketListFallback('chain fan-out fallback started', {
        chainId: DEFAULT_CHAIN_ID,
        totalTokens: tokens.length,
        hiddenCount: Math.max(hiddenCount, 0),
        excludedCount: excludedTokenAddresses.size,
        fallbackTokenLimit: maxFallbackTokens,
        fanOutCount: fallbackTokens.length,
      });

      const rows = await Promise.all(fallbackTokens
        .map(async (tokenAddress) => {
          try {
            const marketConfigResult = await getMarketConfig(tokenAddress)
              .then((value) => ({ status: 'fulfilled' as const, value }))
              .catch((reason) => ({ status: 'rejected' as const, reason }));
            const summaryResult = await getMarketSummary(tokenAddress)
              .then((value) => ({ status: 'fulfilled' as const, value }))
              .catch((reason) => ({ status: 'rejected' as const, reason }));
            const marketConfig = marketConfigResult.status === 'fulfilled'
              ? marketConfigResult.value
              : null;
            const summary = summaryResult.status === 'fulfilled'
              ? summaryResult.value
              : null;
            const marketAddress =
              marketAddressFromConfig(marketConfig?.marketAddress) ??
              await resolveMarketAddress(tokenAddress as `0x${string}`, { skipConfigLookup: true });
            const state = await getMarketState(marketAddress);

            let name = marketConfig?.name ?? null;
            let symbol = marketConfig?.symbol ?? null;

            if (!name || !symbol) {
              const metadata = await getTokenMetadata(tokenAddress);
              name = name ?? metadata.name;
              symbol = symbol ?? metadata.symbol;
            }

            if (isLocalE2EToken(name, symbol)) {
              filteredTokenCount += 1;
              return null;
            }

            let priceChange24h = summary
              ? parsePriceChangePercent(summary.priceChangePercent24h)
              : null;
            if (summary && priceChange24h === null) {
              try {
                const tradesPage = await getMarketTrades(tokenAddress, { limit: 100 });
                priceChange24h = computeFallbackPriceChange24h(summary, tradesPage.trades);
              } catch (error) {
                logMarketListFallback('fallback trade stats unavailable', {
                  chainId: DEFAULT_CHAIN_ID,
                  tokenAddress,
                  error,
                });
              }
            }

            return {
              address: tokenAddress,
              name: name || 'Unnamed Token',
              symbol: symbol || 'TOKEN',
              currentPrice: formatRawAssetValue(state.currentPriceX18, 18, { group: false }),
              priceChange24h,
              volume24h: summary
                ? Number(formatRawAssetValue(summary.volume24h, 18, { group: false }))
                : 0,
              volume24hComplete: summary?.volume24hComplete ?? true,
              marketCap: formatRawAssetValue(state.currentMarketCap, 18, { group: false }),
              creator: marketConfig?.creatorAddress || state.creator,
              createdAt: 0,
              tokenImage: marketConfig?.tokenImage || '',
              description: marketConfig?.description || '',
              graduated:
                summary?.marketStage === 'dex_live' ||
                marketConfig?.stage === 'dex_live' ||
                state.stage === MARKET_STAGE.DEX_LIVE,
            } satisfies TokenInfo;
          } catch (error) {
            failedTokenCount += 1;
            logMarketListFallback('token fan-out failed', {
              chainId: DEFAULT_CHAIN_ID,
              tokenAddress,
              error,
            });
            return null;
          }
      }));
      const nextRows = (rows.filter(Boolean) as TokenInfo[]).slice(0, desiredLimit);
      logMarketListFallback('chain fan-out fallback completed', {
        chainId: DEFAULT_CHAIN_ID,
        fanOutCount: fallbackTokens.length,
        successCount: nextRows.length,
        failedTokenCount,
        filteredTokenCount,
      });
      return nextRows;
    };

    try {
      try {
        const markets = await getMarketList({ limit: Math.max(limit * 3, limit) });
        const rows = markets
          .filter((market) => !isHiddenTokenAddress(market.tokenAddress))
          .filter((market) => !isLocalE2EToken(market.name, market.symbol))
          .map((market) => ({
            address: market.tokenAddress,
            name: market.name || 'Unnamed Token',
            symbol: market.symbol || 'TOKEN',
            currentPrice: formatRawAssetValue(market.currentPrice, 18, { group: false }),
            priceChange24h: parsePriceChangePercent(market.priceChangePercent24h),
            volume24h: Number(formatRawAssetValue(market.volume24h, 18, { group: false })),
            volume24hComplete: market.volume24hComplete,
            marketCap: formatRawAssetValue(market.currentMarketCap, 18, { group: false }),
            creator: market.creatorAddress || '',
            createdAt: market.createdAt ?? 0,
            tokenImage: market.tokenImage || '',
            description: market.description || '',
            graduated: market.stage === 'dex_live',
          } satisfies TokenInfo))
          .slice(0, limit);

        if (rows.length < limit) {
          const excludedTokenAddresses = new Set(
            rows.map((row) => row.address.toLowerCase()),
          );
          const supplementRows = await fetchChainFallbackRows(
            excludedTokenAddresses,
            limit - rows.length,
            false,
          );
          setTokenList([...rows, ...supplementRows].slice(0, limit));
          return;
        }

        setTokenList(rows);
        return;
      } catch (apiError) {
        logMarketListFallback('aggregate API failed; evaluating chain fan-out fallback', {
          chainId: DEFAULT_CHAIN_ID,
          requestedLimit: limit,
          error: apiError,
        });
      }

      setTokenList(await fetchChainFallbackRows());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load markets');
    } finally {
      setIsLoading(false);
    }
  }, [enabled, limit]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void fetchTokenList();
    }, 0);
    const timer = window.setInterval(() => void fetchTokenList(), 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [fetchTokenList]);

  return { tokenList, isLoading, error, refetch: fetchTokenList };
}
