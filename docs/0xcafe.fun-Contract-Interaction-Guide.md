# 0xcafe.fun 合约交互详解

## 概述

0xcafe.fun 采用 Bonding Curve 机制实现动态定价的 Meme 代币平台。本文档详细分析从代币创建到交易的完整合约交互过程，包括费用结构、定价算法、市值计算和毕业机制。

---

## 第一部分：代币创建与动态铸造流程

### 1.1 创建流程概览

```
用户发起创建 → MemePlatform → MemeFactory → MemeToken部署 → BondingCurve初始化
     ↓              ↓            ↓              ↓              ↓
   支付费用    →  参数验证  →  CREATE2部署  →  设置权限   →   配置曲线
```

### 1.2 详细交互步骤

#### 步骤1: 用户调用 MemePlatform.createMemeToken()

**函数签名:**
```solidity
function createMemeToken(
    string memory name,           // 代币名称
    string memory symbol,         // 代币符号
    uint8 decimals,              // 精度位数
    string memory tokenImage,     // 代币图片URL
    string memory description,    // 代币描述
    bytes32 salt,                // CREATE2盐值
    uint256 targetSupply,        // 目标供应量
    uint256 targetPrice,         // 目标价格(ETH)
    uint256 initialPrice         // 初始价格(ETH)
) external payable returns (address)
```

**费用要求:**
- 用户需支付 `creationFee = 0.001 ether`
- 多付部分会被退回

#### 步骤2: MemePlatform 转发到 MemeFactory

```solidity
address tokenAddress = memeFactory.createMemeToken{value: msg.value}(
    name, symbol, decimals, tokenImage, description, 
    salt, msg.sender, targetSupply, targetPrice, initialPrice
);
```

#### 步骤3: MemeFactory 执行代币部署

**3.1 验证和预测地址:**
```solidity
require(msg.value >= creationFee, "Insufficient creation fee");
require(bytes(params.name).length > 0, "Invalid params");

// 预测地址确保唯一性
address predictedAddress = _computeAddress(...);
require(memeTokens[predictedAddress].tokenAddress == address(0), "Token exists");
```

**3.2 CREATE2 部署代币:**
```solidity
address tokenAddress = Create2.deploy(0, salt, abi.encodePacked(
    type(MemeToken).creationCode,
    abi.encode(name, symbol, decimals, targetSupply, address(this), tokenImage, description)
));
```

**3.3 注册代币信息:**
```solidity
memeTokens[tokenAddress] = MemeTokenInfo({
    tokenAddress: tokenAddress,
    name: name,
    symbol: symbol, 
    creator: actualCreator,
    createdAt: block.timestamp,
    tokenImage: tokenImage,
    description: description
});
```

#### 步骤4: 设置铸造权限

```solidity
MemeToken token = MemeToken(tokenAddress);
token.setMinter(bondingCurveContract);  // 授权BondingCurve铸造
```

#### 步骤5: 初始化 Bonding Curve

```solidity
BondingCurve(bondingCurveContract).initializeCurve(
    tokenAddress,
    actualCreator,
    targetSupply,
    targetPrice, 
    initialPrice
);
```

**Curve 参数计算:**
```solidity
// 线性Bonding Curve: price = initialPrice + k * supply
uint256 k = (targetPrice - initialPrice) * 1e18 / targetSupply;

curveParams[tokenAddress] = CurveParams({
    k: k,
    targetSupply: targetSupply,
    targetPrice: targetPrice,
    initialPrice: initialPrice,
    currentSupply: 0,           // 初始供应量为0
    graduated: false            // 未毕业状态
});
```

### 1.3 费用分配

**创建费用分配:**
- **总费用:** 0.001 ETH (固定)
- **平台收取:** 0.001 ETH (100%)
- **创建者收取:** 0 ETH (创建阶段无收益)

**退款机制:**
```solidity
if (msg.value > creationFee) {
    payable(msg.sender).transfer(msg.value - creationFee);
}
```

---

## 第二部分：交易机制与动态定价

### 2.1 Bonding Curve 定价算法

#### 2.1.1 线性定价公式

**当前价格计算:**
```solidity
function getCurrentPrice(address tokenAddress) public view returns (uint256) {
    CurveParams memory params = curveParams[tokenAddress];
    if (params.graduated) {
        return params.targetPrice;  // 毕业后固定价格
    }
    
    // 线性公式: price = initialPrice + (k * currentSupply) / 1e18
    return params.initialPrice + (params.k * params.currentSupply) / 1e18;
}
```

**参数说明:**
- `initialPrice`: 初始价格 (如: 0.0000001 ETH)
- `targetPrice`: 目标价格 (如: 0.001 ETH)
- `targetSupply`: 目标供应量 (如: 100,000,000 tokens)
- `k`: 斜率参数 = `(targetPrice - initialPrice) * 1e18 / targetSupply`

#### 2.1.2 购买成本计算

**积分公式:**
购买 `tokenAmount` 个代币的成本通过积分计算：

```
∫(initialPrice + k*x/1e18)dx from currentSupply to (currentSupply + tokenAmount)
```

**实现代码:**
```solidity
function calculateBuyPrice(address tokenAddress, uint256 tokenAmount) 
    public view returns (uint256 ethCost, uint256 afterFeesCost) {
    
    uint256 currentSupply = params.currentSupply;
    uint256 newSupply = currentSupply + tokenAmount;
    
    // 积分结果: initialPrice * tokenAmount + k * (newSupply² - currentSupply²) / (2 * 1e18)
    uint256 supplySquareDiff = (newSupply * newSupply - currentSupply * currentSupply) / 2;
    ethCost = params.initialPrice * tokenAmount / 1e18 + 
              params.k * supplySquareDiff / (1e18 * 1e18);
    
    // 加上手续费
    uint256 totalFees = (ethCost * (PLATFORM_FEE + CREATOR_FEE)) / FEE_BASE;
    afterFeesCost = ethCost + totalFees;
}
```

### 2.2 购买交易流程

#### 步骤1: 用户调用 buyTokens()

```solidity
function buyTokens(address tokenAddress, uint256 minTokenAmount) 
    external payable nonReentrant
```

**滑点保护:**
- `minTokenAmount`: 最少接收代币数量
- 防止抢跑和价格滑动损失

#### 步骤2: 计算购买数量

```solidity
uint256 tokenAmount = calculateTokensForEth(tokenAddress, msg.value);
require(tokenAmount >= minTokenAmount, "Slippage protection");
```

**简化计算逻辑:**
```solidity
function calculateTokensForEth(address tokenAddress, uint256 ethAmount) 
    public view returns (uint256) {
    uint256 currentPrice = getCurrentPrice(tokenAddress);
    uint256 estimatedTokens = (ethAmount * 1e18) / currentPrice;
    
    // 确保不超过剩余供应量
    uint256 remainingSupply = params.targetSupply - params.currentSupply;
    return estimatedTokens > remainingSupply ? remainingSupply : estimatedTokens;
}
```

#### 步骤3: 更新状态和铸造

```solidity
// 更新供应量
params.currentSupply += tokenAmount;

// 更新筹集资金
info.totalRaised += msg.value;

// 铸造代币给买家
MemeToken(tokenAddress).mint(msg.sender, tokenAmount);
```

#### 步骤4: 费用分配

**费用结构:**
- **平台费:** 2% (`PLATFORM_FEE = 200`)
- **创建者费:** 3% (`CREATOR_FEE = 300`)
- **费用基数:** 10000

**分配逻辑:**
```solidity
uint256 creatorFee = (msg.value * CREATOR_FEE) / FEE_BASE;  // 3%
uint256 platformFee = (msg.value * PLATFORM_FEE) / FEE_BASE; // 2%

// 立即转账给创建者
if (creatorFee > 0) {
    payable(info.creator).transfer(creatorFee);
    info.creatorFeeCollected += creatorFee;
}

// 平台费留在合约中，需owner提取
```

#### 步骤5: 检查毕业条件

```solidity
if (params.currentSupply >= params.targetSupply) {
    params.graduated = true;
    emit TokenGraduated(tokenAddress, params.currentSupply, info.totalRaised);
}
```

### 2.3 卖出交易流程

#### 卖出价格计算

```solidity
function calculateSellPrice(address tokenAddress, uint256 tokenAmount) 
    public view returns (uint256 ethReceived, uint256 afterFeesReceived) {
    
    uint256 currentSupply = params.currentSupply;
    uint256 newSupply = currentSupply - tokenAmount;
    
    // 反向积分计算
    uint256 supplySquareDiff = (currentSupply * currentSupply - newSupply * newSupply) / 2;
    ethReceived = params.initialPrice * tokenAmount / 1e18 + 
                  params.k * supplySquareDiff / (1e18 * 1e18);
    
    // 扣除平台费用(仅平台费，创建者不收卖出费)
    uint256 platformFee = (ethReceived * PLATFORM_FEE) / FEE_BASE;
    afterFeesReceived = ethReceived - platformFee;
}
```

#### 卖出执行

```solidity
// 销毁代币
MemeToken(tokenAddress).burnFrom(msg.sender, tokenAmount);

// 更新供应量
params.currentSupply -= tokenAmount;

// 转账ETH给卖家
payable(msg.sender).transfer(ethReceived);
```

---

## 第三部分：市值计算与发行进度

### 3.1 实时市值计算

**市值公式:**
```
市值 = 当前价格 × 当前流通供应量
```

**代码实现:**
```solidity
function getTokenDetails(address tokenAddress) external view returns (
    CurveParams memory params,
    TokenInfo memory info,
    uint256 currentPrice,
    uint256 marketCap
) {
    params = curveParams[tokenAddress];
    info = tokenInfos[tokenAddress];
    currentPrice = getCurrentPrice(tokenAddress);
    marketCap = (currentPrice * params.currentSupply) / 1e18;
}
```

### 3.2 价格变化示例

假设参数：
- `initialPrice = 0.0000001 ETH`
- `targetPrice = 0.001 ETH`  
- `targetSupply = 100,000,000 tokens`
- `k = (0.001 - 0.0000001) * 1e18 / 100,000,000 = 9.999 × 10^9`

**价格变化轨迹:**

| 流通量 | 当前价格(ETH) | 市值(ETH) | 涨幅 |
|--------|---------------|-----------|------|
| 0 | 0.0000001 | 0 | - |
| 10,000,000 | 0.0001001 | 1,001 | +100,000% |
| 50,000,000 | 0.0005001 | 25,005 | +499,900% |
| 90,000,000 | 0.0009001 | 81,009 | +899,900% |
| 100,000,000 | 0.001 | 100,000 | +999,900% |

### 3.3 发行进度追踪

**进度指标:**
```solidity
struct ProgressInfo {
    uint256 currentSupply;      // 当前流通量
    uint256 targetSupply;       // 目标流通量
    uint256 progressPercent;    // 进度百分比
    uint256 currentPrice;       // 当前价格
    uint256 targetPrice;        // 目标价格
    uint256 totalRaised;        // 已筹集ETH
    bool graduated;             // 是否毕业
}
```

**进度计算:**
```solidity
function getTokenProgress(address tokenAddress) public view returns (ProgressInfo memory) {
    CurveParams memory params = curveParams[tokenAddress];
    TokenInfo memory info = tokenInfos[tokenAddress];
    
    uint256 progressPercent = (params.currentSupply * 10000) / params.targetSupply; // basis points
    
    return ProgressInfo({
        currentSupply: params.currentSupply,
        targetSupply: params.targetSupply,
        progressPercent: progressPercent,
        currentPrice: getCurrentPrice(tokenAddress),
        targetPrice: params.targetPrice,
        totalRaised: info.totalRaised,
        graduated: params.graduated
    });
}
```

---

## 第四部分：毕业机制与逻辑

### 4.1 毕业条件

**触发条件:**
```solidity
if (params.currentSupply >= params.targetSupply) {
    params.graduated = true;
    emit TokenGraduated(tokenAddress, params.currentSupply, info.totalRaised);
}
```

**毕业标准:**
- 流通供应量达到目标供应量 (100%)
- 价格达到目标价格
- 自动触发，无需手动操作

### 4.2 毕业后状态

**状态变化:**
```solidity
struct CurveParams {
    uint256 k;              // 保持不变
    uint256 targetSupply;   // 保持不变  
    uint256 targetPrice;    // 保持不变
    uint256 initialPrice;   // 保持不变
    uint256 currentSupply;  // 固定为targetSupply
    bool graduated;         // 设为true
}
```

**价格固定:**
```solidity
function getCurrentPrice(address tokenAddress) public view returns (uint256) {
    CurveParams memory params = curveParams[tokenAddress];
    if (params.graduated) {
        return params.targetPrice;  // 固定在目标价格
    }
    // ...正常计算逻辑
}
```

**交易限制:**
```solidity
function buyTokens(address tokenAddress, uint256 minTokenAmount) external payable {
    require(!params.graduated, "Token has graduated");  // 禁止购买
    // ...
}

function sellTokens(address tokenAddress, uint256 tokenAmount, uint256 minEthAmount) external {
    require(!params.graduated, "Token has graduated");  // 禁止卖出
    // ...
}
```

### 4.3 毕业数据统计

**最终数据:**
```solidity
event TokenGraduated(
    address indexed token,
    uint256 finalSupply,        // 最终流通量
    uint256 totalRaised         // 总筹集资金
);
```

**统计信息:**
- **最大筹集资金:** 约为曲线下面积 ≈ `(initialPrice + targetPrice) * targetSupply / 2`
- **创建者总收益:** `totalRaised * 3%`
- **平台总收益:** `creationFee + totalRaised * 2%`

---

## 第五部分：手续费详细分析

### 5.1 费用类型总览

| 费用类型 | 金额/比例 | 收取时机 | 受益方 | 说明 |
|----------|-----------|----------|--------|------|
| 创建费 | 0.001 ETH | 创建代币时 | 平台 | 固定费用 |
| 平台费 | 2% | 每次买卖 | 平台 | 基于交易额 |
| 创建者费 | 3% | 仅购买时 | 创建者 | 基于交易额 |

### 5.2 创建费用详解

**收取机制:**
```solidity
uint256 public creationFee = 0.001 ether;

function _createToken(...) internal returns (address) {
    require(msg.value >= creationFee, "Insufficient creation fee");
    
    // 创建代币...
    
    // 退还多余费用
    if (msg.value > creationFee) {
        payable(msg.sender).transfer(msg.value - creationFee);
    }
}
```

**费用用途:**
- 防止垃圾代币创建
- 平台运营成本
- 合约部署 gas 费补偿

### 5.3 交易费用详解

#### 5.3.1 购买交易费用

**总费用:** 5% (平台费2% + 创建者费3%)

**费用计算示例:**
假设用户用 1 ETH 购买代币：
```
交易金额: 1 ETH
平台费: 1 × 2% = 0.02 ETH
创建者费: 1 × 3% = 0.03 ETH
总费用: 0.05 ETH
实际用于购买: 0.95 ETH
```

**分配流程:**
```solidity
uint256 creatorFee = (msg.value * CREATOR_FEE) / FEE_BASE;  // 0.03 ETH
uint256 platformFee = (msg.value * PLATFORM_FEE) / FEE_BASE; // 0.02 ETH

// 立即转给创建者
payable(info.creator).transfer(creatorFee);

// 平台费留在合约中
// 剩余 0.95 ETH 用于购买代币和更新曲线
```

#### 5.3.2 卖出交易费用

**总费用:** 2% (仅平台费)

**费用计算示例:**
假设用户卖出获得 1 ETH：
```
理论收益: 1 ETH
平台费: 1 × 2% = 0.02 ETH
实际收益: 0.98 ETH
```

**设计理由:**
- 创建者仅在购买时收费，鼓励持有
- 卖出仅收平台费，降低卖出成本
- 平衡创建者和持有者利益

### 5.4 费用提取机制

**平台费提取:**
```solidity
function withdrawPlatformFees() external onlyOwner {
    uint256 balance = address(this).balance;
    require(balance > 0, "No fees to withdraw");
    payable(owner()).transfer(balance);
}
```

**创建者费实时到账:**
```solidity
// 购买时立即转账，无需提取
payable(info.creator).transfer(creatorFee);
info.creatorFeeCollected += creatorFee;  // 记录总收益
```

---

## 第六部分：经济模型分析

### 6.1 价格发现机制

**优势:**
1. **公平定价:** 数学公式确定，无人为操控
2. **早期优势:** 早期投资者价格较低
3. **自动调节:** 供需关系自动反映在价格中
4. **透明预测:** 价格轨迹完全可预测

**价格敏感性:**
```solidity
// 每增加1%供应量的价格涨幅
uint256 priceIncrease = k * (targetSupply * 1 / 100) / 1e18;
```

### 6.2 经济激励分析

**创建者激励:**
- 创建代币需付费，筛选认真项目
- 交易量越大收益越高，激励推广
- 3%费率合理，不会过度攫取价值

**投资者激励:**
- 早期价格优势明显
- 线性增长提供合理预期
- 毕业机制确保项目成功

**平台可持续性:**
- 创建费保证基础收入
- 交易费随成交量增长
- 2%费率适中，不影响交易活跃度

### 6.3 风险控制机制

**技术风险:**
- 重入攻击防护: `nonReentrant`
- 权限控制: `onlyOwner`, `onlyAuthorized`
- 参数验证: 地址非零、数量正数等

**经济风险:**
- 滑点保护: `minTokenAmount`, `minEthAmount`
- 供应量限制: 不能超过目标供应量
- 毕业机制: 防止无限增发

**紧急机制:**
```solidity
function emergencyPause(address tokenAddress) external onlyOwner {
    curveParams[tokenAddress].graduated = true;  // 强制毕业，停止交易
}
```

---

## 总结

0xcafe.fun 的合约设计通过以下机制实现了公平、透明、可持续的 Meme 代币生态：

1. **创建门槛:** 0.001 ETH 创建费防止垃圾项目
2. **动态定价:** 线性 Bonding Curve 确保公平价格发现
3. **激励平衡:** 3%创建者费 + 2%平台费的合理分配
4. **风险控制:** 多层安全机制和紧急处理能力
5. **毕业机制:** 自动毕业确保项目成功退出

这种设计既保护了投资者利益，又激励了创建者积极推广，同时为平台提供了可持续的商业模式。 