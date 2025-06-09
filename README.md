# CA MEME Platform

一个基于 Create2 的 MEME 代币发射平台，支持预计算合约地址部署。

## 功能特性

- 🚀 **Create2 部署**: 使用 Create2 预计算 MEME Token 合约地址
- 🎯 **地址预测**: Node.js 脚本预计算和验证合约地址
- 🏭 **工厂模式**: 统一的代币创建和管理
- 📊 **平台统计**: 代币交易量、持有者数量等统计信息
- 👥 **用户档案**: 用户创建的代币记录和声誉系统
- 🔥 **热门排行**: 基于交易活动的代币热度排行
- 💰 **费用管理**: 可配置的创建费用和平台抽成

## 项目结构

```
├── src/
│   ├── MemeToken.sol      # MEME 代币合约 (ERC20)
│   ├── MemeFactory.sol    # 代币工厂合约 (Create2)
│   └── MemePlatform.sol   # 平台主合约
├── script/
│   └── MemePlatform.s.sol # 部署脚本
├── scripts/
│   ├── addressPrecompute.js # 地址预计算工具
│   └── getBytecode.js     # 字节码获取工具
├── test/
│   └── MemePlatform.t.sol # 测试文件
└── package.json           # Node.js 依赖
```

## 快速开始

### 1. 安装依赖

```bash
# 安装 Foundry（如果还没有安装）
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 安装 Node.js 依赖
npm install
```

### 2. 编译合约

```bash
forge build
```

### 3. 运行测试

```bash
forge test -vv
```

### 4. 本地部署

启动本地节点：
```bash
npm run start-anvil
```

部署合约：
```bash
npm run deploy:local
```

## 使用指南

### 地址预计算

使用 Node.js 脚本预计算 MEME Token 地址：

```bash
# 获取合约字节码
npm run get-bytecode

# 预计算地址
npm run predict-address
```

### 创建 MEME Token

#### 方法 1: 使用 Foundry 脚本

设置环境变量：
```bash
export PRIVATE_KEY="your_private_key"
export MEME_FACTORY_ADDRESS="deployed_factory_address"
export TOKEN_NAME="PEPE Coin"
export TOKEN_SYMBOL="PEPE"
export TOKEN_DECIMALS=18
export TOKEN_TOTAL_SUPPLY=1000000000000000000000000000  # 10亿代币
export TOKEN_IMAGE="https://example.com/pepe.png"
export TOKEN_DESCRIPTION="PEPE meme token"
export TOKEN_SALT="0x1234567890123456789012345678901234567890123456789012345678901234"
export CREATION_FEE=1000000000000000  # 0.001 ETH
```

运行创建脚本：
```bash
npm run create-token
```

#### 方法 2: 直接调用合约

```solidity
// 预计算地址
address predictedAddress = memeFactory.predictTokenAddress(
    "PEPE Coin",           // name
    "PEPE",                // symbol
    18,                    // decimals
    1000000000 * 10**18,   // totalSupply
    msg.sender,            // owner
    "https://example.com/pepe.png",  // tokenImage
    "PEPE meme token",     // description
    keccak256("my-salt")   // salt
);

// 创建代币
address tokenAddress = memeFactory.createMemeToken{value: 0.001 ether}(
    "PEPE Coin",
    "PEPE", 
    18,
    1000000000 * 10**18,
    "https://example.com/pepe.png",
    "PEPE meme token",
    keccak256("my-salt")
);

// 验证地址匹配
assert(tokenAddress == predictedAddress);
```

### JavaScript 集成

```javascript
const { ethers } = require('ethers');
const { computeCreate2Address, generateSalt } = require('./scripts/addressPrecompute');

// 预计算地址示例
const factoryAddress = "0x..."; // 工厂合约地址
const tokenParams = {
    name: "DOGE Coin",
    symbol: "DOGE",
    decimals: 18,
    totalSupply: ethers.parseEther("100000000"), // 1亿代币
    owner: "0x...", // 所有者地址
    tokenImage: "https://example.com/doge.png",
    description: "DOGE meme token"
};

const salt = generateSalt(); // 或使用自定义盐值
const bytecode = getMemeTokenBytecode(tokenParams);
const predictedAddress = computeCreate2Address(factoryAddress, salt, bytecode);

console.log(`预计算地址: ${predictedAddress}`);
console.log(`盐值: ${salt}`);
```

## 合约 API

### MemeFactory

#### 主要函数

- `predictTokenAddress()`: 预计算代币地址
- `createMemeToken()`: 创建新的 MEME 代币
- `getMemeTokenInfo()`: 获取代币信息
- `getAllMemeTokens()`: 获取所有代币列表
- `getCreatorTokens()`: 获取创建者的代币列表

#### 事件

- `MemeTokenCreated`: 代币创建事件
- `CreationFeeUpdated`: 创建费用更新事件
- `PlatformFeeUpdated`: 平台费用更新事件

### MemePlatform

#### 主要函数

- `createMemeToken()`: 通过平台创建代币
- `updateUserProfile()`: 更新用户档案
- `getTrendingTokens()`: 获取热门代币
- `getTokenStats()`: 获取代币统计信息
- `getUserProfile()`: 获取用户档案

### MemeToken

继承标准 ERC20，额外功能：

- `tokenImage()`: 代币图片 URL
- `description()`: 代币描述
- `updateTokenImage()`: 更新代币图片（仅所有者）
- `updateDescription()`: 更新代币描述（仅所有者）
- `burn()`: 销毁代币
- `burnFrom()`: 授权销毁代币

## 部署到测试网

### Sepolia 测试网

1. 设置环境变量：
```bash
export PRIVATE_KEY="your_private_key"
export SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/your_api_key"
export ETHERSCAN_API_KEY="your_etherscan_api_key"
```

2. 部署：
```bash
npm run deploy:sepolia
```

## 安全考虑

- ✅ **重入攻击防护**: 使用 `ReentrancyGuard`
- ✅ **权限控制**: 使用 `Ownable` 模式
- ✅ **地址验证**: Create2 地址匹配验证
- ✅ **费用保护**: 创建费用验证和多余费用退还
- ✅ **盐值唯一性**: 防止相同盐值重复使用

## 开发工具

### 代码格式化
```bash
npm run format
```

### 代码检查
```bash
npm run lint
```

### 测试覆盖率
```bash
forge coverage
```

## 常见问题

### Q: 如何生成特定前缀的地址？
A: 使用 `addressPrecompute.js` 中的 `generateVanityAddress` 函数：

```javascript
const vanityResult = generateVanityAddress(
    factoryAddress, 
    bytecode, 
    "888",    // 想要的前缀
    100000    // 最大尝试次数
);
```

### Q: 如何降低 gas 费用？
A: 
1. 使用较短的代币名称和描述
2. 选择合适的代币精度（不一定要 18 位）
3. 在网络拥堵较少时部署

### Q: 预计算的地址不匹配怎么办？
A: 
1. 确保使用正确的工厂合约地址
2. 检查构造函数参数是否完全一致
3. 验证字节码是否为最新编译版本

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
