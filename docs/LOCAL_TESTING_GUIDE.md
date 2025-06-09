# 🧪 本地测试指南 - Anvil环境

## 📋 概述

这份指南将帮助你在本地Anvil环境中部署和测试完整的Meme代币平台，包括MockUSDT合约。

## 🚀 快速开始

### 1. 启动Anvil
```bash
# 在终端窗口1启动Anvil
anvil
```

### 2. 部署合约
```bash
# 在终端窗口2运行部署脚本
./local-deploy.sh

# 或者手动部署
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

### 3. 运行测试
```bash
# 运行所有测试
forge test -v

# 运行特定测试
forge test --match-contract MockUSDTTest -v
forge test --match-contract MemePlatformTest -v
forge test --match-contract BondingCurveUSDTTest -v
```

## 🏗️ 部署的合约

| 合约名称 | 描述 | 功能 |
|---------|------|------|
| **MockUSDT** | 模拟USDT代币 | 6位小数，ERC20标准，黑名单功能 |
| **MemeFactory** | 代币工厂 | 创建Meme代币，管理代币列表 |
| **MemePlatform** | 平台管理 | 用户档案，费用管理，代币创建 |
| **BondingCurve** | 联合曲线 | USDT定价，代币买卖，费用分配 |

## 🔧 合约配置

### 默认参数
- **创建费用**: 0.001 ETH
- **平台费率**: 2% (200 basis points)
- **创建者费率**: 3% (300 basis points)
- **USDT小数位**: 6 (与真实USDT一致)

### 测试账户设置
每个测试账户预分配：
- **ETH**: 10,000 ETH (Anvil默认)
- **USDT**: 100,000 USDT (MockUSDT)

## 💰 测试账户信息

| 账户 | 地址 | 私钥 |
|-----|------|------|
| 部署者 | `0xf39Fd6e5...` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| 账户1 | `0x70997970...` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| 账户2 | `0x3C44CdDd...` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
| 账户3 | `0x90F79bf6...` | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |

## 🧪 测试用例覆盖

### MockUSDT 测试 (14个测试)
- ✅ 基本信息验证
- ✅ 铸造功能 (mint, batchMint, mintTestAmount)
- ✅ 销毁功能 (burn, burnFrom)
- ✅ 黑名单机制
- ✅ 暂停功能
- ✅ 权限控制
- ✅ 便捷函数 (transferDollars, getFormattedBalance)

### MemePlatform 测试 (5个测试)
- ✅ 合约部署验证
- ✅ 用户档案管理
- ✅ 代币创建功能
- ✅ 平台费用管理

### BondingCurve 测试 (15个测试)
- ✅ 初始状态验证
- ✅ 基础买卖功能
- ✅ 价格进展机制
- ✅ 计算函数精度
- ✅ 滑点保护
- ✅ 余额验证
- ✅ 权限控制
- ✅ 管理员功能
- ✅ 代币毕业机制
- ✅ 紧急功能

## 📊 性能指标

### 合约大小
- **MemeFactory**: 22,144 bytes (安全边距: 2,432 bytes)
- **MemePlatform**: 13,191 bytes (安全边距: 11,385 bytes)
- **BondingCurve**: 16,779 bytes (安全边距: 32,373 bytes)
- **MockUSDT**: 12,326 bytes (安全边距: 36,826 bytes)

### Gas 消耗 (估算)
- **创建代币**: ~2,100,000 gas
- **购买代币**: ~680,000 gas
- **卖出代币**: ~86,000 gas
- **USDT转账**: ~51,000 gas

## 🛠️ 常用操作

### 1. 查看账户余额
```bash
# ETH余额
cast balance 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --rpc-url http://127.0.0.1:8545

# USDT余额
cast call <USDT_ADDRESS> "balanceOf(address)(uint256)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --rpc-url http://127.0.0.1:8545
```

### 2. 铸造测试USDT
```bash
# 给指定地址铸造100,000 USDT
cast send <USDT_ADDRESS> "mintTestAmount(address)" <USER_ADDRESS> \
    --private-key <DEPLOYER_PRIVATE_KEY> \
    --rpc-url http://127.0.0.1:8545
```

### 3. 创建代币
```bash
# 通过MemePlatform创建代币
cast send <PLATFORM_ADDRESS> "createMemeToken(string,string,uint8,string,string,bytes32,uint256,uint256,uint256)" \
    "Test Token" "TEST" 18 "image_url" "description" 0x$(openssl rand -hex 32) \
    800000000000000000000000000 1000000 1000 \
    --value 0.001ether \
    --private-key <USER_PRIVATE_KEY> \
    --rpc-url http://127.0.0.1:8545
```

### 4. 购买代币
```bash
# 1. 先approve USDT
cast send <USDT_ADDRESS> "approve(address,uint256)" <BONDING_CURVE_ADDRESS> 1000000000 \
    --private-key <USER_PRIVATE_KEY> \
    --rpc-url http://127.0.0.1:8545

# 2. 购买代币
cast send <BONDING_CURVE_ADDRESS> "buyTokens(address,uint256,uint256)" <TOKEN_ADDRESS> 1000000000 0 \
    --private-key <USER_PRIVATE_KEY> \
    --rpc-url http://127.0.0.1:8545
```

## 🔍 调试技巧

### 1. 查看交易详情
```bash
cast tx <TX_HASH> --rpc-url http://127.0.0.1:8545
```

### 2. 查看交易收据
```bash
cast receipt <TX_HASH> --rpc-url http://127.0.0.1:8545
```

### 3. 解码调用数据
```bash
cast 4byte <METHOD_SELECTOR>
cast 4byte-decode <CALLDATA>
```

### 4. 监听事件
```bash
cast logs --address <CONTRACT_ADDRESS> --from-block 0 --rpc-url http://127.0.0.1:8545
```

## 🐛 常见问题

### Q: Anvil重启后合约地址改变？
**A**: 每次重启Anvil都会重置状态，需要重新部署。建议使用固定的种子：
```bash
anvil --mnemonic "test test test test test test test test test test test junk"
```

### Q: 交易失败显示"insufficient funds"？
**A**: 检查账户ETH余额和USDT余额，确保有足够的gas费和代币。

### Q: USDT转账失败？
**A**: 检查：
1. 是否有足够的USDT余额
2. 是否正确approve了转账额度
3. 账户是否被加入黑名单
4. 合约是否被暂停

### Q: 合约调用失败？
**A**: 使用 `-vvvv` 参数查看详细错误信息：
```bash
forge test --match-test <TEST_NAME> -vvvv
```

## 📱 前端集成

### 环境变量设置
在前端项目的 `.env.local` 文件中添加：
```bash
NEXT_PUBLIC_NETWORK_RPC=http://127.0.0.1:8545
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_MEME_FACTORY_ADDRESS=<部署的地址>
NEXT_PUBLIC_BONDING_CURVE_ADDRESS=<部署的地址>
NEXT_PUBLIC_MEME_PLATFORM_ADDRESS=<部署的地址>
NEXT_PUBLIC_USDT_ADDRESS=<部署的地址>
```

### Web3 配置
```javascript
// 配置本地网络
const localNetwork = {
  id: 31337,
  name: 'Anvil Local',
  network: 'anvil',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
    public: { http: ['http://127.0.0.1:8545'] },
  },
}
```

## 📈 性能监控

### 生成测试报告
```bash
# Gas报告
forge test --gas-report

# 覆盖率报告
forge coverage

# 合约大小检查
forge build --sizes
```

### 监控指标
- 测试通过率: 应保持100%
- Gas使用量: 监控主要函数的gas消耗
- 合约大小: 确保不超过24KB限制

## 🎯 最佳实践

### 1. 测试策略
- 总是先运行单元测试
- 使用集成测试验证合约交互
- 定期检查gas使用量优化

### 2. 开发流程
- 修改合约后立即运行测试
- 使用有意义的测试数据
- 保持测试数据的一致性

### 3. 调试技巧
- 使用console.log调试合约逻辑
- 利用Foundry的cheatcode进行状态操作
- 记录重要的交易哈希用于调试

## 🎉 总结

这个本地测试环境提供了完整的Meme代币平台功能：

1. **完整的代币生命周期**: 创建 → 交易 → 毕业
2. **真实的USDT模拟**: 6位小数，完整ERC20功能
3. **全面的测试覆盖**: 34个测试用例，覆盖所有主要功能
4. **便捷的开发工具**: 自动化部署，详细日志，调试工具

立即开始探索和测试吧！🚀 