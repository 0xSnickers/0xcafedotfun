# AGENTS.md

本文件定义 `frontend` 中 AI Agent 与开发者的默认执行规范。开始任何修改前，先阅读本文件，再按需查阅 `README.md` 与 `CLAUDE.md`。

## 文档分工

- `README.md`：项目概览、技术栈、常用命令、目录与架构总览。
- `AGENTS.md`：当前 frontend 的主规范，定义目录约定、开发原则和实施边界。
- `CLAUDE.md`：Claude Code / AI 协作补充规则。

如果后续需要更细的开发流程或架构图，可以再补 `GUIDE.md` / `MERMAID.md`；在这些文档不存在之前，不要假定项目已经采用模板里的完整文档体系。

## 项目上下文

- 项目类型：Next.js App Router Web3 DApp。
- UI 技术：Ant Design 5 + Tailwind CSS 4。
- Web3 技术：wagmi + RainbowKit + ethers。
- 数据来源：链上读写 + 市场 API / 轮询。
- Provider 基础设施：Wagmi、TanStack Query、RainbowKit、Antd App/Theme 已在应用级统一接入。

## 开发原则

- 先阅读相关文件，再开始修改，不凭空假设目录或实现。
- 保持变更聚焦，不把顺手重构混入当前任务。
- 优先复用现有 Hook、formatter、Provider 和配置模块。
- 不新增未被要求的新状态库、请求库、UI 库或 Web3 库。
- 不把链上读写逻辑和数值格式化散落在页面中。
- 不在文档中描述当前项目并不存在的层，如 `src/services/api`、`src/store`、`src/i18n`、`src/components/ui`。
- 不因为整理规范而顺手移动大量目录或批量重命名已有组件。

## 目录约定

- `src/app`：App Router 路由、布局、页面入口。
- `src/components`：跨页面复用组件与业务容器。
- `src/components/feature/<domain>`：按功能域拆分的子组件。
- `src/components/charts`：图表类组件。
- `src/providers`：应用级或功能级 Provider。
- `src/hooks`：页面级与业务级 Hook。
- `src/hooks/bondingCurve`：Bonding Curve 报价、交易和工具模块。
- `src/config`：链、合约地址、ABI、wagmi 配置。
- `src/lib`：非 React 复用逻辑，如市场 API、轮询、格式化。
- `src/utils`：底层纯函数工具。

## 页面开发要求

- `src/app/*/page.tsx` 只负责路由级组合、页面壳、路由参数和页面入口逻辑。
- 复杂交易表单、列表项、详情面板、局部弹窗等交互优先拆到 `src/components` 或 `src/components/feature/<domain>`。
- 当前项目是单语言路由，不引入模板中的 `[locale]` 页面约定。
- `src/app/layout.tsx` 只承载全局样式、metadata、providers 和全局调试挂件。
- 页面级轮询、跳转和页面聚合逻辑可以保留在页面或页面级 Hook 中，但不应把大型业务 JSX 与链上逻辑长期耦合在同一个 `page.tsx` 里。

## 组件开发要求

- 共享应用组件放在 `src/components/`。
- 功能域内部子组件优先放在 `src/components/feature/<domain>/`。
- 图表类组件放在 `src/components/charts/`。
- props 必须显式声明类型。
- 若一个组件只服务于某个功能模块，优先不要提升到 `src/components/` 根目录。
- 当一个大组件开始出现多个弹窗、表单段、概览卡片或局部列表时，应优先拆子组件，而不是继续在单文件内堆积。

## 文件规模约定

- 不把“所有页面和组件都必须小于 500 行”作为硬性规则。
- 500 行是拆分警戒线，不是强制失败线。
- `page.tsx` 尽量控制在 150–300 行内。
- 复杂容器组件尽量控制在 300–400 行内。
- 当页面或组件接近 500 行时，应默认评估是否拆出子组件、Hook、局部弹窗、表单段或展示模块。
- 只有在逻辑高度内聚、拆分后反而增加理解成本时，才保留少量例外文件。

## Hook 与链上逻辑约定

- 页面不要直接大量堆积 `readContract`、授权、买卖和毕业状态判断细节；能沉到 Hook 的逻辑优先沉到 Hook。
- `src/hooks/useBondingCurve.ts` 作为 Bonding Curve 对外聚合入口，优先复用，不重复在业务组件里拼装同类逻辑。
- `src/hooks/bondingCurve/usePricing.ts` 负责报价和读取。
- `src/hooks/bondingCurve/useTrading.ts` 负责交易动作、授权和交易相关状态。
- `src/hooks/bondingCurve/utils.ts` 负责 Bonding Curve 专用数值工具。
- 页面级市场与代币读取逻辑优先放在 `useTokenList.ts`、`useTokenInfo.ts`、`usePlatformStats.ts` 等 Hook 中。

## 格式化、配置与工具约定

- 市场与通用数值格式化优先复用 `src/lib/formatters/market.ts`。
- Bonding Curve 特定格式化与计算优先复用 `src/hooks/bondingCurve/utils.ts`。
- ABI、链 ID、合约地址、wagmi 配置统一维护在 `src/config/*`。
- 非 UI、非 Hook 的复用逻辑放在 `src/lib` 或 `src/utils`，不要塞进页面。
- 如果后续出现更多市场 API 或索引服务逻辑，优先在 `src/lib` 下按领域扩展，而不是直接照搬模板的 `services/api` 结构。

## Provider 约定

- 应用级 Provider 统一收敛在 `src/providers/AppProviders.tsx` 和 `src/app/providers.tsx`。
- 不要在页面或业务组件里重复创建 QueryClient、WagmiProvider、RainbowKitProvider 或 ConfigProvider。
- 只有当多个 Client Component 共享同一组局部上下文时，才考虑新增功能级 Provider。
- 在功能级共享状态还不明显时，继续使用 props 和局部 state，不要过早引入全局状态层。

## 渐进式目录整理规则

当前项目允许保留历史组件在 `src/components/` 根目录，例如：

- `ETHTradePanel.tsx`
- `TokenCard.tsx`
- `ManualLiquidityPanel.tsx`

但从现在开始，新增子组件建议优先按功能域落位：

- 创建页相关：`src/components/feature/create/`
- 市场页相关：`src/components/feature/market/`
- 交易相关：`src/components/feature/trade/`

目标是增量改善结构，而不是一次性迁移所有旧文件。

## 修改后检查

优先运行当前项目真实存在的命令：

```bash
npm run lint
npm run build
```

如果未来补充 `typecheck`、`test`、`format` 等脚本，再同步更新本文件。

如果因为环境限制、任务范围或文档性质没有运行某个命令，需要在回复中明确说明原因。

## Agent 回复要求

完成后请简要说明：

- 修改了哪些文件。
- 运行了哪些检查命令以及结果。
- 哪些检查未运行以及原因。
- 是否有需要人工确认的风险点或后续整理建议。

---

**最后更新**: 2026年6月12日
