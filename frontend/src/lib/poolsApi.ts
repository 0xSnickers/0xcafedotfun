import { formatEther, formatUnits } from 'viem';

export interface PoolListItem {
  tokenAddress: string;
  marketAddress: string;
  name: string | null;
  symbol: string | null;
  tokenImage: string | null;
  description: string | null;
  stage: 'graduated_pending_liquidity' | 'dex_live';
  pairAddress: string | null;
  quoteTokenAddress: string | null;
  latestPrice: number | null;
  tokenReserve: number | null;
  quoteReserve: number | null;
  liquidityQuote: number | null;
  priceChangePercent24h: number | null;
  volume24h: number;
  volume24hComplete: boolean;
  tradeCount24h: number;
  graduatedAt: number | null;
  dexLiveAt: number | null;
  reservesUpdatedAt: number | null;
  lastTradeAt: number | null;
}

interface RawPoolListItem extends Omit<PoolListItem, 'latestPrice' | 'tokenReserve' | 'quoteReserve' | 'liquidityQuote' | 'priceChangePercent24h' | 'volume24h'> {
  latestPrice: string | null;
  tokenReserve: string | null;
  quoteReserve: string | null;
  liquidityQuote: string | null;
  priceChangePercent24h: string | null;
  volume24h: string;
}

interface PoolsResponse {
  pools: RawPoolListItem[];
}

export interface PoolReserveSnapshotItem {
  tokenAddress: string;
  marketAddress: string;
  pairAddress: string;
  quoteTokenAddress: string | null;
  tokenReserve: number;
  quoteReserve: number;
  liquidityQuote: number;
  blockNumber: string;
  transactionHash: string;
  timestamp: number;
}

interface RawPoolReserveSnapshotItem extends Omit<PoolReserveSnapshotItem, 'tokenReserve' | 'quoteReserve' | 'liquidityQuote'> {
  tokenReserve: string;
  quoteReserve: string;
  liquidityQuote: string;
}

interface PoolReserveSnapshotsResponse {
  snapshots: RawPoolReserveSnapshotItem[];
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL?.replace(/\/$/, '') ||
  'http://localhost:9000';

const PRICE_CHANGE_PERCENT_SCALE = 1_000_000;

function parseRawEthAmount(value: string | null): number {
  if (value === null) {
    return 0;
  }
  try {
    return Number(formatEther(BigInt(value)));
  } catch {
    return 0;
  }
}

function parseRawPrice(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  try {
    return Number(formatUnits(BigInt(value), 18));
  } catch {
    return null;
  }
}

function parsePercent(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / PRICE_CHANGE_PERCENT_SCALE : null;
}

export async function getPools(options?: {
  limit?: number;
  signal?: AbortSignal;
}): Promise<PoolListItem[]> {
  const query = new URLSearchParams();
  if (options?.limit !== undefined) {
    query.set('limit', String(options.limit));
  }

  const response = await fetch(
    `${API_BASE_URL}/api/pools${query.size > 0 ? `?${query.toString()}` : ''}`,
    { signal: options?.signal, cache: 'no-store' },
  );

  if (!response.ok) {
    throw new Error(`Pools API request failed: ${response.status}`);
  }

  const payload = await response.json() as PoolsResponse;
  return payload.pools.map((pool) => ({
    ...pool,
    latestPrice: parseRawPrice(pool.latestPrice),
    tokenReserve: parseRawPrice(pool.tokenReserve),
    quoteReserve: pool.quoteReserve === null ? null : parseRawEthAmount(pool.quoteReserve),
    liquidityQuote: pool.liquidityQuote === null ? null : parseRawEthAmount(pool.liquidityQuote),
    priceChangePercent24h: parsePercent(pool.priceChangePercent24h),
    volume24h: parseRawEthAmount(pool.volume24h),
  }));
}

export async function getPoolReserveSnapshots(
  tokenAddress: string,
  options?: {
    from?: number;
    to?: number;
    limit?: number;
    signal?: AbortSignal;
  },
): Promise<PoolReserveSnapshotItem[]> {
  const query = new URLSearchParams();
  if (options?.from !== undefined) {
    query.set('from', String(options.from));
  }
  if (options?.to !== undefined) {
    query.set('to', String(options.to));
  }
  if (options?.limit !== undefined) {
    query.set('limit', String(options.limit));
  }

  const response = await fetch(
    `${API_BASE_URL}/api/pools/${tokenAddress}/reserves${query.size > 0 ? `?${query.toString()}` : ''}`,
    { signal: options?.signal, cache: 'no-store' },
  );

  if (!response.ok) {
    throw new Error(`Pool reserves API request failed: ${response.status}`);
  }

  const payload = await response.json() as PoolReserveSnapshotsResponse;
  return payload.snapshots.map((snapshot) => ({
    ...snapshot,
    tokenReserve: parseRawPrice(snapshot.tokenReserve) ?? 0,
    quoteReserve: parseRawEthAmount(snapshot.quoteReserve),
    liquidityQuote: parseRawEthAmount(snapshot.liquidityQuote),
  }));
}
