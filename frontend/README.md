# 0xcafe.fun Frontend

0xcafe.fun 前端是一个基于 Next.js App Router 的 Web3 DApp，负责代币创建、市场浏览、Bonding Curve 交易和毕业状态展示。当前项目已经从早期单文件实现逐步演进为按页面、组件、Hook、Provider 和链上配置分层的结构，本文档作为项目入口说明当前技术栈、目录组织和协作规范入口。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- Ant Design 5
- Tailwind CSS 4
- wagmi
- RainbowKit
- ethers
- TanStack Query

## 运行要求

- Node.js >= 20

## 本地开发

```bash
npm install
cp env.example .env.local
npm run dev
```

默认启动后访问本地 Next.js 开发服务。

## 文档分工

在开始修改代码或整理结构前，建议按以下顺序阅读：

- [AGENTS.md](./AGENTS.md)：当前 frontend 的主规范，定义目录约定、开发原则、页面/组件/Hook/Provider 边界
- [CLAUDE.md](./CLAUDE.md)：Claude Code / AI 协作补充规则
- [README.md](./README.md)：项目概览、命令和目录总览

如果未来补充更细的开发流程或架构图，再拆分为 `GUIDE.md` / `MERMAID.md` 等文档；本轮以这三份文档作为基线。

## 常用命令

- `npm run dev`：本地开发
- `npm run build`：生产构建
- `npm run start`：启动生产构建
- `npm run lint`：代码检查

## 目录说明

```text
frontend/
├── public/                          # 静态资源
├── src/
│   ├── app/                         # App Router 路由、全局布局、页面入口
│   ├── components/                  # 跨页面复用组件与业务容器
│   │   ├── charts/                  # 图表组件
│   │   └── feature/                 # 按功能域拆分的子组件
│   ├── config/                      # wagmi、合约地址、ABI 等配置
│   ├── hooks/                       # 页面级与业务级 Hook
│   │   └── bondingCurve/            # Bonding Curve 报价、交易、工具拆分
│   ├── lib/                         # 非 React 复用逻辑，如市场 API、轮询、格式化
│   ├── providers/                   # 应用级或功能级 Provider
│   └── utils/                       # 更底层的纯函数工具
├── package.json
├── README.md
├── AGENTS.md
└── CLAUDE.md
```

## 当前项目架构

### 路由层

当前核心页面位于：

- `src/app/page.tsx`：首页
- `src/app/create/page.tsx`：代币创建页
- `src/app/trade/page.tsx`：市场列表页
- `src/app/trade/[tokenAddress]/page.tsx`：单代币交易详情页
- `src/app/layout.tsx`：根布局、全局 metadata、全局 providers 和调试挂件

路由层负责页面壳、路由参数、页面级组合和少量入口逻辑；复杂交互应优先下沉到组件或 Hook。

### 组件层

组件按三类理解：

- `src/components/`：跨页面复用组件或已经被多个页面共享的业务容器
  - 例如：`UnifiedHeader.tsx`、`WalletInfo.tsx`、`ETHTradePanel.tsx`
- `src/components/feature/<domain>/`：单个功能域内部的子组件
  - 当前已有：`feature/trade/TradePanelForm.tsx`、`feature/trade/TradeConfirmModal.tsx`
- `src/components/charts/`：图表类组件
  - 当前已有：`charts/TradingViewChart.tsx`

当前项目仍保留一些历史组件在 `src/components/` 根下，这是可接受的现状；后续新增子组件应优先落到 `feature/create`、`feature/market`、`feature/trade` 等功能目录。

在文件规模上，当前建议把 500 行视为拆分警戒线，而不是硬性失败规则：

- `page.tsx` 尽量控制在 150–300 行内
- 复杂容器组件尽量控制在 300–400 行内
- 接近 500 行时应默认评估是否拆出子组件、Hook 或局部模块
- 只有少数高内聚、阅读负担仍然可控的文件才允许作为例外保留

### Hook 与链上逻辑

链上读取、报价和交易逻辑主要集中在 `src/hooks/`：

- `src/hooks/useTokenList.ts`：市场列表读取与轮询
- `src/hooks/useTokenInfo.ts` / `useTokenBalance.ts` / `usePlatformStats.ts`：页面级数据读取
- `src/hooks/useBondingCurve.ts`：Bonding Curve 聚合入口
- `src/hooks/bondingCurve/usePricing.ts`：报价与曲线读取
- `src/hooks/bondingCurve/useTrading.ts`：授权、买卖、毕业状态等交易相关逻辑
- `src/hooks/bondingCurve/utils.ts`：Bonding Curve 格式化与计算工具

当前推荐方向是继续把链上读写和格式化逻辑沉到 Hook / utils，而不是反复散落在页面组件里。

### Provider 与应用基础设施

应用级 Provider 统一在：

- `src/providers/AppProviders.tsx`
- `src/app/providers.tsx`

目前这里集中承载：

- WagmiProvider
- QueryClientProvider
- RainbowKitProvider
- Antd Registry / ConfigProvider / App

不要在页面里重复创建这些基础设施；若后续出现功能级共享上下文，再考虑在 `src/providers/` 补充 feature provider。

### 配置与工具层

- `src/config/`：链、ABI、合约地址和 wagmi 配置
- `src/lib/`：市场 API、轮询和格式化等非 React 逻辑
- `src/utils/`：底层纯函数工具

推荐把可复用格式化统一收敛到 `src/lib/formatters/market.ts`，把 Bonding Curve 特定数值工具统一收敛到 `src/hooks/bondingCurve/utils.ts`。

## 当前已知注意事项

- 当前项目是单语言路由，不采用模板项目中的 `[locale]` 结构。
- 当前项目没有 `src/services/api`、`src/store`、`src/i18n`、`src/components/ui` 等模板层，不应在规范中假定它们已经存在。
- `npm run build` 当前可以完成构建，但会出现一条 `indexedDB is not defined` 的构建期日志；现阶段它不是阻塞错误，但后续如果继续增强 SSR / 静态构建能力，建议单独排查。