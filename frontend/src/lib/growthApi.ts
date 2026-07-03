export type LeaderboardType = 'new' | 'trending' | 'near-graduation' | 'graduated';

export interface GrowthMarket {
  token_address: string;
  market_address: string;
  name: string | null;
  symbol: string | null;
  creator_address: string | null;
  stage: string;
  independent_traders: number;
  trade_count: number;
  active_hours: number;
  creator_self_trades: number;
  trend_score: number;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL?.replace(/\/$/, '') ||
  'http://localhost:9000';

export async function getGrowthLeaderboard(type: LeaderboardType): Promise<GrowthMarket[]> {
  const response = await fetch(`${API_BASE_URL}/api/growth/leaderboards/${type}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Leaderboard request failed: ${response.status}`);
  const payload = await response.json() as { markets: GrowthMarket[] };
  return payload.markets;
}
