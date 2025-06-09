# 🔧 钱包连接问题解决方案

## 问题描述

刷新页面时总是弹出 WalletConnect 的 QR 码扫描弹窗。

## 根本原因

这通常是由于以下原因导致的：

1. **浏览器缓存问题** - WalletConnect 在 localStorage 中保存了连接状态
2. **自动重连机制** - RainbowKit 默认会尝试自动重连上次连接的钱包
3. **存储状态污染** - 开发过程中的测试连接留下了残留数据

## 🚀 解决方案

### 方案 1：手动清理浏览器存储（推荐）

1. **打开浏览器开发者工具**
   - Chrome/Edge: `F12` 或 `Ctrl+Shift+I`
   - Firefox: `F12` 或 `Ctrl+Shift+I`
   - Safari: `Cmd+Option+I`

2. **进入 Application/Storage 标签页**
   - Chrome/Edge: 点击 "Application" 标签
   - Firefox: 点击 "Storage" 标签
   - Safari: 点击 "Storage" 标签

3. **清理 Local Storage**
   - 找到 "Local Storage" 部分
   - 删除以下键值对：
     ```
     walletconnect
     WALLETCONNECT_DEEPLINK_CHOICE
     所有以 wc@2: 开头的键
     所有以 wagmi. 开头的键
     所有以 rk- 开头的键
     ```

4. **清理 Session Storage**
   - 同样删除上述键值对

5. **刷新页面**

### 方案 2：使用浏览器无痕模式

1. 打开无痕/隐私浏览窗口
2. 访问应用 URL
3. 测试钱包连接功能

### 方案 3：使用代码清理工具

在浏览器控制台中运行以下代码：

```javascript
// 清理 WalletConnect 相关存储
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
  'wagmi.cache',
  'wagmi.store',
  'wagmi.connected',
  'wagmi.wallet',
  'rk-recent',
  'rainbow-recent-wallet'
];

keysToRemove.forEach(key => {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
});

// 清理前缀匹配的键
['wc@2:', 'wagmi.', 'rk-'].forEach(prefix => {
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(prefix)) {
      localStorage.removeItem(key);
    }
  });
  Object.keys(sessionStorage).forEach(key => {
    if (key.startsWith(prefix)) {
      sessionStorage.removeItem(key);
    }
  });
});

console.log('钱包存储已清理');
// 刷新页面
location.reload();
```

### 方案 4：重置浏览器数据（终极方案）

如果上述方案都不奏效：

1. **Chrome/Edge**: 
   - 设置 → 隐私和安全 → 清除浏览数据
   - 选择 "Cookie 和其他网站数据" 和 "缓存的图片和文件"

2. **Firefox**:
   - 设置 → 隐私与安全 → Cookie 和网站数据 → 清除数据

3. **Safari**:
   - Safari → 偏好设置 → 隐私 → 管理网站数据 → 移除全部

## 🛠️ 开发环境预防措施

为了避免这个问题再次发生，我们已经在代码中添加了以下改进：

### 1. 自动清理机制

在 `src/app/providers.tsx` 中，我们添加了自动清理逻辑：

```typescript
useEffect(() => {
  // 清理可能导致自动连接的本地存储
  if (typeof window !== 'undefined') {
    // 自动清理 WalletConnect 相关存储
    // ...
  }
}, []);
```

### 2. 查询客户端配置

禁用了窗口焦点时的自动重新获取：

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});
```

### 3. RainbowKit 配置优化

使用了更紧凑的模态框配置：

```typescript
<RainbowKitProvider
  modalSize="compact"
  showRecentTransactions={true}
>
```

## 📋 最佳实践

### 开发时：

1. **定期清理存储** - 在开发过程中定期清理浏览器存储
2. **使用无痕模式** - 测试新功能时使用无痕模式
3. **监控控制台** - 注意 WalletConnect 相关的警告和错误

### 生产环境：

1. **用户教育** - 在文档中说明如何正确连接和断开钱包
2. **错误处理** - 添加错误边界来处理连接异常
3. **状态管理** - 正确管理连接状态的持久化

## 🔍 排查步骤

如果问题仍然存在：

1. **检查控制台错误** - 查看是否有 JavaScript 错误
2. **检查网络请求** - 查看是否有失败的 API 请求
3. **检查 RainbowKit 版本** - 确保使用最新稳定版本
4. **检查 wagmi 版本** - 确保版本兼容性

## 📞 获取帮助

如果上述方案都无法解决问题，请：

1. 检查浏览器控制台的错误信息
2. 记录复现步骤
3. 提供浏览器和版本信息
4. 联系开发团队

---

**注意**: 这个问题通常是一次性的，清理存储后应该不会再出现。如果持续出现，可能需要检查代码逻辑或依赖版本。 