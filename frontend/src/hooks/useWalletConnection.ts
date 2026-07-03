const WALLET_MANUAL_CONNECT_KEY = 'wallet.manualConnect';

export function useWalletConnection() {
  const handleManualConnect = () => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(WALLET_MANUAL_CONNECT_KEY, 'true');
  };

  const handleManualDisconnect = () => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.removeItem(WALLET_MANUAL_CONNECT_KEY);
  };

  return {
    handleManualConnect,
    handleManualDisconnect,
  };
}
