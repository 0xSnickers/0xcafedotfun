export interface GrowthTradeFacts {
  grossQuoteRaw: bigint
  traderAddress: string
  creatorAddress: string | null
  side: 'buy' | 'sell'
  secondsSincePreviousOppositeTrade: number | null
  distinctTradingDays: number
  distinctMarkets: number
}

export interface GrowthScore {
  points: number
  riskFlags: string[]
  eligible: boolean
}

export const MIN_EFFECTIVE_TRADE_RAW = 1_000_000_000_000_000n
export const REWARD_DELAY_SECONDS = 24 * 60 * 60

export function scoreGrowthTrade(facts: GrowthTradeFacts): GrowthScore {
  const riskFlags: string[] = []
  if (facts.grossQuoteRaw < MIN_EFFECTIVE_TRADE_RAW) riskFlags.push('dust_trade')
  if (
    facts.creatorAddress !== null &&
    facts.traderAddress.toLowerCase() === facts.creatorAddress.toLowerCase()
  ) {
    riskFlags.push('creator_self_trade')
  }
  if (
    facts.secondsSincePreviousOppositeTrade !== null &&
    facts.secondsSincePreviousOppositeTrade < 10 * 60
  ) {
    riskFlags.push('rapid_round_trip')
  }

  if (riskFlags.length > 0) {
    return { points: 0, riskFlags, eligible: false }
  }

  const participation = 10
  const dayBonus = Math.min(facts.distinctTradingDays, 7) * 2
  const diversityBonus = Math.min(facts.distinctMarkets, 5) * 3
  return {
    points: participation + dayBonus + diversityBonus,
    riskFlags,
    eligible: true,
  }
}
