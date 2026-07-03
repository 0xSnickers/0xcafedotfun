'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseUnits } from 'viem';
import { readContract, writeContract } from 'wagmi/actions';
import { config } from '@/config/wagmi';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';
import { MEME_TOKEN_ABI } from '@/config/abis';
import {
  Address,
  buy,
  getMarketState,
  quoteBuyExactEth,
  quoteBuyExactTokens,
  quoteSell,
  resolveMarketAddress,
  sell,
} from '@/lib/market/tokenMarketClient';

export { useDebounce } from '@/hooks/market/useDebounce';
export { marketUtils } from '@/hooks/market/utils';

export interface TokenPriceInfo {
  ethCost: bigint;
  afterFeesCost: bigint;
  platformFee: bigint;
  creatorFee: bigint;
}

export interface SellPriceInfo {
  ethBeforeFees: bigint;
  ethReceived: bigint;
  platformFee: bigint;
  creatorFee: bigint;
}

export interface BuyQuoteLimit {
  maxGrossEthIn: bigint;
  estimatedLaunchTokenOut: bigint;
}

export interface BuyQuoteResult {
  tokenAmount: bigint;
  priceInfo: TokenPriceInfo;
  quoteLimit: BuyQuoteLimit | null;
}

export interface MarketParams {
  targetSupply: bigint;
  currentSupply: bigint;
  currentPrice: bigint;
  targetMarketCap: bigint;
  reserveBalance: bigint;
  creator: string;
  stage: number;
  isActive: boolean;
  buyPaused: boolean;
  sellPaused: boolean;
}

export function useTokenAllowance(tokenAddress: string, spenderAddress: string) {
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkAllowance = useCallback(async (userAddress: string) => {
    if (!tokenAddress || !spenderAddress || !userAddress) return;
    setIsLoading(true);
    try {
      setAllowance(await readContract(config, {
        address: tokenAddress as Address,
        abi: MEME_TOKEN_ABI,
        functionName: 'allowance',
        args: [userAddress as Address, spenderAddress as Address],
        chainId: DEFAULT_CHAIN_ID,
      }) as bigint);
    } finally {
      setIsLoading(false);
    }
  }, [spenderAddress, tokenAddress]);

  return { allowance, checkAllowance, isLoading };
}

export function useApproveToken() {
  const [isLoading, setIsLoading] = useState(false);
  const approveToken = useCallback(async (tokenAddress: string, spenderAddress: string, _amount: bigint) => {
    void _amount;
    setIsLoading(true);
    try {
      return await writeContract(config, {
        address: tokenAddress as Address,
        abi: MEME_TOKEN_ABI,
        functionName: 'approve',
        args: [spenderAddress as Address, 2n ** 256n - 1n],
        chainId: DEFAULT_CHAIN_ID,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);
  return { approveToken, isLoading };
}

export function useMarket(tokenAddress: string) {
  const [marketAddress, setMarketAddress] = useState<Address | null>(null);
  const [tokenAmount, setTokenAmount] = useState<bigint | null>(null);
  const [priceInfo, setPriceInfo] = useState<TokenPriceInfo | null>(null);
  const [sellPriceInfo, setSellPriceInfo] = useState<SellPriceInfo | null>(null);
  const [buyQuoteLimit, setBuyQuoteLimit] = useState<BuyQuoteLimit | null>(null);
  const [marketParams, setMarketParams] = useState<MarketParams | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [isStateLoading, setIsStateLoading] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const resolve = useCallback(async () => {
    if (!tokenAddress) return null;
    if (marketAddress) return marketAddress;
    const resolved = await resolveMarketAddress(tokenAddress as Address);
    setMarketAddress(resolved);
    return resolved;
  }, [marketAddress, tokenAddress]);

  const fetchMarketParams = useCallback(async () => {
    setIsStateLoading(true);
    try {
      const market = await resolve();
      if (!market) return null;
      const state = await getMarketState(market);
      setMarketParams({
        targetSupply: state.targetSupply,
        currentSupply: state.curveSupply,
        currentPrice: state.currentPriceX18,
        targetMarketCap: state.graduationMarketCap,
        reserveBalance: state.reserveBalance,
        creator: state.creator,
        stage: state.stage,
        isActive: state.stage === 0 && !state.buyPaused && !state.sellPaused,
        buyPaused: state.buyPaused,
        sellPaused: state.sellPaused,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Failed to load market state'));
    } finally {
      setIsStateLoading(false);
    }
  }, [resolve]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMarketAddress(null);
      setMarketParams(null);
      setTokenAmount(null);
      setPriceInfo(null);
      setSellPriceInfo(null);
      setBuyQuoteLimit(null);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [tokenAddress]);

  useEffect(() => {
    if (!tokenAddress) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void fetchMarketParams();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchMarketParams, tokenAddress]);

  const calculateTokensForETH = useCallback(async (ethAmount: string): Promise<BuyQuoteResult | null> => {
    setIsQuoteLoading(true);
    setTokenAmount(null);
    setPriceInfo(null);
    setBuyQuoteLimit(null);
    try {
      const market = await resolve();
      if (!market) return null;
      const grossEthIn = parseUnits(ethAmount, 18);
      const quote = await quoteBuyExactEth(market, grossEthIn);
      const nextPriceInfo = {
        ethCost: quote.reserveIncrease,
        afterFeesCost: quote.grossEthIn,
        platformFee: quote.platformFee,
        creatorFee: quote.creatorFee,
      };
      setTokenAmount(quote.tokenOut);
      setPriceInfo(nextPriceInfo);
      return {
        tokenAmount: quote.tokenOut,
        priceInfo: nextPriceInfo,
        quoteLimit: null,
      };
    } catch (cause) {
      try {
        const market = await resolve();
        if (!market) return null;
        const grossEthIn = parseUnits(ethAmount, 18);
        const state = await getMarketState(market);
        const remainingTokenOut = state.targetSupply > state.curveSupply
          ? state.targetSupply - state.curveSupply
          : 0n;

        if (remainingTokenOut > 0n) {
          const maxQuote = await quoteBuyExactTokens(market, remainingTokenOut);
          if (grossEthIn <= maxQuote.grossEthIn) {
            throw cause;
          }
          const nextPriceInfo = {
            ethCost: maxQuote.reserveIncrease,
            afterFeesCost: maxQuote.grossEthIn,
            platformFee: maxQuote.platformFee,
            creatorFee: maxQuote.creatorFee,
          };
          const quoteLimit = {
            maxGrossEthIn: maxQuote.grossEthIn,
            estimatedLaunchTokenOut: maxQuote.tokenOut,
          };
          setTokenAmount(maxQuote.tokenOut);
          setPriceInfo(nextPriceInfo);
          setBuyQuoteLimit(quoteLimit);
          return {
            tokenAmount: maxQuote.tokenOut,
            priceInfo: nextPriceInfo,
            quoteLimit,
          };
        }
      } catch {
        // Keep the original quote failure below.
      }
      setError(cause instanceof Error ? cause : new Error('Failed to quote buy'));
      setTokenAmount(null);
      setPriceInfo(null);
      setBuyQuoteLimit(null);
      return null;
    } finally {
      setIsQuoteLoading(false);
    }
  }, [resolve]);

  const calculateBuyPrice = useCallback(async (amount: string): Promise<TokenPriceInfo | null> => {
    setIsQuoteLoading(true);
    setPriceInfo(null);
    try {
      const market = await resolve();
      if (!market) return null;
      const quote = await quoteBuyExactTokens(market, parseUnits(amount, 18));
      const nextPriceInfo = {
        ethCost: quote.reserveIncrease,
        afterFeesCost: quote.grossEthIn,
        platformFee: quote.platformFee,
        creatorFee: quote.creatorFee,
      };
      setPriceInfo(nextPriceInfo);
      return nextPriceInfo;
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Failed to quote buy'));
      setPriceInfo(null);
      return null;
    } finally {
      setIsQuoteLoading(false);
    }
  }, [resolve]);

  const calculateSellPrice = useCallback(async (amount: string): Promise<SellPriceInfo | null> => {
    setIsQuoteLoading(true);
    setSellPriceInfo(null);
    try {
      const market = await resolve();
      if (!market) return null;
      const quote = await quoteSell(market, parseUnits(amount, 18));
      const nextSellPriceInfo = {
        ethBeforeFees: quote.grossEthOut,
        ethReceived: quote.sellerReceives,
        platformFee: quote.platformFee,
        creatorFee: quote.creatorFee,
      };
      setSellPriceInfo(nextSellPriceInfo);
      return nextSellPriceInfo;
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Failed to quote sell'));
      setSellPriceInfo(null);
      return null;
    } finally {
      setIsQuoteLoading(false);
    }
  }, [resolve]);

  const buyTokens = useCallback(async (_token: string, ethAmount: string, minTokenAmount: string) => {
    setIsBuying(true);
    try {
      const market = await resolve();
      if (!market) throw new Error('Market address is unavailable');
      return await buy(market, parseUnits(ethAmount, 18), parseUnits(minTokenAmount, 18));
    } finally {
      setIsBuying(false);
    }
  }, [resolve]);

  const sellTokens = useCallback(async (_token: string, amount: string, minEthReceived: string) => {
    setIsSelling(true);
    try {
      const market = await resolve();
      if (!market) throw new Error('Market address is unavailable');
      return await sell(market, parseUnits(amount, 18), parseUnits(minEthReceived, 18));
    } finally {
      setIsSelling(false);
    }
  }, [resolve]);

  return useMemo(() => ({
    marketAddress,
    tokenAmount,
    priceInfo,
    sellPriceInfo,
    buyQuoteLimit,
    marketParams,
    curveParams: marketParams,
    calculateTokensForETH,
    calculateBuyPrice,
    calculateSellPrice,
    fetchMarketParams,
    fetchCurveParams: fetchMarketParams,
    buyTokens,
    sellTokens,
    isMarketOpen: marketParams?.isActive ?? false,
    isGraduated: marketParams ? marketParams.stage !== 0 : null,
    isBuyPriceLoading: isQuoteLoading,
    isSellPriceLoading: isQuoteLoading,
    isTokenAmountLoading: isQuoteLoading,
    isCurveParamsLoading: isStateLoading,
    isBuying,
    isSelling,
    error,
  }), [
    marketAddress, tokenAmount, priceInfo, sellPriceInfo, buyQuoteLimit, marketParams,
    calculateTokensForETH, calculateBuyPrice, calculateSellPrice,
    fetchMarketParams, buyTokens, sellTokens, isQuoteLoading, isStateLoading,
    isBuying, isSelling, error,
  ]);
}
