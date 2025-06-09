# CA Meme Platform 部署和使用指南

## 📋 项目概述

CA Meme Platform 是一个基于以太坊的 Meme 代币创建和交易平台，包含三个主要合约：

- **MemeToken.sol**: ERC20 代币合约模板
- **MemeFactory.sol**: 代币工厂合约，负责创建新的 Meme 代币
- **MemePlatform.sol**: 平台合约，提供高级功能如趋势排行、用户档案等

## 🏗️ 架构说明

### 合约关系
```
MemePlatform → MemeFactory → MemeToken
     ↓              ↓           ↓
   平台功能      代币工厂      ERC20代币
```

### 部署顺序
1. **MemeFactory** (独立部署)
2. **MemePlatform** (需要 MemeFactory 地址)
3. **MemeToken** (通过工厂动态创建，无需单独部署)

## 🚀 部署步骤

### 1. 环境准备

#### 安装依赖
```bash
# 安装 Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 安装项目依赖
forge install
cd frontend && npm install
```

#### 配置环境变量
创建 `.env` 文件：
```bash
# 部署者私钥 (测试网络使用)
PRIVATE_KEY=your_private_key_here

# RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_KEY

# Etherscan API Keys (用于合约验证)
ETHERSCAN_API_KEY=your_etherscan_api_key_here
```

### 2. 本地测试网部署

#### 启动本地测试网
```bash
# 启动 Anvil (Foundry 本地测试网)
anvil
```

#### 部署到本地网络
```bash
# 部署合约
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# 或者使用 make 命令
make deploy-local
```

#### 预期输出
```
Deploying contracts with account: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
MemeFactory deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
MemePlatform deployed to: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
```

### 3. 测试网部署

#### Sepolia 测试网
```bash
# 部署到 Sepolia
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify

# 验证合约 (可选)
forge verify-contract \
  --chain sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  <CONTRACT_ADDRESS> \
  src/MemeFactory.sol:MemeFactory
```

### 4. 主网部署

⚠️ **主网部署前请务必在测试网充分测试！**

```bash
# 部署到主网
forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC_URL --broadcast --verify
```

## 🔧 前端配置

### 1. 更新合约地址

部署完成后，将合约地址添加到前端配置：

#### 更新 `frontend/.env.local`
```bash
# 合约地址
NEXT_PUBLIC_MEME_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_MEME_PLATFORM_ADDRESS=0x...

# 网络配置
NEXT_PUBLIC_SEPOLIA_MEME_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_SEPOLIA_MEME_PLATFORM_ADDRESS=0x...

# WalletConnect
NEXT_PUBLIC_PROJECT_ID=your_wallet_connect_project_id

# 其他配置
NEXT_PUBLIC_CREATION_FEE=0.001
NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE=100
```

### 2. 启动前端

```bash
cd frontend
npm run dev
```

## 📖 使用指南

### 1. 创建 Meme 代币

#### 通过前端界面
1. 连接钱包
2. 填写代币信息（名称、符号、总量等）
3. 上传代币图片
4. 支付创建费用 (0.001 ETH)
5. 确认交易

#### 通过智能合约直接调用
```solidity
// 通过 MemePlatform 创建 (推荐)
function createMemeToken(
    string memory name,
    string memory symbol,
    uint8 decimals,
    uint256 totalSupply,
    string memory tokenImage,
    string memory description,
    bytes32 salt
) external payable returns (address);

// 通过 MemeFactory 直接创建
function createMemeToken(
    string memory name,
    string memory symbol,
    uint8 decimals,
    uint256 totalSupply,
    string memory tokenImage,
    string memory description,
    bytes32 salt
) external payable returns (address);
```

### 2. 查询代币信息

#### 获取所有代币
```javascript
const factory = useMemeFactory();
const tokens = await factory.read.getAllMemeTokens();
```

#### 获取用户创建的代币
```javascript
const factory = useMemeFactory();
const userTokens = await factory.read.getCreatorTokens([userAddress]);
```

#### 获取代币详细信息
```javascript
const factory = useMemeFactory();
const tokenInfo = await factory.read.getMemeTokenInfo([tokenAddress]);
```

### 3. 平台功能

#### 用户档案
```javascript
const platform = useMemePlatform();

// 更新用户档案
await platform.write.updateUserProfile(['Alice', 'https://avatar.url']);

// 获取用户档案
const profile = await platform.read.getUserProfile([userAddress]);
```

#### 趋势排行榜
```javascript
const platform = useMemePlatform();

// 获取趋势代币
const [tokens, scores] = await platform.read.getTrendingTokens([10]);

// 分页获取
const [tokens, scores, hasMore] = await platform.read.getTrendingTokensPaginated([0, 20]);
```

#### 代币统计
```javascript
const platform = useMemePlatform();
const stats = await platform.read.getTokenStats([tokenAddress]);
// 返回: { totalVolume, holders, transactions, marketCap, lastUpdateTime }
```

## 🧪 测试

### 运行测试套件
```bash
# 运行所有测试
forge test

# 运行详细测试
forge test -vvv

# 运行特定测试
forge test --match-test testCreateMemeToken

# 测试覆盖率
forge coverage
```

### 测试用例覆盖
- ✅ 工厂和平台部署
- ✅ 地址预测功能
- ✅ 代币创建流程
- ✅ 用户档案管理
- ✅ 持有者管理系统
- ✅ 趋势排行榜功能
- ✅ 多代币创建场景
- ✅ 权限控制和费用提取

## 🔒 安全考虑

### 合约安全
- ✅ 使用 OpenZeppelin 标准库
- ✅ ReentrancyGuard 防重入攻击
- ✅ Ownable 权限控制
- ✅ 输入验证和边界检查
- ✅ 事件记录关键操作

### 部署安全
- 🔐 生产环境使用硬件钱包
- 🔐 私钥安全存储
- 🔐 多签验证重要操作
- 🔐 渐进式部署验证

### 前端安全
- 🔒 输入验证和清理
- 🔒 安全的 RPC 端点
- 🔒 用户资金安全提示

## 🚨 常见问题

### Q: 部署失败怎么办？
A: 检查：
1. 网络连接和 RPC URL
2. 账户余额是否足够
3. 私钥格式是否正确
4. Gas 费用设置

### Q: 前端无法连接合约？
A: 检查：
1. 合约地址配置是否正确
2. 网络是否匹配
3. ABI 是否最新
4. 钱包网络是否正确

### Q: 创建代币失败？
A: 检查：
1. 创建费用是否足够 (0.001 ETH)
2. 盐值是否已被使用
3. 参数是否有效
4. 网络拥堵情况

### Q: 如何升级合约？
A: 当前合约不支持升级，需要重新部署。建议：
1. 在测试网充分测试
2. 制定迁移计划
3. 通知用户合约变更

## 📊 Gas 费用估算

| 操作 | 预估 Gas |
|------|----------|
| 部署 MemeFactory | ~3,000,000 |
| 部署 MemePlatform | ~4,500,000 |
| 创建代币 | ~2,500,000 |
| 更新用户档案 | ~50,000 |
| 查询操作 | 免费 |

## 🔗 相关链接

- [Foundry 文档](https://book.getfoundry.sh/)
- [OpenZeppelin 合约](https://docs.openzeppelin.com/contracts/)
- [Wagmi 文档](https://wagmi.sh/)
- [Viem 文档](https://viem.sh/)

## 📞 支持

如遇到问题，请：
1. 查看测试用例了解用法
2. 检查事件日志定位问题
3. 提交 Issue 描述问题和复现步骤

---

**⚠️ 免责声明**: 此项目仅供学习和测试使用，请在生产环境中进行充分的安全审计。 