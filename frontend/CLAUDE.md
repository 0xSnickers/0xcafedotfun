# CLAUDE.md

本文件用于指导 Claude Code 在 `frontend` 中工作。开始任务前，先阅读 `AGENTS.md`，再按需查阅 `README.md`。

## 文档职责

- `AGENTS.md`：项目前端主规范，定义目录约定、开发原则、页面/组件/Hook/Provider 边界。
- `README.md`：项目概览、命令、目录和架构总览。
- `CLAUDE.md`：Claude Code 的补充执行规则。

Claude Code 不应重复维护一套独立于 `AGENTS.md` 的完整规范；如果两者出现冲突，应优先修正文档口径，再继续执行。

## Claude 工作方式

- 先理解现有实现，再修改代码或文档。
- 保持改动聚焦，不把顺手重构混入当前任务。
- 优先复用已有目录、Hook、Provider、formatter 和配置模块。
- 不引入未被要求的新依赖。
- 不修改与任务无关的文件。
- 如果发现未提交改动，不回滚用户已有工作。

## 文件规模偏好

- 不把 500 行写成绝对限制，而把它视为拆分警戒线。
- `page.tsx` 尽量保持在 150–300 行内。
- 复杂容器组件尽量控制在 300–400 行内。
- 接近 500 行时，优先考虑拆出子组件、Hook 或局部模块，而不是继续把逻辑堆进单文件。
- 如果某个文件虽然偏大但逻辑高度内聚、拆分会明显增加理解成本，可以保留为例外，但需要有明确理由。

## Claude 关注重点

- `src/app/*/page.tsx` 保持轻量，复杂业务优先拆到 `src/components` 或 `src/components/feature/<domain>`。
- 应用级 Provider 统一复用 `src/providers/AppProviders.tsx` 与 `src/app/providers.tsx`。
- 市场与通用数值格式化优先复用 `src/lib/formatters/market.ts`。
- Bonding Curve 相关逻辑优先复用：
  - `src/hooks/useBondingCurve.ts`
  - `src/hooks/bondingCurve/usePricing.ts`
  - `src/hooks/bondingCurve/useTrading.ts`
  - `src/hooks/bondingCurve/utils.ts`
- 新增交易子组件优先放在 `src/components/feature/trade/`；创建页和市场页新增子组件分别优先放在 `src/components/feature/create/` 与 `src/components/feature/market/`。
- 不要在文档或实现中假定项目已经采用模板中的 `[locale]`、`services/api`、`store`、`i18n` 或 `components/ui` 结构。

## 修改后检查

优先运行：

```bash
npm run lint
npm run build
```

如果任务很小、环境不完整或本轮只做文档调整而跳过了某些命令，需要明确说明跳过原因。

## 回复格式

完成后请简要说明：

- 修改内容。
- 检查结果。
- 未运行检查的原因。
- 需要人工确认的风险点。

---

**最后更新**: 2026年6月12日
