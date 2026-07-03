import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

function readEnv(relativePath) {
  const filePath = resolve(root, relativePath);
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')];
      }),
  );
}

function normalizeAddress(value) {
  return value ? value.toLowerCase() : '';
}

function printCheck(ok, message, detail = '') {
  const marker = ok ? 'OK ' : 'ERR';
  console.log(`${marker} ${message}${detail ? ` ${detail}` : ''}`);
}

async function loadHealth(apiBaseUrl) {
  try {
    const response = await fetch(`${apiBaseUrl}/api/health`, { cache: 'no-store' });
    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }
    return { data: await response.json() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown fetch error' };
  }
}

async function loadJson(apiBaseUrl, path) {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, { cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return { error: `HTTP ${response.status}`, body };
    }
    return { data: body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown fetch error' };
  }
}

const rootEnv = readEnv('.env');
const backendEnvPath = process.env.BACKEND_ENV_FILE || 'backend/.env';
const frontendEnvPath = process.env.FRONTEND_ENV_FILE || 'frontend/.env.local';
const backendEnv = { ...rootEnv, ...readEnv(backendEnvPath) };
const frontendEnv = readEnv(frontendEnvPath);
const apiBaseUrl = (
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_API_URL ||
  frontendEnv.NEXT_PUBLIC_BACKEND_API_URL ||
  'http://localhost:9000'
).replace(/\/$/, '');
const expectedChainId =
  process.env.CHAIN_ID ||
  process.env.NEXT_PUBLIC_CHAIN_ID ||
  frontendEnv.NEXT_PUBLIC_CHAIN_ID ||
  '31337';
const expectedFactoryAddress =
  process.env.MEME_FACTORY_ADDRESS ||
  process.env.NEXT_PUBLIC_MEME_FACTORY_ADDRESS ||
  frontendEnv.NEXT_PUBLIC_MEME_FACTORY_ADDRESS;
const expectedLiquidityManagerAddress =
  process.env.LIQUIDITY_MANAGER_ADDRESS ||
  process.env.NEXT_PUBLIC_LIQUIDITY_MANAGER_ADDRESS ||
  frontendEnv.NEXT_PUBLIC_LIQUIDITY_MANAGER_ADDRESS;

console.log('0xcafe dev doctor');
console.log(`Backend API: ${apiBaseUrl}`);
console.log(`Backend env: ${backendEnvPath}`);
console.log(`Frontend env: ${frontendEnvPath}`);

const health = await loadHealth(apiBaseUrl);
if (health.error) {
  printCheck(false, 'backend health unreachable', health.error);
  console.log('Hint: start backend with `npm run dev` in backend/ or check NEXT_PUBLIC_BACKEND_API_URL.');
  process.exitCode = 1;
} else {
  const data = health.data;
  printCheck(data.ok === true, 'backend health responded', data.ok === true ? '' : 'dependencies degraded');
  printCheck(
    String(data.chain?.id) === String(expectedChainId),
    'frontend/backend chain id match',
    `expected=${expectedChainId} backend=${data.chain?.id}`,
  );
  printCheck(
    normalizeAddress(expectedFactoryAddress) === normalizeAddress(data.contracts?.memeFactory),
    'frontend/backend factory address match',
  );
  printCheck(
    normalizeAddress(expectedLiquidityManagerAddress) === normalizeAddress(data.contracts?.liquidityManager),
    'frontend/backend liquidity manager match',
  );
  printCheck(data.dependencies?.postgres?.status === 'ok', 'postgres ready', data.dependencies?.postgres?.status);
  printCheck(data.dependencies?.redis?.status === 'ok', 'redis ready', data.dependencies?.redis?.status);

  const markets = await loadJson(apiBaseUrl, '/api/market/list?limit=10');
  if (markets.error) {
    printCheck(false, 'market list reachable', markets.error);
    process.exitCode = 1;
  } else {
    const marketRows = Array.isArray(markets.data?.markets) ? markets.data.markets : [];
    printCheck(true, 'market list reachable', `markets=${marketRows.length}`);

    const candidateMarket =
      marketRows.find((market) => market.lastTradeAt !== null && market.lastTradeAt !== undefined) ??
      marketRows[0];
    if (candidateMarket?.tokenAddress) {
      const tokenAddress = candidateMarket.tokenAddress;
      const trades = await loadJson(apiBaseUrl, `/api/market/${tokenAddress}/trades?limit=1`);
      if (trades.error) {
        printCheck(false, 'latest market trades reachable', trades.error);
        process.exitCode = 1;
      } else {
        const tradeRows = Array.isArray(trades.data?.trades) ? trades.data.trades : [];
        printCheck(true, 'latest market trades reachable', `trades=${tradeRows.length}`);
      }

      const now = Math.floor(Date.now() / 1000);
      const tradeTimestamp = trades.data?.trades?.[0]?.timestamp;
      const to = Number.isInteger(tradeTimestamp) ? tradeTimestamp + 120 : now;
      const from = to - 60 * 60;
      const candles = await loadJson(
        apiBaseUrl,
        `/api/market/${tokenAddress}/candles?resolution=1&from=${from}&to=${to}`,
      );
      if (candles.error) {
        printCheck(false, 'latest market candles reachable', candles.error);
        process.exitCode = 1;
      } else {
        const candleCount = Array.isArray(candles.data?.t) ? candles.data.t.length : 0;
        const hasTrades = Array.isArray(trades.data?.trades) && trades.data.trades.length > 0;
        printCheck(
          !hasTrades || candles.data?.s === 'ok',
          'latest market candles readable after trades',
          `status=${candles.data?.s ?? 'unknown'} candles=${candleCount}`,
        );
        if (hasTrades && candles.data?.s !== 'ok') {
          process.exitCode = 1;
        }
      }
    } else {
      printCheck(true, 'candles smoke skipped', 'no markets indexed yet');
    }
  }

  if (data.ok !== true) process.exitCode = 1;
}

printCheck(
  normalizeAddress(frontendEnv.NEXT_PUBLIC_MEME_FACTORY_ADDRESS) === normalizeAddress(backendEnv.MEME_FACTORY_ADDRESS),
  'env files factory address match',
);
printCheck(
  normalizeAddress(frontendEnv.NEXT_PUBLIC_LIQUIDITY_MANAGER_ADDRESS) === normalizeAddress(backendEnv.LIQUIDITY_MANAGER_ADDRESS),
  'env files liquidity manager match',
);
