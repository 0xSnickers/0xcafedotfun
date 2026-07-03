'use client';

import { useCallback, useState } from 'react';

const TRADE_CONFIRMATION_STORAGE_KEY = '0xcafe.tradeConfirmationEnabled';

export function useTradeConfirmationPreference() {
  const [confirmBeforeTrade, setConfirmBeforeTradeState] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      return window.localStorage.getItem(TRADE_CONFIRMATION_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const setConfirmBeforeTrade = useCallback((enabled: boolean) => {
    setConfirmBeforeTradeState(enabled);
    try {
      localStorage.setItem(TRADE_CONFIRMATION_STORAGE_KEY, String(enabled));
    } catch {
      // Ignore storage failures; the in-memory setting still applies.
    }
  }, []);

  return { confirmBeforeTrade, setConfirmBeforeTrade };
}
