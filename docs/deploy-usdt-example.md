# USDT版本BondingCurve部署和使用指南

## 1. 部署步骤

### 1.1 准备USDT代币地址
```solidity
// Ethereum Mainnet USDT: 0xdAC17F958D2ee523a2206206994597C13D831ec7
// Polygon USDT: 0xc2132D05D31c914a87C6611C10748AEb04B58e8F
// BSC USDT: 0x55d398326f99059fF775485246999027B3197955
```

### 1.2 部署合约
```solidity
// 1. 先部署 MemePlatform 合约
MemePlatform memePlatform = new MemePlatform();

// 2. 部署 BondingCurve 合约
address usdtToken = 0xdAC17F958D2ee523a2206206994597C13D831ec7; // 主网USDT
BondingCurve bondingCurve = new BondingCurve(
    address(memePlatform),
    usdtToken
);

// 3. 设置授权
bondingCurve.addAuthorizedCaller(address(memeFactory));
```

## 2. 价格设置示例

### 2.1 USDT价格单位（6位小数）
```solidity
// USDT使用6位小数，所以：
uint256 initialPrice = 0.0001 * 1e6; // 0.0001 USDT = 100 wei
uint256 targetPrice = 0.01 * 1e6;    // 0.01 USDT = 10000 wei
uint256 targetSupply = 800_000_000 * 1e18; // 8亿代币
```

### 2.2 创建代币示例
```solidity
memeFactory.createMemeToken(
    "Test Token",           // name
    "TEST",                // symbol
    18,                    // decimals
    "image_url",           // tokenImage
    "description",         // description
    keccak256("salt"),     // salt
    msg.sender,            // actualCreator
    800_000_000 * 1e18,    // targetSupply
    0.01 * 1e6,           // targetPrice (0.01 USDT)
    0.0001 * 1e6          // initialPrice (0.0001 USDT)
);
```

## 3. 用户交互流程

### 3.1 购买代币
```solidity
// 1. 用户先approve USDT
IERC20(usdtToken).approve(address(bondingCurve), 100 * 1e6); // approve 100 USDT

// 2. 购买代币
bondingCurve.buyTokens(
    tokenAddress,     // 代币地址
    100 * 1e6,       // 100 USDT
    0                // 最小代币数量（滑点保护）
);
```

### 3.2 卖出代币
```solidity
// 1. 用户先approve代币
MemeToken(tokenAddress).approve(address(bondingCurve), tokenAmount);

// 2. 卖出代币
bondingCurve.sellTokens(
    tokenAddress,     // 代币地址
    tokenAmount,      // 代币数量
    0                // 最小USDT数量（滑点保护）
);
```

## 4. 前端集成示例

### 4.1 价格查询
```javascript
// 获取当前价格（返回值单位：USDT wei，需要除以1e6）
const currentPrice = await bondingCurve.getCurrentPrice(tokenAddress);
const priceInUsdt = currentPrice / 1e6;

// 计算购买价格
const usdtAmount = 100 * 1e6; // 100 USDT
const [usdtCost, afterFeesCost] = await bondingCurve.calculateBuyPrice(tokenAddress, tokenAmount);
const totalCost = afterFeesCost / 1e6; // 转换为USDT
```

### 4.2 代币详情
```javascript
const [params, info, currentPrice, marketCap] = await bondingCurve.getTokenDetails(tokenAddress);
console.log({
    currentSupply: params.currentSupply,
    targetSupply: params.targetSupply,
    currentPrice: currentPrice / 1e6, // USDT
    marketCap: marketCap / 1e6,       // USDT
    totalRaised: info.totalRaised / 1e6 // USDT
});
```

## 5. 注意事项

1. **USDT精度**: USDT使用6位小数，价格计算时注意单位转换
2. **授权机制**: 用户必须先approve USDT才能购买，approve代币才能卖出
3. **滑点保护**: 设置合理的最小数量避免价格滑点
4. **费用结构**: 平台费2%，创建者费3%，从购买金额中扣除
5. **合约余额**: 卖出时需要合约有足够的USDT余额

## 6. 主要变化总结

- `buyTokens()`: 新增 `usdtAmount` 参数，移除 `payable`
- `sellTokens()`: `minEthAmount` 改为 `minUsdtAmount`
- 所有ETH相关变量改为USDT
- 转账方式从 `transfer` 改为 `transferFrom/transfer`
- 新增 `getContractUsdtBalance()` 查询函数
- MemePlatform接口需要支持ERC20代币接收 