'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getDexAddresses,
  parseDexInputAmount,
  quoteDexExactInput,
  swapDexExactInput,
  type DexAddresses,
  type DexQuote,
  type DexTradeMode,
} from '@/lib/market/dexTradeClient';
import type { Address } from '@/lib/market/tokenMarketClient';

export function useDexTrade(tokenAddress: string) {
  const [dexAddresses, setDexAddresses] = useState<DexAddresses | null>(null);
  const [quote, setQuote] = useState<DexQuote | null>(null);
  const [isAddressLoading, setIsAddressLoading] = useState(false);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadDexAddresses = useCallback(async () => {
    setIsAddressLoading(true);
    try {
      const addresses = await getDexAddresses();
      setDexAddresses(addresses);
      return addresses;
    } catch (cause) {
      const nextError = cause instanceof Error ? cause : new Error('Failed to load DEX addresses');
      setError(nextError);
      throw nextError;
    } finally {
      setIsAddressLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDexAddresses().catch(() => undefined);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDexAddresses]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuote(null);
      setError(null);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [tokenAddress]);

  const quoteExactInput = useCallback(async (mode: DexTradeMode, amount: string) => {
    setIsQuoteLoading(true);
    setQuote(null);
    try {
      const amountIn = parseDexInputAmount(amount);
      const nextQuote = await quoteDexExactInput(mode, tokenAddress as Address, amountIn);
      setQuote(nextQuote);
      setError(null);
      return nextQuote;
    } catch (cause) {
      const nextError = cause instanceof Error ? cause : new Error('DEX quote failed');
      setError(nextError);
      throw nextError;
    } finally {
      setIsQuoteLoading(false);
    }
  }, [tokenAddress]);

  const swapExactInput = useCallback(async (params: {
    mode: DexTradeMode;
    amount: string;
    minAmountOut: bigint;
    recipient: Address;
  }) => {
    setIsSwapping(true);
    try {
      const amountIn = parseDexInputAmount(params.amount);
      return await swapDexExactInput({
        mode: params.mode,
        tokenAddress: tokenAddress as Address,
        amountIn,
        minAmountOut: params.minAmountOut,
        recipient: params.recipient,
      });
    } finally {
      setIsSwapping(false);
    }
  }, [tokenAddress]);

  return {
    dexAddresses,
    quote,
    error,
    isAddressLoading,
    isQuoteLoading,
    isSwapping,
    loadDexAddresses,
    quoteExactInput,
    swapExactInput,
  };
}
