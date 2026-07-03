'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  getMarketConfig,
  getMarketSummary,
  parsePriceChangePercent,
  type MarketSummary,
} from '@/lib/marketApi';
import { getPools } from '@/lib/poolsApi';
import { getMarketState, getTokenMetadata, resolveMarketAddress } from '@/lib/market/tokenMarketClient';
import { formatAssetValue, formatRawAssetValue } from '@/lib/formatters/market';
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { isGraduationPendingStage, MARKET_STAGE } from '@/lib/marketStages';

export interface TradeTokenMeta {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  createdAt: number;
  tokenImage: string;
  description: string;
}

export interface TradeTokenDetails {
  tokenAddress: string;
  marketAddress: string;
  creator: string;
  currentPrice: string;
  marketCap: string;
  currentSupply: string;
  targetSupply: string;
  targetMarketCap: string;
  totalRaised: string;
  marketStage: 'bonding_curve_live' | 'graduated_pending_liquidity' | 'dex_live' | null;
  graduated: boolean;
  volume24h: string;
  priceChange24h: number | null;
  pairAddress: string | null;
}

const PRICE_CHANGE_PERCENT_SCALE = 100_000_000n;
const PRICE_CHANGE_PERCENT_DISPLAY_SCALE = 1_000_000;
const WARNING_COOLDOWN_MS = 30_000;
const warningTimestamps = new Map<string, number>();
const subscribeToClientSnapshot = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function useMountedClient() {
  return useSyncExternalStore(subscribeToClientSnapshot, getClientSnapshot, getServerSnapshot);
}

function marketStageFromChain(stage: number): TradeTokenDetails['marketStage'] {
  if (stage === MARKET_STAGE.ACTIVE) return 'bonding_curve_live';
  if (isGraduationPendingStage(stage)) return 'graduated_pending_liquidity';
  if (stage === MARKET_STAGE.DEX_LIVE) return 'dex_live';
  return null;
}

function computeInitialPriceChangePercent(
  currentPriceX18: bigint,
  initialPriceX18: bigint,
): number | null {
  if (initialPriceX18 === 0n) return null;
  const scaledPercent = ((currentPriceX18 - initialPriceX18) * PRICE_CHANGE_PERCENT_SCALE) / initialPriceX18;
  return Number(scaledPercent) / PRICE_CHANGE_PERCENT_DISPLAY_SCALE;
}

function warnWithCooldown(key: string, message: string, error: unknown) {
  const now = Date.now();
  const lastWarningAt = warningTimestamps.get(key) ?? 0;
  if (now - lastWarningAt < WARNING_COOLDOWN_MS) {
    return;
  }

  warningTimestamps.set(key, now);
  console.warn(message, error);
}

export function useTokenInfo(tokenAddress: string) {
  const mounted = useMountedClient();
  const [tokenDetails, setTokenDetails] = useState<TradeTokenDetails | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TradeTokenMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const {
    balance: tokenBalance,
    isLoading: isTokenBalanceLoading,
    refetch: refetchTokenBalance,
  } = useTokenBalance(tokenAddress || '');

  const fetchTokenInfo = useCallback(async () => {
    if (!tokenAddress) return;
    setLoading(true);

    let marketConfig: Awaited<ReturnType<typeof getMarketConfig>> | null = null;
    let marketAddress: `0x${string}` | null = null;

    try {
      try {
        marketConfig = await getMarketConfig(tokenAddress);
        marketAddress = marketConfig.marketAddress as `0x${string}`;
      } catch (error) {
        console.warn('Failed to load market config, falling back to chain lookup:', error);
      }

      if (marketAddress === null) {
        marketAddress = await resolveMarketAddress(tokenAddress as `0x${string}`, { skipConfigLookup: true });
      }

      const resolvedMarketConfig = marketConfig;
      const resolvedMarketAddress = marketAddress;

      let summary: MarketSummary | null = null;
      try {
        summary = await getMarketSummary(tokenAddress);
      } catch (error) {
        warnWithCooldown(
          `${tokenAddress}:market-summary`,
          'Failed to refresh market summary, continuing with config and cached UI state:',
          error,
        );
      }

      let state: Awaited<ReturnType<typeof getMarketState>> | null = null;
      try {
        state = await getMarketState(resolvedMarketAddress);
      } catch (error) {
        warnWithCooldown(
          `${tokenAddress}:live-market-state`,
          'Failed to load live market state, keeping summary/config fallback:',
          error,
        );
      }

      let tokenMetadata: Awaited<ReturnType<typeof getTokenMetadata>> | null = null;
      if (!resolvedMarketConfig?.name || !resolvedMarketConfig?.symbol) {
        try {
          tokenMetadata = await getTokenMetadata(tokenAddress as `0x${string}`);
        } catch (error) {
          warnWithCooldown(
            `${tokenAddress}:token-metadata`,
            'Failed to load token metadata from chain, keeping config/previous fallback:',
            error,
          );
        }
      }

      const summaryPriceChange24h = summary !== null
        ? parsePriceChangePercent(summary.priceChangePercent24h)
        : null;

      const chainFallbackPriceChange24h = state !== null
        ? computeInitialPriceChangePercent(state.currentPriceX18, state.initialPriceX18)
        : null;

      const resolvedMarketStage =
        (state ? marketStageFromChain(state.stage) : null) ??
        summary?.marketStage ??
        resolvedMarketConfig?.stage ??
        null;
      let poolLiquidity: string | null = null;

      if (
        resolvedMarketStage === 'dex_live' &&
        (summary?.liquidityQuote === null || summary?.liquidityQuote === undefined)
      ) {
        try {
          const pools = await getPools({ limit: 200 });
          const pool = pools.find(
            (item) => item.tokenAddress.toLowerCase() === tokenAddress.toLowerCase(),
          );
          poolLiquidity = pool?.liquidityQuote === null || pool?.liquidityQuote === undefined
            ? null
            : formatAssetValue(pool.liquidityQuote, { group: false });
        } catch (error) {
          warnWithCooldown(
            `${tokenAddress}:pool-liquidity`,
            'Failed to load DEX pool liquidity fallback:',
            error,
          );
        }
      }

      setTokenInfo((previous) => ({
        address: tokenAddress,
        name:
          resolvedMarketConfig?.name ||
          tokenMetadata?.name ||
          (previous?.address === tokenAddress ? previous.name : '') ||
          'Unnamed Token',
        symbol:
          resolvedMarketConfig?.symbol ||
          tokenMetadata?.symbol ||
          (previous?.address === tokenAddress ? previous.symbol : '') ||
          'TOKEN',
        creator: resolvedMarketConfig?.creatorAddress || state?.creator || previous?.creator || '',
        createdAt: 0,
        tokenImage: resolvedMarketConfig?.tokenImage || '',
        description: resolvedMarketConfig?.description || '',
      }));
      setTokenDetails((previous) => {
        const creator = resolvedMarketConfig?.creatorAddress || state?.creator || previous?.creator || '';
        const marketStage =
          resolvedMarketStage ??
          previous?.marketStage ??
          null;
        const dexLiquidity =
          marketStage === 'dex_live' && summary?.liquidityQuote !== null && summary?.liquidityQuote !== undefined
            ? formatRawAssetValue(summary.liquidityQuote, 18, { group: false })
            : marketStage === 'dex_live'
              ? poolLiquidity
            : null;

        return {
          tokenAddress,
          marketAddress: resolvedMarketAddress,
          creator,
          currentPrice:
            state !== null
              ? formatRawAssetValue(state.currentPriceX18, 18, { group: false })
              : previous?.tokenAddress === tokenAddress
                ? previous.currentPrice
                : '0.0',
          marketCap:
            state !== null
              ? formatRawAssetValue(state.currentMarketCap, 18, { group: false })
              : previous?.tokenAddress === tokenAddress
                ? previous.marketCap
                : '0.0',
          currentSupply:
            state !== null
              ? formatRawAssetValue(state.curveSupply, 18, { group: false })
              : previous?.tokenAddress === tokenAddress
                ? previous.currentSupply
                : '0.0',
          targetSupply:
            state !== null
              ? formatRawAssetValue(state.targetSupply, 18, { group: false })
              : previous?.tokenAddress === tokenAddress
                ? previous.targetSupply
                : '0.0',
          targetMarketCap:
            state !== null
              ? formatRawAssetValue(state.graduationMarketCap, 18, { group: false })
              : previous?.tokenAddress === tokenAddress
                ? previous.targetMarketCap
                : '0.0',
          totalRaised:
            dexLiquidity ??
            (state !== null
              ? formatRawAssetValue(state.reserveBalance, 18, { group: false })
              : previous?.tokenAddress === tokenAddress
                ? previous.totalRaised
                : '0.0'),
          marketStage,
          graduated: marketStage === 'dex_live',
          volume24h:
            summary !== null
              ? formatRawAssetValue(summary.volume24h, 18, { group: false })
              : previous?.tokenAddress === tokenAddress
                ? previous.volume24h
                : '0.0',
          priceChange24h:
            summaryPriceChange24h ??
            chainFallbackPriceChange24h ??
            (previous?.tokenAddress === tokenAddress ? previous.priceChange24h : null),
          pairAddress:
            summary?.pairAddress ??
            resolvedMarketConfig?.pairAddress ??
            (previous?.tokenAddress === tokenAddress ? previous.pairAddress : null),
        };
      });
    } catch (error) {
      console.error('Failed to load formal market data:', error);
      if (marketAddress === null) {
        setTokenInfo(null);
        setTokenDetails(null);
      }
    } finally {
      setLoading(false);
      setInitialDataLoaded(true);
    }
  }, [tokenAddress]);

  useEffect(() => {
    if (!mounted || !tokenAddress) return;

    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      await fetchTokenInfo();
      if (cancelled) return;
      timer = window.setTimeout(() => void poll(), 5_000);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [fetchTokenInfo, mounted, tokenAddress]);


  return {
    mounted,
    wagmiReady: mounted,
    isReady: mounted,
    tokenInfo,
    tokenDetails,
    loading,
    initialDataLoaded,
    tokenBalance,
    isTokenBalanceLoading,
    refetchTokenBalance,
    refetch: fetchTokenInfo,
  };
}
