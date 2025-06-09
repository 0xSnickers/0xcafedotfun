# 🚀 0xcafe.fun - MEME 代币发射平台

一个完整的去中心化 MEME 代币创造与交易平台，采用 **Bonding Curve** 机制实现公平价格发现和自动毕业系统。

![Platform Preview](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Solidity](https://img.shields.io/badge/Solidity-0.8.29-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)

## ✨ 核心特性

### 🎯 **Bonding Curve 交易机制**
- **动态定价算法**: 价格随购买量增长，防止操控
- **公平价格发现**: 早期支持者获得更低价格
- **自动流动性**: 无需人工做市，算法自动提供流动性

### 🎓 **自动毕业系统**
- **市值毕业门槛**: 达到 10 ETH 市值自动毕业
- **DEX 迁移**: 毕业后自动迁移到去中心化交易所
- **永久流动性**: 毕业后流动性永久锁定，防止 Rug Pull

### 🌟 **Vanity 地址生成**
- **个性化地址**: 生成以 "cafe" 开头的合约地址
- **CREATE2 技术**: 预计算地址，确保唯一性
- **高速生成**: 本地算法，平均 10,000+ 次/秒计算速度

### 💰 **费用分配机制**
- **平台费用**: 2% 交易手续费
- **创建者分成**: 3% 交易收益分成
- **可持续发展**: 为平台和创建者提供持续收益

## 🏗️ 项目架构

```
0xcafe.fun/
├── 📁 contracts/              # 智能合约
│   ├── MemeToken.sol         # ERC20 代币合约
│   ├── MemeFactory.sol       # CREATE2 工厂合约
│   ├── MemePlatform.sol      # 平台主合约
│   └── BondingCurve.sol      # 交易算法合约
├── 📁 frontend/              # Web 应用
│   ├── src/app/              # Next.js 14 页面
│   ├── src/components/       # UI 组件
│   ├── src/hooks/           # React Hooks
│   └── src/config/          # 配置文件
├── 📁 scripts/              # 部署脚本
└── 📁 test/                 # 测试文件
```
## 🚀 快速开始

### 环境准备

```bash
# 安装 Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 安装 Node.js 依赖
npm install

# 安装前端依赖
cd frontend && npm install
```

### 本地开发

1. **启动本地区块链**:
```bash
npm run start-anvil
```

2. **部署智能合约**:
```bash
npm run deploy:local
```

3. **启动前端应用**:
```bash
cd frontend
npm run dev
```

4. **访问应用**: http://localhost:3000

## 📋 功能清单

### ✅ 已实现功能

#### **🏠 首页 (`/`)**
- 平台概览和统计数据
- 实时更新的交易指标
- 美观的渐变设计和动画效果

#### **🎨 代币创建 (`/create`)**
- **表单验证**: 完整的参数验证和错误提示
- **Vanity 地址**: 一键生成个性化合约地址
- **实时预览**: 费用计算和参数确认
- **交易监控**: 实时跟踪创建状态
- **智能导航**: 创建成功后自动跳转交易页面

#### **📊 交易市场 (`/trade`)**
- **代币分类**: 区分活跃交易和已毕业代币
- **统计面板**: 活跃代币、毕业代币、总数统计
- **搜索功能**: 支持名称、符号、地址搜索
- **价格信息**: 实时显示当前价格和市值
- **视觉差异**: 毕业代币金色主题特殊标识

#### **💹 个人交易页面 (`/trade/[tokenAddress]`)**
- **完整信息**: 代币详情、价格、市值、持有者
- **毕业进度**: 可视化进度条和里程碑
- **交易面板**: 买入/卖出界面，支持 ETH ⇄ Token
- **图表占位**: 预留 TradingView 图表位置
- **实时刷新**: 交易后自动更新数据

#### **🔗 钱包集成**
- **RainbowKit**: 支持主流以太坊钱包
- **多链支持**: 主网、测试网、本地网络
- **实时余额**: 自动显示 ETH 和代币余额
- **网络检测**: 自动切换和提示网络状态

#### **🎨 UI/UX 设计**
- **统一主题**: 现代化暗黑主题设计
- **响应式**: 完美适配移动端和桌面端
- **统一导航**: `UnifiedHeader` 组件统一导航体验
- **加载状态**: 骨架屏和加载动画
- **错误处理**: 友好的错误提示和引导

### 🚧 开发中功能

- [ ] **TradingView 图表集成**
- [ ] **代币评论和社交功能**
- [ ] **高级搜索和筛选**
- [ ] **移动端 App**
- [ ] **多语言支持**

## 🛠️ 技术栈

### 智能合约
- **Solidity 0.8.19**: 最新稳定版本
- **Foundry**: 开发和测试框架
- **OpenZeppelin**: 安全的合约库

### 前端应用
- **Next.js 14**: React 全栈框架 (App Router)
- **TypeScript**: 类型安全开发
- **RainbowKit + wagmi**: Web3 钱包连接
- **Ant Design**: 现代化 UI 组件库
- **Tailwind CSS**: 原子化 CSS 框架

### 开发工具
- **Viem**: 轻量级以太坊库
- **React Query**: 数据获取和缓存
- **ESLint + Prettier**: 代码规范和格式化

## 💡 核心算法

### Bonding Curve 定价公式

```solidity
// 价格计算: P = (S/T) * targetPrice
// P: 当前价格, S: 当前供应量, T: 目标供应量
function getCurrentPrice(address token) public view returns (uint256) {
    TokenParams memory params = tokenParams[token];
    uint256 currentSupply = IERC20(token).totalSupply();
    
    if (currentSupply == 0) return params.initialPrice;
    if (currentSupply >= params.targetSupply) return params.targetPrice;
    
    return params.initialPrice + 
           (params.targetPrice - params.initialPrice) * 
           currentSupply / params.targetSupply;
}
```

### CREATE2 地址生成

```typescript
// Vanity 地址生成算法
const generateVanityAddress = async (prefix: string) => {
  const bytecode = await factory.getBytecode(params);
  
  for (let i = 0; i < maxAttempts; i++) {
    const salt = keccak256(randomBytes(32));
    const address = getCreate2Address(factoryAddress, salt, keccak256(bytecode));
    
    if (address.toLowerCase().startsWith(prefix.toLowerCase())) {
      return { address, salt, attempts: i + 1 };
    }
  }
};
```

## 🔐 安全特性

- ✅ **重入攻击防护**: ReentrancyGuard 保护
- ✅ **权限控制**: Ownable 和自定义权限管理
- ✅ **参数验证**: 多层验证防止恶意输入
- ✅ **费用保护**: 自动退还多余费用
- ✅ **地址验证**: CREATE2 地址匹配确认
- ✅ **毕业检查**: 防止已毕业代币重复交易

## 📈 使用统计

| 指标 | 数值 |
|------|------|
| 已创建代币 | 动态统计 |
| 总交易量 | 实时更新 |
| 毕业代币数 | 自动统计 |
| 活跃用户 | 链上数据 |
| 成功率 | 计算得出 |

## 🌍 网络支持

- **以太坊主网** (chainId: 1)
- **Sepolia 测试网** (chainId: 11155111)
- **本地开发网络** (chainId: 31337)

## 📱 用户指南

### 创建代币流程

1. **连接钱包** → 选择支持的钱包连接
2. **填写信息** → 代币名称、符号、描述等
3. **生成地址** → 可选生成 cafe 开头地址
4. **确认创建** → 检查费用和参数
5. **等待确认** → 交易打包和确认
6. **开始交易** → 自动跳转到交易页面

### 交易代币流程

1. **浏览市场** → 查看活跃和毕业代币
2. **选择代币** → 进入具体交易页面
3. **查看详情** → 价格、市值、毕业进度
4. **执行交易** → 买入或卖出代币
5. **实时更新** → 自动刷新余额和价格

## 🤝 贡献指南

我们欢迎社区贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

### 开发流程

```bash
# 1. Fork 项目
git clone https://github.com/your-username/0xcafedotfun.git

# 2. 创建功能分支
git checkout -b feature/amazing-feature

# 3. 提交更改
git commit -m "feat: add amazing feature"

# 4. 推送到分支
git push origin feature/amazing-feature

# 5. 创建 Pull Request
```

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [OpenZeppelin](https://openzeppelin.com/) - 安全的智能合约库
- [Foundry](https://github.com/foundry-rs/foundry) - 智能合约开发框架
- [Next.js](https://nextjs.org/) - React 全栈框架
- [RainbowKit](https://www.rainbowkit.com/) - Web3 钱包连接
- [Ant Design](https://ant.design/) - UI 组件库

---

**🎉 0xcafe.fun - 让每个人都能轻松创造下一个爆款 MEME 代币！**

[![Twitter](https://img.shields.io/badge/Twitter-@0xcafefun-1DA1F2?style=flat&logo=twitter&logoColor=white)](https://twitter.com/0xcafefun)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-7289DA?style=flat&logo=discord&logoColor=white)](https://discord.gg/0xcafefun)
[![GitHub](https://img.shields.io/badge/GitHub-Star%20Repository-black?style=flat&logo=github)](https://github.com/0xcafedotfun)
