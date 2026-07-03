export const MARKET_STAGE = {
  ACTIVE: 0,
  GRADUATION_PENDING: 1,
  LIQUIDITY_PENDING: 2,
  DEX_LIVE: 3,
} as const;

export type MarketStageValue = typeof MARKET_STAGE[keyof typeof MARKET_STAGE];

export function isGraduationPendingStage(stage: number) {
  return stage === MARKET_STAGE.GRADUATION_PENDING || stage === MARKET_STAGE.LIQUIDITY_PENDING;
}
