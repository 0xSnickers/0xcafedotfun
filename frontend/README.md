# 🚀 0xcafe.fun Frontend - MEME 代币交易平台

基于 Next.js 14 构建的现代化 Web3 DApp，为 0xcafe.fun MEME 代币平台提供完整的用户界面和交易体验。集成**自动流动性监控**和**智能毕业机制**。

![Platform Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Ant Design](https://img.shields.io/badge/Ant%20Design-5.0-blue)

## ✨ 功能特性

### 🎯 **完整的交易体验**
- **Bonding Curve 交易**: 买入/卖出代币，自动价格计算
- **毕业机制**: 可视化毕业进度，10 ETH 市值自动迁移 DEX
- **实时数据**: 价格、市值、持有者数量实时更新
- **交易历史**: 完整的交易记录和状态跟踪
- **自动流动性**: 后端服务自动监控并添加流动性到 Uniswap

### 🌟 **Vanity 地址生成**
- **高速算法**: 10,000+ 次/秒本地计算
- **个性化前缀**: 生成以 "cafe" 开头的合约地址
- **实时进度**: 显示尝试次数、耗时和成功率
- **CREATE2 技术**: 安全可靠的地址预计算

### 🎨 **现代化 UI/UX**
- **统一主题**: 一致的暗黑主题设计
- **响应式布局**: 完美适配移动端和桌面端
- **加载状态**: 骨架屏、动画和智能占位符
- **错误处理**: 友好的错误提示和操作引导

### 🔗 **Web3 集成**
- **RainbowKit**: 支持 20+ 主流钱包
- **多链支持**: 主网、测试网、本地开发网络
- **实时余额**: ETH 和代币余额自动刷新
- **交易监控**: 实时跟踪交易状态和确认

## 🏗️ 页面架构

```
frontend/
├── 🏠 首页 (/)                    # 平台概览和统计
├── 🎨 代币创建 (/create)          # 创建新代币
├── 📊 交易市场 (/trade)           # 代币列表和搜索
├── 💹 个人交易 (/trade/[token])   # 具体代币交易
└── 🔧 全局组件                   # 通用 UI 组件
```

## 📋 已实现功能

### 🏠 **首页 (`/`)**
- ✅ **平台统计**: 今日创建、交易量、活跃代币、毕业数量
- ✅ **实时数据**: 数据自动刷新，支持手动刷新
- ✅ **特性展示**: Bonding Curve、Vanity 地址、毕业机制介绍
- ✅ **统一导航**: 快速跳转到创建和交易页面
- ✅ **后端状态**: 显示流动性监控服务状态

### 🎨 **代币创建页面 (`/create`)**
- ✅ **表单验证**: 完整的客户端和服务端验证
- ✅ **Vanity 地址**: 一键生成个性化合约地址
- ✅ **参数配置**: 代币名称、符号、精度、图标、描述
- ✅ **费用预览**: 实时显示创建费用和 Gas 估算
- ✅ **交易监控**: 实时跟踪创建状态
- ✅ **智能跳转**: 创建成功后自动跳转到交易页面

### 📊 **交易市场页面 (`/trade`)**
- ✅ **代币分类**: 区分活跃交易和已毕业代币
- ✅ **统计面板**: 活跃代币、毕业代币、总数统计
- ✅ **搜索功能**: 支持名称、符号、地址模糊搜索
- ✅ **价格信息**: 实时显示当前价格和市值
- ✅ **视觉差异**: 毕业代币金色主题，活跃代币蓝色主题
- ✅ **快速操作**: 一键复制地址，快速进入交易

### 💹 **个人交易页面 (`/trade/[tokenAddress]`)**
- ✅ **完整信息**: 代币详情、价格历史、创建者信息
- ✅ **毕业进度**: 可视化进度条显示距离毕业的市值
- ✅ **交易面板**: 买入/卖出界面，支持 ETH ⇄ Token 互换
- ✅ **实时更新**: 交易后自动刷新所有相关数据
- ✅ **智能授权**: 自动检测和处理 ERC20 授权
- ✅ **错误处理**: 余额不足、授权失败等友好提示
- ✅ **毕业状态**: 实时显示是否已毕业和流动性状态

### 🔧 **全局组件**
- ✅ **UnifiedHeader**: 统一导航栏，支持品牌展示和页面导航
- ✅ **WalletInfo**: 钱包连接状态和余额显示
- ✅ **ETHTradePanel**: 通用交易面板组件
- ✅ **UnifiedLoading**: 统一的加载动画组件
- ✅ **骨架屏**: 为所有页面提供加载占位符

## 🛠️ 技术栈

### 核心框架
- **Next.js 14**: App Router 架构，服务端渲染
- **TypeScript**: 完整类型安全，严格模式
- **React 18**: 最新 React 特性，并发渲染

### Web3 技术
- **RainbowKit**: 钱包连接和管理
- **wagmi**: React Hooks for Ethereum
- **viem**: 现代化以太坊库
- **React Query**: 数据获取和缓存

### UI/UX 设计
- **Ant Design**: 企业级 UI 组件库
- **Tailwind CSS**: 原子化 CSS 框架
- **暗黑主题**: 统一的深色主题设计
- **响应式**: 移动优先的响应式布局

### 开发工具
- **ESLint**: 代码质量检查
- **Prettier**: 代码格式化
- **Husky**: Git hooks 管理

## 🎯 核心功能实现

### Bonding Curve 交易算法

```typescript
// 价格计算 Hook
const useBondingCurve = (tokenAddress: string) => {
  // 获取当前价格
  const getCurrentPrice = useCallback(async () => {
    return await readContract(config, {
      address: BONDING_CURVE_ADDRESS,
      abi: BONDING_CURVE_ABI,
      functionName: 'getCurrentPrice',
      args: [tokenAddress]
    });
  }, [tokenAddress]);

  // 计算购买成本
  const calculateBuyCost = useCallback(async (ethAmount: string) => {
    return await readContract(config, {
      address: BONDING_CURVE_ADDRESS,
      abi: BONDING_CURVE_ABI,
      functionName: 'calculateBuyCost',
      args: [tokenAddress, parseEther(ethAmount)]
    });
  }, [tokenAddress]);
};
```

### Vanity 地址生成优化

```typescript
// 高性能地址生成
const generateVanityAddress = async (prefix: string) => {
  // 1. 一次性获取字节码（仅 1 次 RPC 调用）
  const bytecode = await readContract(config, {
    address: MEME_FACTORY_ADDRESS,
    abi: MEME_FACTORY_ABI,
    functionName: 'getBytecode',
    args: [name, symbol, decimals, totalSupply, tokenImage, description]
  });

  // 2. 本地高速计算（10,000+ 次/秒）
  for (let i = 0; i < maxAttempts; i++) {
    const salt = keccak256(toUtf8Bytes(randomValue));
    const predictedAddr = getCreate2Address(
      factoryAddress,
      salt,
      keccak256(bytecode)
    );
    
    if (predictedAddr.toLowerCase().startsWith(prefix)) {
      return { address: predictedAddr, salt, attempts: i + 1 };
    }
  }
};
```

### 智能合约状态管理

```typescript
// 自动刷新 Hook
const useTokenData = (tokenAddress: string) => {
  const [tokenDetails, setTokenDetails] = useState<TokenDetails | null>(null);

  // 获取代币详情
  const fetchTokenData = useCallback(async () => {
    const [tokenInfo, bondingInfo] = await Promise.all([
      // 基础信息
      readContract(config, {
        address: MEME_FACTORY_ADDRESS,
        abi: MEME_FACTORY_ABI,
        functionName: 'getMemeTokenInfo',
        args: [tokenAddress]
      }),
      // 交易信息
      readContract(config, {
        address: BONDING_CURVE_ADDRESS,
        abi: BONDING_CURVE_ABI,
        functionName: 'getTokenDetails',
        args: [tokenAddress]
      })
    ]);
    
    setTokenDetails(/* 合并数据 */);
  }, [tokenAddress]);

  // 自动刷新
  useEffect(() => {
    fetchTokenData();
    const interval = setInterval(fetchTokenData, 30000); // 30秒刷新
    return () => clearInterval(interval);
  }, [fetchTokenData]);
};
```

### 毕业状态检测

```typescript
// 毕业状态 Hook
const useGraduationStatus = (tokenAddress: string) => {
  const [graduationStatus, setGraduationStatus] = useState({
    isGraduated: false,
    hasLiquidity: false,
    uniswapPair: null,
    liquidityLocked: false
  });

  const checkGraduationStatus = useCallback(async () => {
    try {
      // 检查是否已毕业
      const bondingInfo = await readContract(config, {
        address: BONDING_CURVE_ADDRESS,
        abi: BONDING_CURVE_ABI,
        functionName: 'isTokenGraduated',
        args: [tokenAddress]
      });

      // 检查流动性状态
      const liquidityInfo = await readContract(config, {
        address: LIQUIDITY_MANAGER_ADDRESS,
        abi: LIQUIDITY_MANAGER_ABI,
        functionName: 'getLiquidityInfo',
        args: [tokenAddress]
      });

      setGraduationStatus({
        isGraduated: bondingInfo,
        hasLiquidity: liquidityInfo.liquidityAdded,
        uniswapPair: liquidityInfo.uniswapPair,
        liquidityLocked: liquidityInfo.liquidityLocked
      });
    } catch (error) {
      console.error('检查毕业状态失败:', error);
    }
  }, [tokenAddress]);

  useEffect(() => {
    checkGraduationStatus();
  }, [checkGraduationStatus]);

  return graduationStatus;
};
```

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm/yarn/pnpm

### 安装和运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local

# 3. 启动开发服务器
npm run dev

# 4. 访问应用
open http://localhost:3000
```

### 环境变量配置

```env
# 必需配置
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_wallet_connect_project_id

# 智能合约地址 (自动同步)
NEXT_PUBLIC_MEME_PLATFORM_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_MEME_FACTORY_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
NEXT_PUBLIC_BONDING_CURVE_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
NEXT_PUBLIC_FEE_MANAGER_ADDRESS=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
NEXT_PUBLIC_LIQUIDITY_MANAGER_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9

# 网络配置
NEXT_PUBLIC_NETWORK_RPC=http://127.0.0.1:8545
NEXT_PUBLIC_CHAIN_ID=31337

# RPC URLs (可选)
NEXT_PUBLIC_MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your-api-key
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-api-key
```

## 📁 项目结构

```
frontend/
├── src/
│   ├── app/                     # Next.js 14 App Router
│   │   ├── page.tsx            # 🏠 首页
│   │   ├── create/             # 🎨 代币创建
│   │   │   └── page.tsx
│   │   ├── trade/              # 📊 交易相关
│   │   │   ├── page.tsx        # 交易市场列表
│   │   │   └── [tokenAddress]/ # 个人交易页面
│   │   │       └── page.tsx
│   │   ├── layout.tsx          # 根布局
│   │   ├── providers.tsx       # 全局 Provider
│   │   └── globals.css         # 全局样式
│   ├── components/             # UI 组件
│   │   ├── UnifiedHeader.tsx   # 统一导航栏
│   │   ├── WalletInfo.tsx      # 钱包信息
│   │   ├── ETHTradePanel.tsx   # 交易面板
│   │   └── UnifiedLoading.tsx  # 加载组件
│   ├── hooks/                  # 自定义 Hooks
│   │   ├── useBondingCurve.ts  # Bonding Curve 交互
│   │   ├── useTokenBalance.ts  # 代币余额
│   │   ├── useTokenInfo.ts     # 代币信息
│   │   ├── usePlatformStats.ts # 平台统计
│   │   └── useGraduationStatus.ts # 毕业状态
│   ├── config/                 # 配置文件
│   │   ├── wagmi.ts           # Web3 配置
│   │   ├── contracts.ts       # 合约地址
│   │   └── abis.ts            # 合约 ABI
│   ├── utils/                 # 工具函数
│   │   └── vanityAddress.ts   # Vanity 地址生成
│   └── abi/                   # 合约 ABI 文件
├── public/                    # 静态资源
├── .env.example              # 环境变量示例
└── package.json              # 项目配置
```

## 🎨 UI/UX 特色

### 设计系统
- **暗黑主题**: 统一的深色主题，减少眼部疲劳
- **渐变设计**: 美观的颜色渐变和阴影效果
- **响应式**: 移动优先，完美适配各种屏幕尺寸
- **动画效果**: 流畅的过渡动画和交互反馈

### 组件设计
- **UnifiedHeader**: 统一的页面头部，支持品牌展示和导航
- **Card 布局**: 卡片式布局，信息层次清晰
- **状态指示**: 清晰的加载、成功、错误状态
- **数据可视化**: 进度条、统计图表、趋势指示

### 交互体验
- **一键操作**: 复制地址、刷新数据、快速跳转
- **智能提示**: 实时验证、友好错误信息
- **毕业标识**: 特殊的视觉标识区分已毕业代币
- **键盘导航**: 支持键盘快捷键操作

## 📊 性能优化

### 加载优化
- **Suspense**: 组件级别的懒加载
- **骨架屏**: 优化首屏加载体验
- **图片优化**: Next.js Image 组件优化
- **代码分割**: 按页面和功能分割代码

### 数据缓存
- **React Query**: 智能数据缓存和同步
- **本地存储**: 用户偏好和临时数据
- **RPC 缓存**: 减少重复的区块链查询
- **防抖处理**: 搜索和输入防抖优化

### 用户体验
- **预加载**: 关键资源预加载
- **离线支持**: 基础功能离线可用
- **错误恢复**: 自动重试和错误恢复
- **实时同步**: 与后端服务实时数据同步

## 🔧 开发指南

### 代码规范
```bash
# 代码检查
npm run lint

# 代码格式化  
npm run format

# 类型检查
npm run type-check

# 构建生产版本
npm run build
```

### 与后端集成
```typescript
// 检查后端监控服务状态
const checkBackendStatus = async () => {
  try {
    const response = await fetch('http://localhost:9000/api/monitor/status');
    const data = await response.json();
    return data.monitor.isActive;
  } catch {
    return false;
  }
};

// 手动触发流动性添加
const triggerLiquidityAdd = async (tokenAddress: string) => {
  const response = await fetch('http://localhost:9000/api/monitor/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenAddress })
  });
  return response.json();
};
```

## 🌐 部署选项

### Vercel (推荐)
```bash
# 自动部署
vercel --prod

# 环境变量配置
vercel env add NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID
```