// 🧹 WalletConnect 存储清理脚本
// 在浏览器控制台中运行此脚本来彻底清理钱包存储

(function() {
  console.log('🧹 开始彻底清理 WalletConnect 存储...');
  
  // 清理的键名列表
  const keysToRemove = [
    'walletconnect',
    'WALLETCONNECT_DEEPLINK_CHOICE',
    'wc@2:client:0.3//session',
    'wc@2:core:0.3//messages',
    'wc@2:core:0.3//subscription',
    'wc@2:core:0.3//keychain',
    'wc@2:core:0.3//pairing',
    'wc@2:core:0.3//history',
    'wc@2:core:0.3//expirer',
    'wc@2:ethereum_provider:/optionalChains',
    'wc@2:ethereum_provider:/chainId',
    'wc@2:ethereum_provider:/accounts',
    'wc@2:ethereum_provider:/session',
    'wc@2:universal_provider:/session',
    'wagmi.cache',
    'wagmi.store',
    'wagmi.connected',
    'wagmi.wallet',
    'wagmi.recent-wallet',
    'wagmi.autoConnect',
    'rk-recent',
    'rainbow-recent-wallet',
    'rainbow.kit.recent.wallet',
    'web3-wallets-kit',
    'walletlink',
    'coinbaseWalletExtension',
  ];

  let removedCount = 0;

  // 清理指定的键
  keysToRemove.forEach(key => {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      removedCount++;
    }
    if (sessionStorage.getItem(key) !== null) {
      sessionStorage.removeItem(key);
      removedCount++;
    }
  });

  // 清理前缀匹配的键
  const prefixesToClear = ['wc@2:', 'wagmi.', 'rk-', 'rainbow', 'walletconnect', 'coinbase', 'web3'];
  
  [...Object.keys(localStorage), ...Object.keys(sessionStorage)].forEach(key => {
    prefixesToClear.forEach(prefix => {
      if (key.toLowerCase().startsWith(prefix.toLowerCase())) {
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key);
          removedCount++;
        }
        if (sessionStorage.getItem(key) !== null) {
          sessionStorage.removeItem(key);
          removedCount++;
        }
      }
    });
  });

  // 尝试清理 IndexedDB
  if ('indexedDB' in window) {
    try {
      indexedDB.deleteDatabase('walletconnect');
      indexedDB.deleteDatabase('wc@2');
      console.log('🗑️ IndexedDB 数据库已清理');
    } catch (e) {
      console.warn('⚠️ 无法清理 IndexedDB:', e);
    }
  }

  console.log(`✅ 清理完成！共删除 ${removedCount} 个存储项`);
  console.log('🔄 建议刷新页面以确保更改生效');
  
  // 询问是否自动刷新
  if (confirm('是否立即刷新页面？')) {
    location.reload();
  }
})(); 