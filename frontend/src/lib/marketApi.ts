export interface MarketCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volumeQuoteGrossComplete: boolean;
  visualAnchor?: boolean;
}

export interface MarketTrade {
  id: string;
  side: 'buy' | 'sell';
  source: 'bonding_curve' | 'uniswap_v2';
  marketAddress: string | null;
  trader: string | null;
  executionPrice: number | null;
  markPrice: number;
  tokenAmount: string;
  quoteAmount: string | null;
  quoteAmountGross: string | null;
  quoteAmountNet: string | null;
  creatorFee: string | null;
  platformFee: string | null;
  transactionHash: string;
  timestamp: number;
  confirmed: boolean;
  legacyVolumeSemantics: boolean;
}

export interface MarketConfig {
  tokenAddress: string;
  marketAddress: string;
  factoryAddress: string | null;
  creatorAddress: string | null;
  configVersion: string | null;
  name: string | null;
  symbol: string | null;
  tokenImage: string | null;
  description: string | null;
  stage: 'bonding_curve_live' | 'graduated_pending_liquidity' | 'dex_live';
  pairAddress: string | null;
  platformFeeBps: string;
  creatorFeeBps: string;
  createFee: string;
}

export interface MarketTradesPage {
  trades: MarketTrade[];
  nextCursor: string | null;
}

export interface MarketHolder {
  address: string;
  balance: string;
  firstBuyAt: number | null;
  lastTradeAt: number;
  buyCount: number;
  sellCount: number;
  totalBought: string;
  totalSold: string;
}

export interface MarketSummary {
  latestPrice: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  priceChangePercent1h: string | null;
  priceChangePercent24h: string | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: string;
  volume24hComplete: boolean;
  tradeCount24h: number;
  marketStage: 'bonding_curve_live' | 'graduated_pending_liquidity' | 'dex_live' | null;
  pairAddress: string | null;
  liquidityQuote: string | null;
  lastTradeAt: number | null;
}

export interface MarketListItem {
  tokenAddress: string;
  marketAddress: string;
  creatorAddress: string | null;
  name: string | null;
  symbol: string | null;
  tokenImage: string | null;
  description: string | null;
  stage: 'bonding_curve_live' | 'graduated_pending_liquidity' | 'dex_live';
  pairAddress: string | null;
  currentPrice: string;
  currentMarketCap: string;
  priceChangePercent24h: string | null;
  volume24h: string;
  volume24hComplete: boolean;
  tradeCount24h: number;
  createdAt: number | null;
  lastTradeAt: number | null;
}

const PRICE_CHANGE_PERCENT_SCALE = 1_000_000;

export function parsePriceChangePercent(value: string | null): number | null {
  if (value === null) return null;
  const scaledPercent = Number(value);
  return Number.isFinite(scaledPercent)
    ? scaledPercent / PRICE_CHANGE_PERCENT_SCALE
    : null;
}

interface TradingViewCandlesResponse {
  s: 'ok' | 'no_data' | 'error';
  t?: number[];
  o?: string[];
  h?: string[];
  l?: string[];
  c?: string[];
  v?: string[];
  volumeQuoteGrossComplete?: boolean[];
  visualAnchor?: {
    time: number;
    price: string;
  } | null;
  errmsg?: string;
}

interface MarketTradesResponse {
  trades: Array<{
    id: string;
    side: 'buy' | 'sell';
    source: 'bonding_curve' | 'uniswap_v2';
    marketAddress: string | null;
    trader: string | null;
    executionPrice: string | null;
    markPrice: string;
    tokenAmount: string;
    quoteAmount: string | null;
    quoteAmountGross: string | null;
    quoteAmountNet: string | null;
    creatorFee: string | null;
    platformFee: string | null;
    transactionHash: string;
    timestamp: number;
    confirmed: boolean;
    legacyVolumeSemantics: boolean;
  }>;
  nextCursor: string | null;
}

interface MarketHoldersResponse {
  holders: MarketHolder[];
}

export async function getMarketConfig(
  tokenAddress: string,
  signal?: AbortSignal,
): Promise<MarketConfig> {
  const response = await fetch(
    `${API_BASE_URL}/api/market/${tokenAddress}/config`,
    { signal, cache: 'no-store' },
  );
  if (!response.ok) {
    throw new Error(`Market config request failed: ${response.status}`);
  }
  return parseMarketConfigPayload(await response.json());
}

export async function finalizeGraduation(
  tokenAddress: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/monitor/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenAddress }),
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      details?: string;
    };
    throw new Error(payload.details || payload.error || `Finalize request failed: ${response.status}`);
  }
}

interface MarketSummaryResponse {
  latestPrice: string | null;
  priceChange1h: string | null;
  priceChange24h: string | null;
  priceChangePercent1h: string | null;
  priceChangePercent24h: string | null;
  high24h: string | null;
  low24h: string | null;
  volume24h: string;
  volume24hComplete: boolean;
  tradeCount24h: number;
  marketStage: 'bonding_curve_live' | 'graduated_pending_liquidity' | 'dex_live' | null;
  pairAddress: string | null;
  liquidityQuote: string | null;
  lastTradeAt: number | null;
}

interface ErrorResponse {
  error?: string;
  errmsg?: string;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL?.replace(/\/$/, '') ||
  'http://localhost:9000';

type JsonRecord = Record<string, unknown>;

const MARKET_STAGES = new Set([
  'bonding_curve_live',
  'graduated_pending_liquidity',
  'dex_live',
]);

function assertRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function assertNullableString(value: unknown, label: string): string | null {
  return value === null ? null : assertString(value, label);
}

function assertNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function assertNullableNumber(value: unknown, label: string): number | null {
  return value === null ? null : assertNumber(value, label);
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function assertStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be a string array`);
  }
  return value;
}

function assertNumberArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new Error(`${label} must be a finite number array`);
  }
  return value;
}

function assertBooleanArray(value: unknown, label: string): boolean[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'boolean')) {
    throw new Error(`${label} must be a boolean array`);
  }
  return value;
}

function assertMarketStage(
  value: unknown,
  label: string,
): 'bonding_curve_live' | 'graduated_pending_liquidity' | 'dex_live' {
  if (typeof value !== 'string' || !MARKET_STAGES.has(value)) {
    throw new Error(`${label} must be a known market stage`);
  }
  return value as 'bonding_curve_live' | 'graduated_pending_liquidity' | 'dex_live';
}

function assertNullableMarketStage(value: unknown, label: string): MarketSummary['marketStage'] {
  return value === null ? null : assertMarketStage(value, label);
}

function parseMarketConfigPayload(value: unknown): MarketConfig {
  const payload = assertRecord(value, 'Market config response');
  return {
    tokenAddress: assertString(payload.tokenAddress, 'tokenAddress'),
    marketAddress: assertString(payload.marketAddress, 'marketAddress'),
    factoryAddress: assertNullableString(payload.factoryAddress, 'factoryAddress'),
    creatorAddress: assertNullableString(payload.creatorAddress, 'creatorAddress'),
    configVersion: assertNullableString(payload.configVersion, 'configVersion'),
    name: assertNullableString(payload.name, 'name'),
    symbol: assertNullableString(payload.symbol, 'symbol'),
    tokenImage: assertNullableString(payload.tokenImage, 'tokenImage'),
    description: assertNullableString(payload.description, 'description'),
    stage: assertMarketStage(payload.stage, 'stage'),
    pairAddress: assertNullableString(payload.pairAddress, 'pairAddress'),
    platformFeeBps: assertString(payload.platformFeeBps, 'platformFeeBps'),
    creatorFeeBps: assertString(payload.creatorFeeBps, 'creatorFeeBps'),
    createFee: assertString(payload.createFee, 'createFee'),
  };
}

function parseMarketListPayload(value: unknown): MarketListItem[] {
  const payload = assertRecord(value, 'Market list response');
  if (!Array.isArray(payload.markets)) {
    throw new Error('markets must be an array');
  }

  return payload.markets.map((item, index) => {
    const market = assertRecord(item, `markets[${index}]`);
    return {
      tokenAddress: assertString(market.tokenAddress, `markets[${index}].tokenAddress`),
      marketAddress: assertString(market.marketAddress, `markets[${index}].marketAddress`),
      creatorAddress: assertNullableString(market.creatorAddress, `markets[${index}].creatorAddress`),
      name: assertNullableString(market.name, `markets[${index}].name`),
      symbol: assertNullableString(market.symbol, `markets[${index}].symbol`),
      tokenImage: assertNullableString(market.tokenImage, `markets[${index}].tokenImage`),
      description: assertNullableString(market.description, `markets[${index}].description`),
      stage: assertMarketStage(market.stage, `markets[${index}].stage`),
      pairAddress: assertNullableString(market.pairAddress, `markets[${index}].pairAddress`),
      currentPrice: assertString(market.currentPrice, `markets[${index}].currentPrice`),
      currentMarketCap: assertString(market.currentMarketCap, `markets[${index}].currentMarketCap`),
      priceChangePercent24h: assertNullableString(
        market.priceChangePercent24h,
        `markets[${index}].priceChangePercent24h`,
      ),
      volume24h: assertString(market.volume24h, `markets[${index}].volume24h`),
      volume24hComplete: assertBoolean(market.volume24hComplete, `markets[${index}].volume24hComplete`),
      tradeCount24h: assertNumber(market.tradeCount24h, `markets[${index}].tradeCount24h`),
      createdAt: assertNullableNumber(market.createdAt, `markets[${index}].createdAt`),
      lastTradeAt: assertNullableNumber(market.lastTradeAt, `markets[${index}].lastTradeAt`),
    };
  });
}

function parseCandlesPayload(value: unknown): TradingViewCandlesResponse {
  const payload = assertRecord(value, 'Candles response');
  const status = payload.s;
  if (status !== 'ok' && status !== 'no_data' && status !== 'error') {
    throw new Error('Candles response status is invalid');
  }

  const response: TradingViewCandlesResponse = {
    s: status,
    errmsg: payload.errmsg === undefined ? undefined : assertString(payload.errmsg, 'errmsg'),
  };

  if (status !== 'ok') {
    return response;
  }

  response.t = assertNumberArray(payload.t, 't');
  response.o = assertStringArray(payload.o, 'o');
  response.h = assertStringArray(payload.h, 'h');
  response.l = assertStringArray(payload.l, 'l');
  response.c = assertStringArray(payload.c, 'c');
  response.v = assertStringArray(payload.v, 'v');
  response.volumeQuoteGrossComplete = payload.volumeQuoteGrossComplete === undefined
    ? undefined
    : assertBooleanArray(payload.volumeQuoteGrossComplete, 'volumeQuoteGrossComplete');

  const expectedLength = response.t.length;
  for (const [label, values] of Object.entries({
    o: response.o,
    h: response.h,
    l: response.l,
    c: response.c,
    v: response.v,
    volumeQuoteGrossComplete: response.volumeQuoteGrossComplete,
  })) {
    if (values !== undefined && values.length !== expectedLength) {
      throw new Error(`${label} length must match t length`);
    }
  }

  if (payload.visualAnchor !== undefined && payload.visualAnchor !== null) {
    const visualAnchor = assertRecord(payload.visualAnchor, 'visualAnchor');
    response.visualAnchor = {
      time: assertNumber(visualAnchor.time, 'visualAnchor.time'),
      price: assertString(visualAnchor.price, 'visualAnchor.price'),
    };
  } else {
    response.visualAnchor = null;
  }

  return response;
}

function parseTradesPayload(value: unknown): MarketTradesResponse {
  const payload = assertRecord(value, 'Trades response');
  if (!Array.isArray(payload.trades)) {
    throw new Error('trades must be an array');
  }

  return {
    trades: payload.trades.map((item, index) => {
      const trade = assertRecord(item, `trades[${index}]`);
      if (trade.side !== 'buy' && trade.side !== 'sell') {
        throw new Error(`trades[${index}].side is invalid`);
      }
      if (trade.source !== 'bonding_curve' && trade.source !== 'uniswap_v2') {
        throw new Error(`trades[${index}].source is invalid`);
      }

      return {
        id: assertString(trade.id, `trades[${index}].id`),
        side: trade.side,
        source: trade.source,
        marketAddress: assertNullableString(trade.marketAddress, `trades[${index}].marketAddress`),
        trader: assertNullableString(trade.trader, `trades[${index}].trader`),
        executionPrice: assertNullableString(trade.executionPrice, `trades[${index}].executionPrice`),
        markPrice: assertString(trade.markPrice, `trades[${index}].markPrice`),
        tokenAmount: assertString(trade.tokenAmount, `trades[${index}].tokenAmount`),
        quoteAmount: assertNullableString(trade.quoteAmount, `trades[${index}].quoteAmount`),
        quoteAmountGross: assertNullableString(trade.quoteAmountGross, `trades[${index}].quoteAmountGross`),
        quoteAmountNet: assertNullableString(trade.quoteAmountNet, `trades[${index}].quoteAmountNet`),
        creatorFee: assertNullableString(trade.creatorFee, `trades[${index}].creatorFee`),
        platformFee: assertNullableString(trade.platformFee, `trades[${index}].platformFee`),
        transactionHash: assertString(trade.transactionHash, `trades[${index}].transactionHash`),
        timestamp: assertNumber(trade.timestamp, `trades[${index}].timestamp`),
        confirmed: assertBoolean(trade.confirmed, `trades[${index}].confirmed`),
        legacyVolumeSemantics: assertBoolean(
          trade.legacyVolumeSemantics,
          `trades[${index}].legacyVolumeSemantics`,
        ),
      };
    }),
    nextCursor: assertNullableString(payload.nextCursor, 'nextCursor'),
  };
}

function parseHoldersPayload(value: unknown): MarketHoldersResponse {
  const payload = assertRecord(value, 'Holders response');
  if (!Array.isArray(payload.holders)) {
    throw new Error('holders must be an array');
  }

  return {
    holders: payload.holders.map((item, index) => {
      const holder = assertRecord(item, `holders[${index}]`);
      return {
        address: assertString(holder.address, `holders[${index}].address`),
        balance: assertString(holder.balance, `holders[${index}].balance`),
        firstBuyAt: holder.firstBuyAt === null
          ? null
          : assertNumber(holder.firstBuyAt, `holders[${index}].firstBuyAt`),
        lastTradeAt: assertNumber(holder.lastTradeAt, `holders[${index}].lastTradeAt`),
        buyCount: assertNumber(holder.buyCount, `holders[${index}].buyCount`),
        sellCount: assertNumber(holder.sellCount, `holders[${index}].sellCount`),
        totalBought: assertString(holder.totalBought, `holders[${index}].totalBought`),
        totalSold: assertString(holder.totalSold, `holders[${index}].totalSold`),
      };
    }),
  };
}

function parseSummaryPayload(value: unknown): MarketSummaryResponse {
  const payload = assertRecord(value, 'Market summary response');
  return {
    latestPrice: assertNullableString(payload.latestPrice, 'latestPrice'),
    priceChange1h: assertNullableString(payload.priceChange1h, 'priceChange1h'),
    priceChange24h: assertNullableString(payload.priceChange24h, 'priceChange24h'),
    priceChangePercent1h: assertNullableString(payload.priceChangePercent1h, 'priceChangePercent1h'),
    priceChangePercent24h: assertNullableString(payload.priceChangePercent24h, 'priceChangePercent24h'),
    high24h: assertNullableString(payload.high24h, 'high24h'),
    low24h: assertNullableString(payload.low24h, 'low24h'),
    volume24h: assertString(payload.volume24h, 'volume24h'),
    volume24hComplete: assertBoolean(payload.volume24hComplete, 'volume24hComplete'),
    tradeCount24h: assertNumber(payload.tradeCount24h, 'tradeCount24h'),
    marketStage: assertNullableMarketStage(payload.marketStage, 'marketStage'),
    pairAddress: assertNullableString(payload.pairAddress, 'pairAddress'),
    liquidityQuote: assertNullableString(payload.liquidityQuote, 'liquidityQuote'),
    lastTradeAt: assertNullableNumber(payload.lastTradeAt, 'lastTradeAt'),
  };
}

export async function getMarketList(options?: {
  limit?: number;
  signal?: AbortSignal;
}): Promise<MarketListItem[]> {
  const query = new URLSearchParams();
  if (options?.limit !== undefined) {
    query.set('limit', String(options.limit));
  }

  const response = await fetch(
    `${API_BASE_URL}/api/market/list${query.size > 0 ? `?${query.toString()}` : ''}`,
    { signal: options?.signal, cache: 'no-store' },
  );
  if (!response.ok) {
    throw new Error(`Market list request failed: ${response.status}`);
  }

  return parseMarketListPayload(await response.json());
}

export async function getCandles(
  tokenAddress: string,
  from: number,
  to: number,
  signal?: AbortSignal,
): Promise<MarketCandle[]> {
  const query = new URLSearchParams({
    resolution: '1',
    from: String(from),
    to: String(to),
  });
  const response = await fetch(
    `${API_BASE_URL}/api/market/${tokenAddress}/candles?${query.toString()}`,
    { signal, cache: 'no-store' },
  );
  const payload = parseCandlesPayload(await response.json());

  if (!response.ok || payload.s === 'error') {
    throw new Error(payload.errmsg || `Market API request failed: ${response.status}`);
  }

  if (payload.s === 'no_data') {
    return [];
  }

  if (!payload.t || !payload.o || !payload.h || !payload.l || !payload.c || !payload.v) {
    throw new Error('Market API returned incomplete candle data');
  }

  const candles: MarketCandle[] = payload.t.map((time, index) => ({
    time,
    open: Number(payload.o![index]),
    high: Number(payload.h![index]),
    low: Number(payload.l![index]),
    close: Number(payload.c![index]),
    volume: Number(payload.v![index]),
    volumeQuoteGrossComplete: payload.volumeQuoteGrossComplete?.[index] ?? false,
  }));

  if (candles.length > 0 && payload.visualAnchor && payload.visualAnchor.time < candles[0].time) {
    const anchorPrice = Number(payload.visualAnchor.price);
    if (Number.isFinite(anchorPrice) && anchorPrice > 0) {
      candles.unshift({
        time: payload.visualAnchor.time,
        open: anchorPrice,
        high: anchorPrice,
        low: anchorPrice,
        close: anchorPrice,
        volume: 0,
        volumeQuoteGrossComplete: true,
        visualAnchor: true,
      });
    }
  }

  return candles;
}

export async function getMarketTrades(
  tokenAddress: string,
  options?: { limit?: number; cursor?: string; signal?: AbortSignal },
): Promise<MarketTradesPage> {
  const query = new URLSearchParams();
  if (options?.limit !== undefined) {
    query.set('limit', String(options.limit));
  }
  if (options?.cursor) {
    query.set('cursor', options.cursor);
  }

  const response = await fetch(
    `${API_BASE_URL}/api/market/${tokenAddress}/trades${query.size > 0 ? `?${query.toString()}` : ''}`,
    { signal: options?.signal, cache: 'no-store' },
  );

  if (!response.ok) {
    const errorPayload = (await response.json()) as ErrorResponse;
    throw new Error(errorPayload.errmsg || `Market API request failed: ${response.status}`);
  }

  const payload = parseTradesPayload(await response.json());

  return {
    trades: payload.trades.map((trade) => ({
      ...trade,
      executionPrice: trade.executionPrice === null ? null : Number(trade.executionPrice),
      markPrice: Number(trade.markPrice),
    })),
    nextCursor: payload.nextCursor,
  };
}

export async function getMarketHolders(
  tokenAddress: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<MarketHolder[]> {
  const query = new URLSearchParams();
  if (options?.limit !== undefined) {
    query.set('limit', String(options.limit));
  }

  const response = await fetch(
    `${API_BASE_URL}/api/market/${tokenAddress}/holders${query.size > 0 ? `?${query.toString()}` : ''}`,
    { signal: options?.signal, cache: 'no-store' },
  );

  if (!response.ok) {
    const errorPayload = (await response.json()) as ErrorResponse;
    throw new Error(errorPayload.errmsg || errorPayload.error || `Market API request failed: ${response.status}`);
  }

  return parseHoldersPayload(await response.json()).holders;
}

export async function getMarketSummary(
  tokenAddress: string,
  signal?: AbortSignal,
): Promise<MarketSummary> {
  const response = await fetch(
    `${API_BASE_URL}/api/market/${tokenAddress}/summary`,
    { signal, cache: 'no-store' },
  );

  if (!response.ok) {
    const errorPayload = (await response.json()) as ErrorResponse;
    throw new Error(errorPayload.errmsg || `Market API request failed: ${response.status}`);
  }

  const payload = parseSummaryPayload(await response.json());

  return {
    latestPrice: payload.latestPrice === null ? null : Number(payload.latestPrice),
    priceChange1h: payload.priceChange1h === null ? null : Number(payload.priceChange1h),
    priceChange24h: payload.priceChange24h === null ? null : Number(payload.priceChange24h),
    priceChangePercent1h: payload.priceChangePercent1h,
    priceChangePercent24h: payload.priceChangePercent24h,
    high24h: payload.high24h === null ? null : Number(payload.high24h),
    low24h: payload.low24h === null ? null : Number(payload.low24h),
    volume24h: payload.volume24h,
    volume24hComplete: payload.volume24hComplete,
    tradeCount24h: payload.tradeCount24h,
    marketStage: payload.marketStage,
    pairAddress: payload.pairAddress,
    liquidityQuote: payload.liquidityQuote,
    lastTradeAt: payload.lastTradeAt,
  };
}
