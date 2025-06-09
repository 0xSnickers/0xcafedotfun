# 前端 ABI 调用详细流程

## 📋 概述

本文档详细解释前端如何与智能合约进行交互，从用户点击按钮到交易上链的完整过程。

## 🔧 技术栈

- **Wagmi v2**: React Hook库，用于以太坊交互
- **Viem**: 底层以太坊客户端库
- **TypeScript**: 类型安全
- **React**: 前端框架

## 🌊 完整调用流程

### 1. 初始化阶段

#### 1.1 钱包连接
```typescript
// 1. 获取用户钱包信息
const { address, isConnected } = useAccount();
const { data: walletClient } = useWalletClient(); // 用于发送交易
const publicClient = usePublicClient(); // 用于读取数据
```

#### 1.2 合约实例化
```typescript
// 2. 创建合约实例
const platformContract = useMemePlatform(); // 自定义Hook

// 内部实现：
function useMemePlatform() {
  const { publicClient, walletClient, addresses } = useContractBase();
  
  const contract = getContract({
    address: addresses.MEME_PLATFORM as `0x${string}`,
    abi: MEME_PLATFORM_ABI, // ABI定义
    client: { public: publicClient, wallet: walletClient },
  });
  
  return contract;
}
```

### 2. 数据准备阶段

#### 2.1 参数验证与转换
```typescript
// 用户输入 → 合约参数
const params: CreateTokenParams = {
  name: "Pepe Coin",
  symbol: "PEPE", 
  decimals: 18,
  totalSupply: "1000000000", // 字符串
  tokenImage: "https://example.com/pepe.png",
  description: "A meme token",
  salt: generateSalt("PEPE")
};

// 转换为合约需要的格式
const contractParams = [
  params.name,                    // string
  params.symbol,                  // string
  params.decimals,                // uint8
  parseEther(params.totalSupply), // uint256 (BigInt)
  params.tokenImage,              // string
  params.description,             // string
  keccak256(toBytes(params.salt)) // bytes32
] as const;
```

#### 2.2 盐值生成
```typescript
// 生成唯一的盐值确保地址唯一性
function generateSalt(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  return `${prefix}-${timestamp}-${random}`;
}

// 转换为bytes32
const salt = keccak256(toBytes(generateSalt(params.symbol)));
```

### 3. 地址预测阶段（可选）

#### 3.1 调用view函数预测地址
```typescript
// 调用合约的只读函数（不消耗gas）
const predictedAddress = await platformContract.read.predictTokenAddress([
  params.name,
  params.symbol, 
  params.decimals,
  parseEther(params.totalSupply),
  address, // 创建者地址
  params.tokenImage,
  params.description,
  salt
]);

console.log('预测地址:', predictedAddress);
```

### 4. 交易发送阶段

#### 4.1 准备交易选项
```typescript
const transactionOptions = {
  value: parseEther("0.001"), // 创建费用
  account: address,           // 发送者地址
  chain: walletClient.chain,  // 网络信息
  gas: 3000000n,             // Gas限制 (可选)
  gasPrice: parseGwei("20"),  // Gas价格 (可选)
};
```

#### 4.2 调用合约写入函数
```typescript
// 发送交易到区块链
const hash = await platformContract.write.createMemeToken(
  contractParams,    // 函数参数数组
  transactionOptions // 交易配置
);

console.log('交易哈希:', hash);
// 返回: 0x1234567890abcdef... (交易哈希)
```

### 5. 交易确认阶段

#### 5.1 等待交易打包
```typescript
// 等待交易被矿工打包
const receipt = await publicClient.waitForTransactionReceipt({ 
  hash: hash as `0x${string}`,
  confirmations: 1 // 确认数
});

console.log('交易收据:', receipt);
```

#### 5.2 解析事件日志
```typescript
// 从交易收据中解析事件
import { decodeEventLog } from 'viem';

for (const log of receipt.logs) {
  try {
    const decoded = decodeEventLog({
      abi: MEME_PLATFORM_ABI,
      data: log.data,
      topics: log.topics,
    });
    
    if (decoded.eventName === 'MemeTokenCreated') {
      const tokenAddress = decoded.args.tokenAddress;
      console.log('代币地址:', tokenAddress);
    }
  } catch (error) {
    // 跳过非目标事件
  }
}
```

## 🔍 详细代码示例

### 完整的创建代币函数
```typescript
async function createMemeToken(params: CreateTokenParams) {
  // 第1步：验证钱包连接
  if (!platformContract || !walletClient || !address) {
    throw new Error('钱包未连接');
  }

  // 第2步：验证参数
  const errors = validateTokenParams(params);
  if (errors.length > 0) {
    throw new Error(errors.join(', '));
  }

  // 第3步：生成盐值
  const salt = keccak256(toBytes(generateSalt(params.symbol)));

  // 第4步：准备合约参数
  const contractParams = [
    params.name,
    params.symbol,
    params.decimals,
    parseEther(params.totalSupply),
    params.tokenImage,
    params.description,
    salt
  ] as const;

  // 第5步：准备交易选项
  const options = {
    value: parseEther("0.001"),
    account: address,
    chain: walletClient.chain,
  };

  // 第6步：发送交易
  console.log('发送交易...');
  const hash = await platformContract.write.createMemeToken(
    contractParams,
    options
  );
  
  console.log('交易发送成功:', hash);

  // 第7步：等待确认
  console.log('等待交易确认...');
  const receipt = await publicClient.waitForTransactionReceipt({ 
    hash: hash as `0x${string}` 
  });

  console.log('交易确认成功:', receipt);
  return { hash, receipt };
}
```

### 错误处理
```typescript
try {
  await createMemeToken(params);
} catch (error: any) {
  // 处理不同类型的错误
  if (error.code === 4001) {
    // 用户拒绝交易
    message.error('用户取消了交易');
  } else if (error.message?.includes('insufficient funds')) {
    // 余额不足
    message.error('账户余额不足');
  } else if (error.message?.includes('gas')) {
    // Gas相关错误
    message.error('Gas费用设置过低或gas limit不足');
  } else {
    // 其他错误
    message.error(`交易失败: ${error.message}`);
  }
}
```

## 🔄 数据流转过程

```
用户输入 → 参数验证 → 类型转换 → 合约调用 → 交易签名 → 广播交易 → 等待确认 → 解析结果
   ↓           ↓          ↓          ↓          ↓          ↓          ↓          ↓
表单数据 → TypeScript → BigInt/hex → ABI编码 → 钱包签名 → 节点接收 → 区块打包 → 事件日志
```

## 📱 用户体验优化

### 1. 实时反馈
```typescript
// 显示当前步骤
const [currentStep, setCurrentStep] = useState(0);

const steps = [
  '验证参数',
  '预测地址', 
  '发送交易',
  '等待确认',
  '完成'
];
```

### 2. 进度提示
```typescript
// 实时更新进度
setCurrentStep(1); // 预测地址
await predictTokenAddress(params);

setCurrentStep(2); // 发送交易
const hash = await createToken(params);

setCurrentStep(3); // 等待确认
await waitForTransaction(hash);

setCurrentStep(4); // 完成
```

### 3. 错误恢复
```typescript
// 保存状态以便重试
const [txHash, setTxHash] = useState('');
const [retryCount, setRetryCount] = useState(0);

// 如果交易发送成功但确认失败，可以重试确认
if (txHash && retryCount < 3) {
  await waitForTransaction(txHash);
}
```

## 🛠️ 调试技巧

### 1. 控制台日志
```typescript
// 详细的调试信息
console.log('🔮 预测参数:', contractParams);
console.log('💰 交易选项:', transactionOptions);
console.log('📡 发送交易:', hash);
console.log('📋 交易收据:', receipt);
```

### 2. 网络监控
```typescript
// 监控网络状态
const { chain } = useNetwork();
console.log('当前网络:', chain?.name, chain?.id);

// 检查合约地址
const addresses = getContractAddresses(chain?.id);
console.log('合约地址:', addresses);
```

### 3. Gas估算
```typescript
// 预估Gas费用
const gasEstimate = await publicClient.estimateContractGas({
  address: addresses.MEME_PLATFORM,
  abi: MEME_PLATFORM_ABI,
  functionName: 'createMemeToken',
  args: contractParams,
  value: parseEther("0.001"),
  account: address,
});

console.log('预估Gas:', gasEstimate.toString());
```

## ❗ 常见问题

### Q: 为什么交易失败？
A: 检查以下几点：
1. 账户余额是否足够（ETH + Gas费）
2. Gas limit是否足够
3. 合约地址是否正确
4. 参数类型是否匹配
5. 网络是否正确

### Q: 如何处理交易卡住？
A: 
1. 检查网络拥堵情况
2. 提高Gas价格重新发送
3. 使用交易加速工具
4. 等待更长时间

### Q: 如何确认交易成功？
A:
1. 获取交易收据 `receipt.status === 'success'`
2. 检查事件是否正确触发
3. 验证合约状态是否改变

## 🚀 性能优化

1. **批量操作**: 将多个调用合并为一个交易
2. **缓存结果**: 缓存只读函数的结果
3. **预计算**: 提前计算地址和参数
4. **并发处理**: 并行处理独立的操作

---

这就是前端与智能合约交互的完整流程！每一步都有详细的类型检查和错误处理，确保用户体验的同时保证交易安全。 