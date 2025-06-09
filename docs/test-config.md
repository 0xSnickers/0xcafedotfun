# USDT BondingCurve 测试配置

## 测试概述

这套测试脚本全面覆盖了USDT版本BondingCurve合约的所有功能，包括：

### 🔧 测试组件

1. **MockUSDT**: 模拟USDT代币（6位小数）
2. **MockMemePlatform**: 模拟平台合约
3. **完整的BondingCurve测试套件**

### 📋 测试覆盖范围

#### 核心功能测试
- ✅ `testInitialState()`: 初始状态验证
- ✅ `testBuyTokensBasic()`: 基础购买功能
- ✅ `testSellTokensBasic()`: 基础卖出功能
- ✅ `testPriceProgression()`: 价格变化逻辑

#### 计算功能测试
- ✅ `testCalculateBuyPrice()`: 购买价格计算
- ✅ `testCalculateSellPrice()`: 卖出价格计算
- ✅ `testCalculateTokensForUsdtPrecise()`: 二分搜索精确计算

#### 安全与权限测试
- ✅ `testSlippageProtection()`: 滑点保护机制
- ✅ `testInsufficientUSDTBalance()`: 余额不足处理
- ✅ `testInsufficientTokenBalance()`: 代币余额不足
- ✅ `testUnauthorizedInitializeCurve()`: 未授权访问控制

#### 管理员功能测试
- ✅ `testOwnerFunctions()`: 所有者权限功能
- ✅ `testEmergencyWithdraw()`: 紧急提取功能
- ✅ `testTokenGraduation()`: 代币毕业机制

#### 工具函数测试
- ✅ `testGetContractUsdtBalance()`: 合约余额查询

## 🚀 运行测试

### 方法1: 使用脚本
```bash
chmod +x run-usdt-tests.sh
./run-usdt-tests.sh
```

### 方法2: 直接使用Forge
```bash
# 编译
forge build

# 运行所有USDT测试
forge test --match-contract BondingCurveUSDTTest -vvv

# 运行特定测试
forge test --match-test testBuyTokensBasic -vvv

# 查看gas报告
forge test --match-contract BondingCurveUSDTTest --gas-report

# 代码覆盖率
forge coverage --match-contract BondingCurveUSDTTest
```

## 📊 测试参数

```solidity
INITIAL_PRICE = 100;        // 0.0001 USDT
TARGET_PRICE = 10000;       // 0.01 USDT  
TARGET_SUPPLY = 8亿代币      // 800,000,000 * 1e18
PLATFORM_FEE = 2%           // 200/10000
CREATOR_FEE = 3%            // 300/10000
```

## 🔍 关键测试场景

### 1. 购买流程测试
- 用户approve USDT → 购买代币
- 验证费用分配（平台费、创建者费）
- 检查代币铸造和余额变化

### 2. 卖出流程测试  
- 用户approve代币 → 卖出代币
- 验证USDT返还和平台费扣除
- 检查代币销毁和余额变化

### 3. 价格机制测试
- 线性bonding curve价格上涨
- 二分搜索精确计算
- 积分公式验证

### 4. 边界条件测试
- 余额不足情况
- 滑点保护机制
- 权限控制验证

## ⚠️ 注意事项

1. **USDT精度**: 测试中使用6位小数 (1e6)
2. **费用计算**: 总费用5%（平台2% + 创建者3%）
3. **授权机制**: 测试自动处理approve操作
4. **Mock合约**: 使用模拟合约简化测试环境

## 🐛 常见问题

### 编译错误
- 确保使用正确的Solidity版本 (^0.8.29)
- 检查OpenZeppelin依赖是否安装

### 测试失败
- 检查gas limit设置
- 验证合约地址和参数配置
- 查看详细错误信息 (-vvv 参数)

## 📈 性能指标

预期的gas消耗范围：
- `buyTokens()`: ~150,000 gas
- `sellTokens()`: ~120,000 gas  
- `calculateTokensForUsdtPrecise()`: ~50,000 gas (view函数)

## 🔄 集成测试

这套测试可以与以下组件集成：
- MemeFactory合约测试
- 前端集成测试
- 端到端用户流程测试 