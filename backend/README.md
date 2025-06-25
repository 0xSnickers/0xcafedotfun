# 🚀 0xcafe.fun Backend - 自动流动性监控服务

基于 Node.js + Express 构建的智能后端服务，为 0xcafe.fun MEME 代币平台提供**自动流动性监控**、**事件监听**和 **API 管理**功能。

![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![Express](https://img.shields.io/badge/Express-4.x-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Viem](https://img.shields.io/badge/Viem-2.x-purple)

## ✨ 核心功能

### 🤖 **自动流动性监控系统**
- **实时事件监听**: 监听 `TokenGraduatedByMarketCap`、`LiquidityDataStored`、`LiquidityAdded` 事件
- **智能自动执行**: 检测到代币毕业后自动调用 `addLiquidityToUniswap()`
- **私钥管理**: 安全使用私钥进行自动交易执行
- **错误处理**: 完整的重试机制和异常处理

### 🔗 **RESTful API 管理**
- **监控状态查询**: 获取监控系统运行状态
- **手动流动性添加**: 支持手动触发流动性添加操作
- **系统控制**: 启动、停止、重启监控服务
- **实时配置**: 动态配置监控参数

### ⚡ **高性能架构**
- **事件驱动**: 基于以太坊事件的实时响应
- **内存缓存**: 智能缓存减少 RPC 调用
- **异步处理**: 非阻塞的并发事件处理
- **状态管理**: 完整的系统状态跟踪

## 🏗️ 架构设计

```
backend/
├── src/
│   ├── server.ts              # Express 服务器入口
│   ├── services/              # 核心服务层
│   │   ├── liquidityMonitor.ts   # 流动性监控核心服务
│   │   ├── blockchain.ts         # 区块链交互服务
│   │   └── cache.ts             # 内存缓存服务
│   ├── routes/                # API 路由层
│   │   ├── index.ts            # 路由汇总
│   │   └── monitor.ts          # 监控 API 路由
│   └── clients/               # 外部客户端
│       └── viemClient.ts       # Viem 以太坊客户端
├── .env                       # 环境配置
├── package.json               # 依赖配置
└── tsconfig.json              # TypeScript 配置
```

## 🚀 快速开始

### 环境要求
- **Node.js**: 20+
- **npm/yarn/pnpm**: 任意包管理器
- **以太坊节点**: Anvil/Geth/Infura 等

### 安装和启动

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件配置必要参数

# 3. 启动开发服务器
npm run dev

# 4. 访问API
curl http://localhost:9000/api/monitor/status
```

### 环境变量配置

```env
# 必需配置
BONDING_CURVE_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
LIQUIDITY_MANAGER_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
RPC_URL_LOCAL=http://localhost:8545
PRIVATE_KEY_LOCAL=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 可选配置
SERVER_PORT=9000
LOG_LEVEL=info
MONITOR_RESTART_DELAY=5000
```

## 🔄 自动流动性工作流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant BC as BondingCurve
    participant LM as LiquidityManager
    participant Monitor as 监控服务
    participant Uniswap as Uniswap V2

    U->>BC: 购买代币达到毕业市值
    BC->>BC: 触发 TokenGraduatedByMarketCap 事件
    BC->>LM: 调用 storeLiquidityData()
    LM->>Monitor: 发出 LiquidityDataStored 事件
    Monitor->>Monitor: 检测事件并验证数据
    Monitor->>LM: 自动调用 addLiquidityToUniswap()
    LM->>Uniswap: 添加流动性
    LM->>Monitor: 发出 LiquidityAdded 事件
    Monitor->>Monitor: 确认操作完成
```

## 📋 API 接口文档

### 🔍 **监控状态查询**

```http
GET /api/monitor/status
```

**响应示例**:
```json
{
  "success": true,
  "monitor": {
    "isActive": true,
    "isMonitoring": true,
    "startTime": "2024-01-15T10:30:00.000Z",
    "uptime": "2h 15m 30s",
    "eventsProcessed": 156
  },
  "config": {
    "bondingCurveAddress": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    "liquidityManagerAddress": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    "rpcUrl": "http://localhost:8545"
  },
  "account": {
    "hasPrivateKey": true,
    "canExecuteTransactions": true,
    "address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "balance": "9999.95 ETH"
  }
}
```

### 🔧 **手动流动性添加**

```http
POST /api/monitor/manual
Content-Type: application/json

{
  "tokenAddress": "0xcAFEA9d7bc46d79beb6B021c99a46a02443178A2"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "手动流动性添加操作已启动",
  "tokenAddress": "0xcAFEA9d7bc46d79beb6B021c99a46a02443178A2",
  "txHash": "0xabcd1234...",
  "account": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
}
```

### ▶️ **启动监控服务**

```http
POST /api/monitor/start
```

### ⏹️ **停止监控服务**

```http
POST /api/monitor/stop
```

### 🔄 **重启监控服务**

```http
POST /api/monitor/restart
```

## 🛠️ 核心服务详解

### 🤖 **LiquidityMonitor 服务**

```typescript
// 核心监控服务特性
class LiquidityMonitor {
  // 实时事件监听
  private setupEventListeners(): void {
    // 监听代币毕业事件
    this.bondingCurveContract.watchEvent.TokenGraduatedByMarketCap();
    
    // 监听流动性数据存储事件（关键事件）
    this.bondingCurveContract.watchEvent.LiquidityDataStored();
    
    // 监听流动性添加完成事件
    this.liquidityManagerContract.watchEvent.LiquidityAdded();
  }

  // 自动流动性添加
  private async autoAddLiquidity(tokenAddress: string): Promise<void> {
    // 1. 验证私钥配置
    // 2. 检查流动性数据
    // 3. 执行添加流动性交易
    // 4. 等待交易确认
    // 5. 监听完成事件
  }
}
```

### 🔗 **Blockchain 服务**

```typescript
// 区块链交互抽象层
class BlockchainService {
  // 合约读取操作
  async readContract(config: ReadContractConfig): Promise<any> {}
  
  // 合约写入操作  
  async writeContract(config: WriteContractConfig): Promise<string> {}
  
  // 事件查询
  async queryEvents(config: EventQueryConfig): Promise<Event[]> {}
  
  // 批量操作
  async batchCall(calls: ContractCall[]): Promise<any[]> {}
}
```


## 🔧 开发和调试

### 本地开发

```bash
# 启动开发模式（热重载）
npm run dev

# 手动测试API
npm run test:api

# 启动独立监控服务
node start-liquidity-monitor.js
```



