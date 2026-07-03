# snk-tradingview-lib 演进与 K 线迁移方案

日期：2026-06-13

## 1. 背景

当前 0xcafe.fun 前端使用 `lightweight-charts` 展示 Token K 线，现有能力包括：

- 1m、5m、15m、1h 周期切换
- 蜡烛图和成交量
- 十字光标 OHLC 展示
- 5 秒轮询刷新
- 空态、异常态和响应式布局

随着产品向 GMGN 类链上交易终端演进，图表需要逐步承载更多交易和链上信息，例如：

- 当前地址的买入、卖出位置
- 钱包、聪明钱、DEV、KOL 的交易行为
- 当前仓位、平均持仓成本和盈亏
- 止盈止损、挂单和策略线
- Token 创建、毕业等链上事件
- 指标、用户绘图和图表布局保存

`lightweight-charts` 可以通过 series markers 和自定义 primitives 实现买卖点等功能，但如果长期目标是完整交易终端，继续在其上构建大量交互和业务覆盖物的成本会逐步增加。

因此建议逐步将图表基础设施迁移到基于 TradingView Charting Library v28.3 的 `snk-tradingview-lib`。

## 2. 决策结论

建议迁移到 `snk-tradingview-lib`，但不应把迁移理解为简单替换一个 npm 包。

更合适的目标是将 `snk-tradingview-lib` 建设为：

> 面向链上交易终端的图表基础设施，负责 Charting Library 生命周期、行情 Datafeed、链上事件覆盖物和宿主框架接入。

迁移应采用并行验证和分阶段替换方式：

1. 先完善 `snk-tradingview-lib` 的核心抽象。
2. 在新图表中对齐当前 K 线能力。
3. 增加地址买卖点等差异化能力。
4. 验证稳定后移除 `lightweight-charts`。

## 3. 当前约束

### 3.1 0xcafe.fun 当前约束

- 后端 `/api/market/:tokenAddress/candles` 仅支持 `resolution=1`。
- 单次 K 线请求范围最多为 7 天。
- 前端负责将 1m K 线聚合为 5m、15m 和 1h。
- 实时更新暂时采用 5 秒 polling。
- 当前没有按钱包地址查询历史成交并用于图表标记的专用接口。

### 3.2 snk-tradingview-lib 当前约束

- 当前 React/Next.js 组件主要负责 Widget 创建和生命周期清理。
- `TradingViewWidgetLike` 暴露能力较少，尚未完整覆盖 shapes、positions、orders 和数据重置能力。
- Datafeed 已支持 `getBars`、`subscribeBars` 和 `unsubscribeBars`，但缺少更完整的配置、缓存和 marks 能力。
- TradingView Charting Library 静态资源约 22 至 24 MB，需要宿主项目同步并部署静态资源。
- Charting Library 属于授权私有资源，生产部署和分发必须处于授权范围内。

## 4. 目标架构

建议将库逐步拆分为以下职责：

```text
@snk-tradingview-lib/core
  ChartController
  TradingView Widget 生命周期
  原生 API 类型和 escape hatch
  preset / theme / feature 配置

@snk-tradingview-lib/datafeed
  TradingView Datafeed 实现
  HTTP 历史数据
  polling / WebSocket 实时更新
  resolution 聚合、分页和缓存

@snk-tradingview-lib/overlays
  钱包买卖点
  聪明钱 / DEV / KOL 标记
  持仓成本线
  Token 生命周期事件

@snk-tradingview-lib/react
  React 组件和 hooks

@snk-tradingview-lib/nextjs
  Next.js Client Component

@snk-tradingview-lib/cli
  TradingView 静态资源同步和版本校验
```

其中 `core`、`datafeed` 和通用 `overlays` 应保持业务无关。具体 API 地址、Token 业务规则、钱包查询逻辑留在 0xcafe.fun 宿主项目中。

## 5. 核心设计

### 5.1 ChartController

当前封装不应只暴露 `setSymbol` 和 `setResolution`。建议新增稳定的 `ChartController`，覆盖常用能力，同时保留访问原生 TradingView API 的入口。

```ts
interface ChartController {
  widget: TradingViewWidgetApi;
  chart(): ChartWidgetApi;

  setSymbol(symbol: string, resolution?: string): Promise<void>;
  setTheme(theme: TvTheme): Promise<void>;
  resetData(): void;

  setExecutions(items: ExecutionMarker[]): void;
  setEvents(items: ChartEventMarker[]): void;
  setPosition(position: PositionOverlay | null): void;

  destroy(): void;
}
```

设计原则：

- 高频需求提供稳定的高级 API。
- 高级业务可以通过 `controller.chart()` 使用原始 TradingView API。
- 不重复封装 TradingView 的全部 API。
- 所有更新操作应幂等，避免刷新时生成重复对象。
- Controller 负责资源生命周期和清理。

### 5.2 Datafeed

建议将当前 `MarketDataAdapter` 扩展为更完整的适配协议：

```ts
interface MarketDataAdapter {
  getConfiguration(): DatafeedConfiguration;
  resolveSymbol(symbol: string): Promise<SymbolInfo>;
  getBars(input: GetBarsInput): Promise<GetBarsResult>;

  subscribeBars?(
    input: SubscribeBarsInput,
    callbacks: {
      onBar(bar: DatafeedBar): void;
      onResetCache(): void;
    },
  ): Unsubscribe;

  getMarks?(input: MarksInput): Promise<ChartMark[]>;
  getTimescaleMarks?(input: MarksInput): Promise<TimescaleMark[]>;
}
```

Datafeed 层需要负责：

- TradingView 秒级查询参数与毫秒级 bar 时间转换。
- 根据后端限制分段请求超过 7 天的数据。
- 支持 `countBack` 并正确返回历史数据。
- 1m 数据向其他周期聚合。
- 历史请求缓存和并发请求去重。
- polling 或 WebSocket 订阅。
- symbol 或网络变化时取消旧请求。
- 必要时触发 `onResetCache`。

首版可以继续使用 5 秒 polling，后续切换 WebSocket 时保持组件 API 不变。

### 5.3 Overlay Manager

业务组件不应直接散落调用 `createExecutionShape`、`createPositionLine` 等原生 API。建议建立统一 Overlay Manager。

```ts
interface ExecutionMarker {
  id: string;
  time: number;
  price: number;
  side: 'buy' | 'sell';
  wallet?: string;
  quantity?: string;
  label?: string;
  color?: string;
}

interface PositionOverlay {
  averagePrice: number;
  quantity: string;
  pnlPercent?: number;
}

interface ChartEventMarker {
  id: string;
  time: number;
  kind: 'token-created' | 'graduated' | 'dev-sell' | 'smart-money';
  label: string;
}
```

推荐映射方式：

| 业务对象 | TradingView 能力 |
| --- | --- |
| 钱包买卖记录 | `createExecutionShape` |
| 当前仓位和平均成本 | `createPositionLine` |
| 挂单、止盈止损 | `createOrderLine` |
| Token、DEV、聪明钱事件 | `getMarks`、`getTimescaleMarks` 或 `createShape` |

Overlay Manager 应根据稳定 ID 对对象执行 diff，只新增、更新或删除发生变化的对象，避免每次刷新清空重画。

### 5.4 React API

简单场景可以继续使用声明式组件：

```tsx
<TradingViewChart
  symbol={tokenAddress}
  datafeed={datafeed}
  executions={walletTrades}
  position={position}
  onReady={setController}
/>
```

复杂交易页面建议使用 Hook 和 Controller：

```tsx
const { controller, ready } = useTradingViewChart(options);

useEffect(() => {
  if (!ready) {
    return;
  }

  controller.setExecutions(walletTrades);
  controller.setPosition(currentPosition);
}, [controller, ready, walletTrades, currentPosition]);
```

避免将所有复杂功能都转换为不断增长的组件 props。

## 6. 分阶段路线

### v0.2：具备替换当前 K 线的能力

目标：新图表能够完整替换当前 `lightweight-charts` 实现，但暂不加入复杂链上标记。

主要工作：

- 新增 `ChartController`。
- 补充原生 Widget 和 Chart API 类型。
- 完善 Datafeed 周期配置、分段查询、聚合和 polling。
- 支持价格精度、成交量、深色主题和空态。
- 支持 symbol、resolution、theme 更新。
- 验证 Next.js 生命周期、路由切换和移动端。
- 提供与 0xcafe.fun 数据接口接入的完整示例。

验收标准：

- 支持 1m、5m、15m 和 1h。
- 页面打开、Token 切换和交易后刷新正常。
- 首笔交易能够显示第一根 K 线。
- 轮询不会产生重复请求或泄漏 timer。
- 当前 K 线核心体验没有明显回退。

### v0.3：实现 GMGN 类核心图表体验

目标：让图表不仅显示行情，还能解释链上交易行为。

主要工作：

- 钱包买入、卖出 execution markers。
- 当前连接地址的成交筛选。
- 聪明钱、DEV、KOL 标记和显示开关。
- 当前持仓、平均成本线和 PnL 展示。
- Token 创建、毕业等事件标记。
- Overlay Manager 的 diff、清理和测试。

验收标准：

- 同一批数据重复更新不会产生重复标记。
- 钱包或 Token 切换后旧标记被正确清理。
- 大量交易标记下图表仍可流畅缩放和拖动。
- 用户可以按标记类型控制显示和隐藏。

### v0.4：交易终端能力

目标：让图表参与交易操作，而不仅是信息展示。

主要工作：

- 止盈、止损、挂单和策略线。
- WebSocket 或 SSE 实时行情。
- 图表设置和布局保存。
- 指标模板。
- 自定义工具栏和业务按钮。
- 标记交互与交易面板联动。

### v1.0：稳定与工程化

目标：形成可在多个交易项目中复用的稳定私有库。

主要工作：

- 稳定公共 API。
- 完整示例和升级指南。
- 单元测试、集成测试和浏览器测试。
- TradingView 静态资源版本校验。
- CLI 同步安全检查。
- 性能基准和错误监控。
- 授权和部署检查清单。

## 7. 0xcafe.fun 迁移策略

建议采用旁路接入，不立即删除当前图表。

### 阶段一：基础设施准备

- 在 `snk-tradingview-lib` 中完成 v0.2 核心能力。
- 在 0xcafe.fun 中新增 `marketDatafeed` 适配器。
- 将 TradingView 静态资源同步到 `frontend/public/tradingview`。
- 保留现有 `lightweight-charts` 组件作为回退。

### 阶段二：功能对齐

- 新增基于 `snk-tradingview-lib` 的图表组件。
- 使用开发开关在两套图表之间切换。
- 对比首屏加载、周期切换、实时刷新、空态和异常态。
- 对比桌面端和移动端表现。

### 阶段三：差异化能力

- 新增钱包成交查询接口。
- 展示当前地址买卖点和平均成本线。
- 增加聪明钱、DEV 等可选标记。
- 验证标记性能和交互。

### 阶段四：正式替换

- 默认启用新图表。
- 保留短期回退开关。
- 稳定运行后移除 `lightweight-charts` 和旧组件。

## 8. 需要新增的业务接口

为了支持地址买卖位置，除了 K 线接口外，建议增加类似接口：

```text
GET /api/market/:tokenAddress/trades
  ?walletAddress=0x...
  &from=...
  &to=...
```

返回结构建议包含：

```ts
interface WalletTrade {
  id: string;
  transactionHash: string;
  walletAddress: string;
  tokenAddress: string;
  side: 'buy' | 'sell';
  timestamp: number;
  price: string;
  tokenAmount: string;
  quoteAmount: string;
}
```

后续可以扩展钱包分类和标签：

- 当前用户
- DEV
- insider
- smart money
- KOL
- tracked wallet

## 9. 风险与控制

| 风险 | 控制方式 |
| --- | --- |
| TradingView 私有资源授权 | 上线前确认生产部署和分发处于授权范围内 |
| 静态资源较大 | CDN、长期缓存、压缩和版本化路径 |
| Datafeed 行为复杂 | 建立独立测试和官方行为场景验证 |
| Overlay 数量过多影响性能 | 可视区加载、聚合、筛选和数量限制 |
| 迁移导致现有 K 线回退 | 双实现开关和逐项验收 |
| 库过度封装后难以使用原生能力 | 保留稳定的原生 API escape hatch |
| 业务逻辑污染通用库 | 业务查询和分类规则留在宿主项目 |

## 10. 推荐近期任务

建议下一阶段优先只做以下三项：

1. 为 `snk-tradingview-lib` 新增稳定的 `ChartController` 和原生 API escape hatch。
2. 将 Datafeed 补充到能够可靠承接 0xcafe.fun 当前 K 线需求。
3. 建立幂等的 `OverlayManager`，先实现钱包 execution markers 和平均成本线。

这三层稳定后，聪明钱标记、DEV 行为、仓位线、止盈止损和其他 GMGN 类能力都可以作为普通功能持续迭代，而不需要反复修改底层图表接入方式。

