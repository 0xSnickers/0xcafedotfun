/**
 * 清理钱包连接相关的本地存储，防止自动弹窗
 */
export function clearWalletStorage() {
  if (typeof window === 'undefined') return;

  console.log('清理钱包存储...');

  // 清理 WalletConnect 相关的存储
  const keysToRemove = [
    'walletconnect',
    'WALLETCONNECT_DEEPLINK_CHOICE', 
    'wc@2:client:0.3//session',
    'wc@2:core:0.3//messages',
    'wc@2:core:0.3//subscription',
    'wc@2:core:0.3//keychain',
    'wc@2:core:0.3//pairing',
    'wc@2:ethereum_provider:/optionalChains',
    'wc@2:ethereum_provider:/chainId',
    'wc@2:ethereum_provider:/accounts',
    // Wagmi 相关
    'wagmi.cache',
    'wagmi.store',
    'wagmi.connected',
    'wagmi.wallet',
    // RainbowKit 相关
    'rk-recent',
    'rainbow-recent-wallet',
  ];

  keysToRemove.forEach(key => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove ${key}:`, error);
    }
  });

  // 清理以特定前缀开头的所有键
  const prefixesToClear = ['wc@2:', 'wagmi.', 'rk-'];
  
  [...Object.keys(localStorage), ...Object.keys(sessionStorage)].forEach(key => {
    prefixesToClear.forEach(prefix => {
      if (key.startsWith(prefix)) {
        try {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        } catch (error) {
          console.warn(`Failed to remove prefixed key ${key}:`, error);
        }
      }
    });
  });

  console.log('钱包存储清理完成');
}

/**
 * 在应用加载时自动清理钱包存储（仅开发环境）
 */
export function autoCleanWalletStorageInDev() {
  if (process.env.NODE_ENV === 'development') {
    clearWalletStorage();
  }
} 