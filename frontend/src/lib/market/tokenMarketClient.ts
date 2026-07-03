import { readContract, writeContract } from 'wagmi/actions';
import { config } from '@/config/wagmi';
import { DEFAULT_CHAIN_ID, getContractAddresses } from '@/config/contracts';
import { MEME_FACTORY_ABI, MEME_TOKEN_ABI, TOKEN_MARKET_ABI } from '@/config/abis';
import { getMarketConfig } from '@/lib/marketApi';

export type Address = `0x${string}`;

export interface BuyQuote {
  grossEthIn: bigint;
  reserveIncrease: bigint;
  platformFee: bigint;
  creatorFee: bigint;
  tokenOut: bigint;
  executionPriceX18: bigint;
  markPriceX18: bigint;
}

export interface SellQuote {
  tokenIn: bigint;
  grossEthOut: bigint;
  sellerReceives: bigint;
  platformFee: bigint;
  creatorFee: bigint;
  executionPriceX18: bigint;
  markPriceX18: bigint;
}

export interface MarketState {
  stage: number;
  curveSupply: bigint;
  reserveBalance: bigint;
  currentPriceX18: bigint;
  currentMarketCap: bigint;
  creator: Address;
  buyPaused: boolean;
  sellPaused: boolean;
  targetSupply: bigint;
  graduationMarketCap: bigint;
  initialPriceX18: bigint;
}

export interface TokenMetadata {
  name: string | null;
  symbol: string | null;
}

interface MarketStateView {
  stage: number;
  curveSupply: bigint;
  reserveBalance: bigint;
  currentPriceX18: bigint;
  currentMarketCap: bigint;
  creator: Address;
  buyPaused: boolean;
  sellPaused: boolean;
  curveConfig: {
    initialPriceX18: bigint;
    targetPriceX18: bigint;
    targetSupply: bigint;
    graduationMarketCap: bigint;
  };
}

const MARKET_ADDRESS_CACHE_TTL_MS = 5 * 60_000;
const ZERO_ADDRESS = /^0x0{40}$/i;

const marketAddressCache = new Map<string, { value: Address; expiresAt: number }>();
const pendingMarketAddressLookups = new Map<string, Promise<Address>>();
const tokenMetadataCache = new Map<string, TokenMetadata>();
const pendingTokenMetadataLookups = new Map<string, Promise<TokenMetadata>>();

function getCachedMarketAddress(tokenAddress: Address): Address | null {
  const cached = marketAddressCache.get(tokenAddress.toLowerCase());
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    marketAddressCache.delete(tokenAddress.toLowerCase());
    return null;
  }
  return cached.value;
}

function cacheMarketAddress(tokenAddress: Address, marketAddress: Address): Address {
  marketAddressCache.set(tokenAddress.toLowerCase(), {
    value: marketAddress,
    expiresAt: Date.now() + MARKET_ADDRESS_CACHE_TTL_MS,
  });
  return marketAddress;
}

export async function resolveMarketAddress(
  tokenAddress: Address,
  options?: { skipConfigLookup?: boolean },
): Promise<Address> {
  const cachedMarketAddress = getCachedMarketAddress(tokenAddress);
  if (cachedMarketAddress) return cachedMarketAddress;

  const cacheKey = tokenAddress.toLowerCase();
  const pendingLookup = pendingMarketAddressLookups.get(cacheKey);
  if (pendingLookup) return pendingLookup;

  const lookup = (async () => {
    try {
      if (!options?.skipConfigLookup) {
        try {
          const market = await getMarketConfig(tokenAddress);
          if (market.marketAddress && !ZERO_ADDRESS.test(market.marketAddress)) {
            return cacheMarketAddress(tokenAddress, market.marketAddress as Address);
          }
        } catch {
        }
      }

      const factoryAddress = getContractAddresses(DEFAULT_CHAIN_ID).MEME_FACTORY;
      if (!factoryAddress) throw new Error('MemeFactory address is not configured');
      const market = await readContract(config, {
        address: factoryAddress as Address,
        abi: MEME_FACTORY_ABI,
        functionName: 'marketOf',
        args: [tokenAddress],
        chainId: DEFAULT_CHAIN_ID,
      }) as Address;
      if (ZERO_ADDRESS.test(market)) throw new Error('Token market does not exist');
      return cacheMarketAddress(tokenAddress, market);
    } finally {
      pendingMarketAddressLookups.delete(cacheKey);
    }
  })();

  pendingMarketAddressLookups.set(cacheKey, lookup);
  return lookup;
}

export async function getTokenMetadata(tokenAddress: Address): Promise<TokenMetadata> {
  const cacheKey = tokenAddress.toLowerCase();
  const cachedMetadata = tokenMetadataCache.get(cacheKey);
  if (cachedMetadata) return cachedMetadata;

  const pendingLookup = pendingTokenMetadataLookups.get(cacheKey);
  if (pendingLookup) return pendingLookup;

  const lookup = (async () => {
    try {
      const [nameResult, symbolResult] = await Promise.allSettled([
        readContract(config, {
          address: tokenAddress,
          abi: MEME_TOKEN_ABI,
          functionName: 'name',
          chainId: DEFAULT_CHAIN_ID,
        }),
        readContract(config, {
          address: tokenAddress,
          abi: MEME_TOKEN_ABI,
          functionName: 'symbol',
          chainId: DEFAULT_CHAIN_ID,
        }),
      ]);

      const metadata = {
        name: nameResult.status === 'fulfilled' && typeof nameResult.value === 'string'
          ? nameResult.value
          : null,
        symbol: symbolResult.status === 'fulfilled' && typeof symbolResult.value === 'string'
          ? symbolResult.value
          : null,
      };

      if (metadata.name === null && metadata.symbol === null) {
        throw new Error('Token metadata is not available on-chain');
      }

      tokenMetadataCache.set(cacheKey, metadata);
      return metadata;
    } finally {
      pendingTokenMetadataLookups.delete(cacheKey);
    }
  })();

  pendingTokenMetadataLookups.set(cacheKey, lookup);
  return lookup;
}

export async function quoteBuyExactEth(marketAddress: Address, grossEthIn: bigint) {
  const quote = await readContract(config, {
    address: marketAddress,
    abi: TOKEN_MARKET_ABI,
    functionName: 'quoteBuyExactEth',
    args: [grossEthIn],
    chainId: DEFAULT_CHAIN_ID,
  }) as unknown as BuyQuote | readonly bigint[];
  return Array.isArray(quote) ? {
    grossEthIn: quote[0],
    platformFee: quote[1],
    creatorFee: quote[2],
    reserveIncrease: quote[3],
    tokenOut: quote[4],
    executionPriceX18: quote[5],
    markPriceX18: quote[6],
  } : quote as BuyQuote;
}

export async function quoteBuyExactTokens(marketAddress: Address, tokenOut: bigint) {
  const quote = await readContract(config, {
    address: marketAddress,
    abi: TOKEN_MARKET_ABI,
    functionName: 'quoteBuyExactTokens',
    args: [tokenOut],
    chainId: DEFAULT_CHAIN_ID,
  }) as unknown as BuyQuote | readonly bigint[];
  return Array.isArray(quote) ? {
    grossEthIn: quote[0],
    platformFee: quote[1],
    creatorFee: quote[2],
    reserveIncrease: quote[3],
    tokenOut: quote[4],
    executionPriceX18: quote[5],
    markPriceX18: quote[6],
  } : quote as BuyQuote;
}

export async function quoteSell(marketAddress: Address, tokenIn: bigint) {
  const quote = await readContract(config, {
    address: marketAddress,
    abi: TOKEN_MARKET_ABI,
    functionName: 'quoteSell',
    args: [tokenIn],
    chainId: DEFAULT_CHAIN_ID,
  }) as unknown as SellQuote | readonly bigint[];
  return Array.isArray(quote) ? {
    tokenIn: quote[0],
    grossEthOut: quote[1],
    platformFee: quote[2],
    creatorFee: quote[3],
    sellerReceives: quote[4],
    executionPriceX18: quote[5],
    markPriceX18: quote[6],
  } : quote as SellQuote;
}

export async function getMarketState(marketAddress: Address): Promise<MarketState> {
  const state = await readContract(config, {
    address: marketAddress,
    abi: TOKEN_MARKET_ABI,
    functionName: 'getMarketState',
    chainId: DEFAULT_CHAIN_ID,
  }) as unknown as MarketStateView;

  return {
    stage: Number(state.stage),
    curveSupply: state.curveSupply,
    reserveBalance: state.reserveBalance,
    currentPriceX18: state.currentPriceX18,
    currentMarketCap: state.currentMarketCap,
    creator: state.creator,
    buyPaused: state.buyPaused,
    sellPaused: state.sellPaused,
    targetSupply: state.curveConfig.targetSupply,
    graduationMarketCap: state.curveConfig.graduationMarketCap,
    initialPriceX18: state.curveConfig.initialPriceX18,
  };
}

export async function getInitialPriceX18(marketAddress: Address): Promise<bigint | null> {
  try {
    const state = await getMarketState(marketAddress);
    return state.initialPriceX18;
  } catch {
    return null;
  }
}

export async function buy(marketAddress: Address, grossEthIn: bigint, minTokenOut: bigint) {
  return await writeContract(config, {
    address: marketAddress,
    abi: TOKEN_MARKET_ABI,
    functionName: 'buy',
    args: [minTokenOut, BigInt(Math.floor(Date.now() / 1000) + 300)],
    value: grossEthIn,
    chainId: DEFAULT_CHAIN_ID,
  });
}

export async function sell(marketAddress: Address, tokenIn: bigint, minEthOut: bigint) {
  return await writeContract(config, {
    address: marketAddress,
    abi: TOKEN_MARKET_ABI,
    functionName: 'sell',
    args: [tokenIn, minEthOut, BigInt(Math.floor(Date.now() / 1000) + 300)],
    chainId: DEFAULT_CHAIN_ID,
  });
}
