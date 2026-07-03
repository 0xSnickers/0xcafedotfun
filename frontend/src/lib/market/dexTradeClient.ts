import { parseUnits } from 'viem';
import { readContract, writeContract } from 'wagmi/actions';
import { LIQUIDITY_MANAGER_ABI } from '@/config/abis';
import { DEFAULT_CHAIN_ID, getContractAddresses } from '@/config/contracts';
import { config } from '@/config/wagmi';
import type { Address } from '@/lib/market/tokenMarketClient';

export type DexTradeMode = 'buy' | 'sell';

export interface DexAddresses {
  router: Address;
  weth: Address;
}

export interface DexQuote {
  amountIn: bigint;
  amountOut: bigint;
  path: readonly Address[];
}

const UNISWAP_V2_ROUTER_ABI = [
  {
    type: 'function',
    name: 'getAmountsOut',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'swapExactETHForTokens',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'swapExactTokensForETH',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const;

const DEFAULT_DEADLINE_SECONDS = 300;
let cachedDexAddresses: DexAddresses | null = null;

function assertAddress(value: unknown, label: string): Address {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${label} address is unavailable`);
  }
  return value as Address;
}

export async function getDexAddresses(): Promise<DexAddresses> {
  if (cachedDexAddresses) {
    return cachedDexAddresses;
  }

  const liquidityManager = getContractAddresses(DEFAULT_CHAIN_ID).LIQUIDITY_MANAGER;
  if (!liquidityManager) {
    throw new Error('LiquidityManager address is not configured');
  }

  const [router, weth] = await Promise.all([
    readContract(config, {
      address: liquidityManager as Address,
      abi: LIQUIDITY_MANAGER_ABI,
      functionName: 'uniswapRouter',
      chainId: DEFAULT_CHAIN_ID,
    }),
    readContract(config, {
      address: liquidityManager as Address,
      abi: LIQUIDITY_MANAGER_ABI,
      functionName: 'weth',
      chainId: DEFAULT_CHAIN_ID,
    }),
  ]);

  cachedDexAddresses = {
    router: assertAddress(router, 'Router'),
    weth: assertAddress(weth, 'WETH'),
  };
  return cachedDexAddresses;
}

export function buildDexPath(
  mode: DexTradeMode,
  tokenAddress: Address,
  wethAddress: Address,
): readonly Address[] {
  return mode === 'buy'
    ? [wethAddress, tokenAddress]
    : [tokenAddress, wethAddress];
}

export async function quoteDexExactInput(
  mode: DexTradeMode,
  tokenAddress: Address,
  amountIn: bigint,
): Promise<DexQuote> {
  const { router, weth } = await getDexAddresses();
  const path = buildDexPath(mode, tokenAddress, weth);
  const amounts = await readContract(config, {
    address: router,
    abi: UNISWAP_V2_ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [amountIn, path],
    chainId: DEFAULT_CHAIN_ID,
  }) as readonly bigint[];

  return {
    amountIn,
    amountOut: amounts[amounts.length - 1] ?? 0n,
    path,
  };
}

export async function swapDexExactInput(params: {
  mode: DexTradeMode;
  tokenAddress: Address;
  amountIn: bigint;
  minAmountOut: bigint;
  recipient: Address;
}) {
  const { router, weth } = await getDexAddresses();
  const path = buildDexPath(params.mode, params.tokenAddress, weth);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);

  if (params.mode === 'buy') {
    return await writeContract(config, {
      address: router,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'swapExactETHForTokens',
      args: [params.minAmountOut, path, params.recipient, deadline],
      value: params.amountIn,
      chainId: DEFAULT_CHAIN_ID,
    });
  }

  return await writeContract(config, {
    address: router,
    abi: UNISWAP_V2_ROUTER_ABI,
    functionName: 'swapExactTokensForETH',
    args: [params.amountIn, params.minAmountOut, path, params.recipient, deadline],
    chainId: DEFAULT_CHAIN_ID,
  });
}

export function parseDexInputAmount(amount: string): bigint {
  return parseUnits(amount, 18);
}
