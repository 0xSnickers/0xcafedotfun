# 0xcafe.fun - 技术文档

## 项目概述

0xcafe.fun 是一个基于以太坊的去中心化 Meme 代币创造平台，采用 Pump.fun 风格的 Bonding Curve 定价机制，支持 CREATE2 Vanity 地址生成。用户可以一键创建和交易 Meme 代币，通过动态定价算法确保公平价格发现。

## 合约架构

### 1. 智能合约结构

整个平台由四个核心智能合约组成：

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MemePlatform  │    │   MemeFactory   │    │  BondingCurve   │
│  (Entry Point)  │────│  (Token Creator)│────│ (Pricing Engine)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                                 │
                         ┌─────────────────┐
                         │    MemeToken    │
                         │  (ERC20 Token)  │
                         └─────────────────┘
```

### 2. 合约详细功能

#### 2.1 MemeToken.sol - ERC20 代币合约

**功能概述：**
- 标准 ERC20 代币实现
- 支持按需铸造（非预铸造模式）
- 包含代币元数据（图片、描述）
- 权限控制的铸造机制

**核心功能：**
```solidity
// 权限铸造
function mint(address to, uint256 amount) external onlyMinter
// 代币元数据
function tokenImage() public view returns (string memory)
function description() public view returns (string memory)
// 权限管理
function setMinter(address _minter) external onlyOwner
```

**状态变量：**
- `minter`: 授权铸造者地址（通常是 BondingCurve 合约）
- `_tokenImage`: 代币图片 URL
- `_description`: 代币描述信息
- `_decimals`: 代币精度

#### 2.2 MemeFactory.sol - 代币工厂合约

**功能概述：**
- 使用 CREATE2 创建代币合约
- 支持 Vanity 地址生成
- 代币注册和管理
- 费用收取和分配

**核心功能：**
```solidity
// 统一代币创建入口
function createMemeToken(
    string memory name,
    string memory symbol,
    uint8 decimals,
    string memory tokenImage,
    string memory description,
    bytes32 salt,
    address actualCreator,
    uint256 targetSupply,
    uint256 targetPrice,
    uint256 initialPrice
) external payable returns (address)

// 地址预测
function predictTokenAddress(...) external view returns (address)

// 获取字节码（用于前端地址预测）
function getBytecode(...) external view returns (bytes memory)
```

**状态管理：**
- `memeTokens`: 代币信息映射
- `allMemeTokensSet`: 所有代币地址集合
- `creatorTokensSet`: 创建者代币映射
- `bondingCurveContract`: BondingCurve 合约地址

#### 2.3 BondingCurve.sol - 定价引擎合约

**功能概述：**
- 线性 Bonding Curve 定价算法
- 代币买卖交易处理
- 费用分配机制
- 毕业条件检查

**定价算法：**
```
价格公式：price = initialPrice + k * supply
积分公式：cost = initialPrice * amount + k * (newSupply² - currentSupply²) / 2
```

**核心功能：**
```solidity
// 初始化 Curve 参数
function initializeCurve(
    address tokenAddress,
    address creator,
    uint256 targetSupply,
    uint256 targetPrice,
    uint256 initialPrice
) external onlyAuthorized

// 购买代币
function buyTokens(address tokenAddress, uint256 minTokenAmount) external payable

// 卖出代币
function sellTokens(address tokenAddress, uint256 tokenAmount) external

// 价格计算
function getCurrentPrice(address tokenAddress) public view returns (uint256)
function calculateBuyPrice(address tokenAddress, uint256 tokenAmount) public view
```

**费用结构：**
- 平台费用：2% (`PLATFORM_FEE = 200`)
- 创建者费用：3% (`CREATOR_FEE = 300`)
- 费用基数：10000

#### 2.4 MemePlatform.sol - 平台主合约

**功能概述：**
- 统一入口点管理
- 用户档案系统
- 代币统计追踪
- 趋势排行算法

**核心功能：**
```solidity
// 代币创建入口
function createMemeToken(...) external payable nonReentrant returns (address)

// 用户档案管理
function updateUserProfile(string memory username, string memory avatar) external

// 交易记录
function recordTokenTransaction(
    address token,
    address user,
    uint256 amount,
    string memory actionType
) external
```

**趋势算法：**
- 分数计算：`scoreIncrease = (transactionAmount * timeWeight) / SCORE_PRECISION`
- 时间衰减：每小时衰减 5% (`SCORE_DECAY_RATE = 95%`)
- 榜单限制：最多 100 个代币 (`MAX_TRENDING_SIZE = 100`)

## 前端架构与交互

### 1. 前端技术栈

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js 15    │    │     Wagmi      │    │   Ant Design    │
│   (Framework)   │────│  (Web3 Hooks)  │────│      (UI)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         │              │      Viem       │              │
         └──────────────│ (Ethereum Lib)  │──────────────┘
                        └─────────────────┘
```

### 2. 合约配置管理

#### 2.1 合约地址配置 (`frontend/src/config/contracts.ts`)

```typescript
export const CONTRACT_ADDRESSES = {
  localhost: {
    MEME_FACTORY: '0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1',
    BONDING_CURVE: '0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE',
    MEME_PLATFORM: '0x68B1D87F95878fE05B998F19b66F4baba5De1aed',
  },
  // 其他网络配置...
}
```

#### 2.2 ABI 配置 (`frontend/src/config/abis.ts`)

```typescript
// 导入编译后的 ABI 文件
import MemeFactoryABI from '../../abi/MemeFactory.json';
import MemePlatformABI from '../../abi/MemePlatform.json';
import BondingCurveABI from '../../abi/BondingCurve.json';

export const MEME_FACTORY_ABI = MemeFactoryABI;
export const MEME_PLATFORM_ABI = MemePlatformABI;
export const BONDING_CURVE_ABI = BondingCurveABI;
```

### 3. 合约交互 Hooks

#### 3.1 基础合约连接 (`frontend/src/hooks/useContracts.ts`)

```typescript
// 获取合约实例
export function useMemeFactory() {
  const { publicClient, walletClient, addresses } = useContractBase();
  
  return getContract({
    address: addresses.MEME_FACTORY as `0x${string}`,
    abi: MEME_FACTORY_ABI,
    client: { public: publicClient, wallet: walletClient },
  });
}

// 类似的 Hook 用于其他合约
export function useMemePlatform() { /* ... */ }
export function useMemeToken(tokenAddress: string) { /* ... */ }
```

### 4. 核心交互流程

#### 4.1 代币创建流程

**前端流程：**
1. 用户输入代币参数
2. 生成 Vanity 地址（可选）
3. 预测代币地址
4. 调用合约创建代币
5. 等待交易确认

**合约调用：**
```typescript
// 1. 地址预测
const predictedAddress = await readContract(config, {
  address: memeFactoryAddress,
  abi: MEME_FACTORY_ABI,
  functionName: 'predictTokenAddress',
  args: [name, symbol, decimals, totalSupply, tokenImage, description, salt]
});

// 2. 创建代币
const txHash = await writeContract(config, {
  address: memePlatformAddress,
  abi: MEME_PLATFORM_ABI,
  functionName: 'createMemeToken',
  args: [
    name, symbol, decimals, tokenImage, description, 
    salt, targetSupply, targetPrice, initialPrice
  ],
  value: creationFee
});
```

#### 4.2 代币交易流程

**买入流程：**
```typescript
// 1. 计算购买估价
const estimate = await readContract(config, {
  address: bondingCurveAddress,
  abi: BONDING_CURVE_ABI,
  functionName: 'calculateTokensForEth',
  args: [tokenAddress, ethAmount]
});

// 2. 执行购买
const txHash = await writeContract(config, {
  address: bondingCurveAddress,
  abi: BONDING_CURVE_ABI,
  functionName: 'buyTokens',
  args: [tokenAddress, minTokenAmount],
  value: ethAmount
});
```

**卖出流程：**
```typescript
// 1. 计算卖出估价
const estimate = await readContract(config, {
  address: bondingCurveAddress,
  abi: BONDING_CURVE_ABI,
  functionName: 'calculateSellPrice',
  args: [tokenAddress, tokenAmount]
});

// 2. 执行卖出
const txHash = await writeContract(config, {
  address: bondingCurveAddress,
  abi: BONDING_CURVE_ABI,
  functionName: 'sellTokens',
  args: [tokenAddress, tokenAmount]
});
```

#### 4.3 数据查询流程

**获取代币列表：**
```typescript
// 1. 获取所有代币地址
const allTokens = await readContract(config, {
  address: memeFactoryAddress,
  abi: MEME_FACTORY_ABI,
  functionName: 'getAllMemeTokens',
}) as string[];

// 2. 获取代币详细信息
for (const tokenAddress of allTokens) {
  const tokenInfo = await readContract(config, {
    address: memeFactoryAddress,
    abi: MEME_FACTORY_ABI,
    functionName: 'getMemeTokenInfo',
    args: [tokenAddress],
  });
}
```

**获取交易详情：**
```typescript
const details = await readContract(config, {
  address: bondingCurveAddress,
  abi: BONDING_CURVE_ABI,
  functionName: 'getTokenDetails',
  args: [tokenAddress]
});

const [params, info, currentPrice, marketCap] = details;
```

### 5. 页面组件架构

#### 5.1 主要页面

**首页 (`frontend/src/app/page.tsx`):**
- 平台介绍和统计展示
- 快速导航到创建和交易页面
- 连接钱包入口

**创建页面 (`frontend/src/app/create/page.tsx`):**
- 代币参数表单
- Vanity 地址生成
- 实时地址预测
- 交易状态跟踪

**交易页面 (`frontend/src/app/trade/page.tsx`):**
- 代币列表浏览
- 买卖交易界面
- 价格图表和统计
- 实时价格更新

**仪表板页面 (`frontend/src/app/dashboard/page.tsx`):**
- 所有代币总览
- 用户创建的代币
- 网格和列表视图切换
- 统计数据展示

#### 5.2 关键组件

**钱包连接 (`frontend/src/components/WalletInfo.tsx`):**
- 钱包状态显示
- 余额信息
- 连接/断开功能

**代币卡片 (`frontend/src/components/TokenCard.tsx`):**
- 代币基本信息展示
- 快速操作按钮
- 统计数据显示

### 6. CREATE2 Vanity 地址生成

#### 6.1 工作原理

```typescript
// Vanity 地址生成工具
export async function generateVanityAddress(
  pattern: string = 'cafe',
  maxAttempts: number = 1000000
): Promise<{ salt: string; address: string; attempts: number }> {
  
  for (let i = 0; i < maxAttempts; i++) {
    const salt = keccak256(toUtf8Bytes(`${Math.random()}-${Date.now()}-${i}`));
    
    // 计算预测地址
    const predictedAddress = getCreate2Address(
      factoryAddress,
      salt,
      keccak256(bytecode)
    );
    
    // 检查是否匹配模式
    if (predictedAddress.toLowerCase().includes(pattern.toLowerCase())) {
      return {
        salt,
        address: predictedAddress,
        attempts: i + 1
      };
    }
  }
  
  throw new Error(`无法在 ${maxAttempts} 次尝试内找到匹配的地址`);
}
```

#### 6.2 地址预测一致性

**关键修复：**
合约中的 `_computeAddress` 和 `Create2.deploy` 必须使用相同的 `deployer` 参数：

```solidity
// 修复前（不一致）
function _computeAddress(...) internal view returns (address) {
    // 使用传入的 deployer 参数
    return Create2.computeAddress(salt, keccak256(bytecode), deployer);
}

function _createToken(...) internal returns (address) {
    // 使用 address(this)
    address tokenAddress = Create2.deploy(0, salt, bytecode);
}

// 修复后（一致）
function _computeAddress(...) internal view returns (address) {
    // 统一使用 address(this)
    return Create2.computeAddress(salt, keccak256(bytecode), address(this));
}
```

### 7. 错误处理和用户体验

#### 7.1 交易状态管理

```typescript
// 使用 Wagmi 的交易等待 Hook
const { data: receipt, isError, isLoading } = useWaitForTransactionReceipt({
  hash: txHash,
});

// 状态反馈
if (isLoading) {
  message.loading('交易处理中...');
} else if (isError) {
  message.error('交易失败');
} else if (receipt) {
  message.success('交易成功');
}
```

#### 7.2 网络和合约地址验证

```typescript
// 动态获取合约地址
const contractAddresses = getContractAddresses(chain?.id);

if (!contractAddresses.MEME_FACTORY) {
  throw new Error('合约地址未配置');
}
```

#### 7.3 数据实时更新

```typescript
// 使用 useEffect 实现数据自动刷新
useEffect(() => {
  const interval = setInterval(() => {
    if (selectedToken) {
      fetchTokenDetails();
    }
  }, 30000); // 30秒更新一次

  return () => clearInterval(interval);
}, [selectedToken]);
```

## 部署和配置

### 1. 合约部署顺序

```bash
# 1. 部署 MemeFactory
forge create MemeFactory --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# 2. 部署 BondingCurve
forge create BondingCurve --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# 3. 部署 MemePlatform
forge create MemePlatform --constructor-args $MEME_FACTORY_ADDRESS \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# 4. 配置权限
# - 设置 BondingCurve 地址到 MemeFactory
# - 添加 MemeFactory 为 BondingCurve 的授权调用者
```

### 2. 前端配置

```bash
# 1. 更新合约地址
# 编辑 frontend/src/config/contracts.ts

# 2. 更新 ABI 文件
# 复制编译后的 ABI 到 frontend/abi/ 目录

# 3. 配置环境变量
echo "NEXT_PUBLIC_MEME_FACTORY_ADDRESS=0x..." >> .env.local
echo "NEXT_PUBLIC_BONDING_CURVE_ADDRESS=0x..." >> .env.local
echo "NEXT_PUBLIC_MEME_PLATFORM_ADDRESS=0x..." >> .env.local
```

## 安全考虑

### 1. 合约安全

- **重入攻击防护：** 使用 `ReentrancyGuard`
- **权限控制：** `onlyOwner`, `onlyAuthorized`, `onlyMinter`
- **参数验证：** 检查地址非零、数量大于零等
- **溢出保护：** 使用 OpenZeppelin 的 Math 库

### 2. 前端安全

- **输入验证：** 验证用户输入的合法性
- **滑点保护：** 设置最小接收代币数量
- **网络验证：** 检查连接的网络是否正确
- **交易确认：** 等待足够的区块确认

### 3. 经济安全

- **费用机制：** 平台费用和创建者费用防止恶意行为
- **目标限制：** 设置合理的目标供应量和价格
- **时间衰减：** 趋势分数衰减防止历史刷分

## 未来扩展

### 1. 功能扩展

- **流动性迁移：** 代币毕业后自动添加到 DEX
- **治理机制：** 代币持有者投票功能
- **空投系统：** 创建者向持有者空投代币
- **NFT 集成：** 支持 NFT 作为代币图标

### 2. 性能优化

- **事件监听：** 使用 WebSocket 实时更新数据
- **缓存系统：** 缓存代币信息和价格数据
- **分页加载：** 大量代币的分页显示
- **批量查询：** 批量获取多个代币信息

### 3. 用户体验

- **移动端优化：** 响应式设计和移动端适配
- **多语言支持：** 国际化 (i18n) 支持
- **主题切换：** 明暗主题切换
- **快捷操作：** 键盘快捷键支持

---

## 结论

0xcafe.fun 平台通过精心设计的智能合约架构和现代化的前端界面，为用户提供了一个安全、公平、易用的 Meme 代币创造和交易平台。Bonding Curve 定价机制确保了价格发现的公平性，CREATE2 Vanity 地址生成为代币提供了独特的品牌价值，而完整的前端交互系统则为用户提供了流畅的使用体验。

平台的模块化设计使得未来的功能扩展和维护都变得相对容易，同时多层次的安全措施保证了用户资金和数据的安全。随着 DeFi 和 Meme 文化的不断发展，该平台具备了良好的扩展性和适应性。 