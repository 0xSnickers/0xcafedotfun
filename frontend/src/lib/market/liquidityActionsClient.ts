import { parseUnits } from 'viem';
import { formatRawAssetInputValue } from '@/lib/formatters/market';
import { readContract, writeContract } from 'wagmi/actions';
import { MEME_TOKEN_ABI } from '@/config/abis';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';
import { config } from '@/config/wagmi';
import { getDexAddresses } from '@/lib/market/dexTradeClient';
import type { Address } from '@/lib/market/tokenMarketClient';

export interface PoolPosition {
  router: Address;
  weth: Address;
  pairAddress: Address;
  tokenReserve: bigint;
  ethReserve: bigint;
  totalLiquidity: bigint;
  userTokenBalance: bigint;
  userLpBalance: bigint;
  tokenAllowance: bigint;
  lpAllowance: bigint;
}

const UNISWAP_V2_ROUTER_LIQUIDITY_ABI = [
  {
    type: 'function',
    name: 'addLiquidityETH',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amountTokenDesired', type: 'uint256' },
      { name: 'amountTokenMin', type: 'uint256' },
      { name: 'amountETHMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountToken', type: 'uint256' },
      { name: 'amountETH', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'removeLiquidityETH',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountTokenMin', type: 'uint256' },
      { name: 'amountETHMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountToken', type: 'uint256' },
      { name: 'amountETH', type: 'uint256' },
    ],
  },
] as const;

const UNISWAP_V2_PAIR_ABI = [
  {
    type: 'function',
    name: 'token0',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'token1',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getReserves',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const DEFAULT_DEADLINE_SECONDS = 300;
const MAX_UINT256 = 2n ** 256n - 1n;

function assertAddress(value: string | null | undefined, label: string): Address {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${label} address is unavailable`);
  }
  return value as Address;
}

export function parseLiquidityAmount(value: string): bigint {
  return parseUnits(value || '0', 18);
}

export function formatLiquidityAmount(value: bigint): string {
  return formatRawAssetInputValue(value, 18);
}

export function calculateMinAmount(amount: bigint, slippage: number): bigint {
  return amount - (amount * BigInt(Math.round(slippage * 100))) / 10_000n;
}

export function estimateRemoveAmounts(params: {
  liquidity: bigint;
  totalLiquidity: bigint;
  tokenReserve: bigint;
  ethReserve: bigint;
}) {
  if (params.totalLiquidity === 0n || params.liquidity === 0n) {
    return { tokenAmount: 0n, ethAmount: 0n };
  }

  return {
    tokenAmount: (params.tokenReserve * params.liquidity) / params.totalLiquidity,
    ethAmount: (params.ethReserve * params.liquidity) / params.totalLiquidity,
  };
}

export async function getPoolPosition(params: {
  tokenAddress: string;
  pairAddress: string;
  userAddress: string;
}): Promise<PoolPosition> {
  const { router, weth } = await getDexAddresses();
  const tokenAddress = assertAddress(params.tokenAddress, 'Token');
  const pairAddress = assertAddress(params.pairAddress, 'Pair');
  const userAddress = assertAddress(params.userAddress, 'User');

  const [
    token0,
    token1,
    reserves,
    totalLiquidity,
    userTokenBalance,
    userLpBalance,
    tokenAllowance,
    lpAllowance,
  ] = await Promise.all([
    readContract(config, {
      address: pairAddress,
      abi: UNISWAP_V2_PAIR_ABI,
      functionName: 'token0',
      chainId: DEFAULT_CHAIN_ID,
    }) as Promise<Address>,
    readContract(config, {
      address: pairAddress,
      abi: UNISWAP_V2_PAIR_ABI,
      functionName: 'token1',
      chainId: DEFAULT_CHAIN_ID,
    }) as Promise<Address>,
    readContract(config, {
      address: pairAddress,
      abi: UNISWAP_V2_PAIR_ABI,
      functionName: 'getReserves',
      chainId: DEFAULT_CHAIN_ID,
    }) as Promise<readonly [bigint, bigint, number]>,
    readContract(config, {
      address: pairAddress,
      abi: UNISWAP_V2_PAIR_ABI,
      functionName: 'totalSupply',
      chainId: DEFAULT_CHAIN_ID,
    }) as Promise<bigint>,
    readContract(config, {
      address: tokenAddress,
      abi: MEME_TOKEN_ABI,
      functionName: 'balanceOf',
      args: [userAddress],
      chainId: DEFAULT_CHAIN_ID,
    }) as Promise<bigint>,
    readContract(config, {
      address: pairAddress,
      abi: UNISWAP_V2_PAIR_ABI,
      functionName: 'balanceOf',
      args: [userAddress],
      chainId: DEFAULT_CHAIN_ID,
    }) as Promise<bigint>,
    readContract(config, {
      address: tokenAddress,
      abi: MEME_TOKEN_ABI,
      functionName: 'allowance',
      args: [userAddress, router],
      chainId: DEFAULT_CHAIN_ID,
    }) as Promise<bigint>,
    readContract(config, {
      address: pairAddress,
      abi: UNISWAP_V2_PAIR_ABI,
      functionName: 'allowance',
      args: [userAddress, router],
      chainId: DEFAULT_CHAIN_ID,
    }) as Promise<bigint>,
  ]);

  const [reserve0, reserve1] = reserves;
  const normalizedToken = tokenAddress.toLowerCase();
  const normalizedWeth = weth.toLowerCase();
  const normalizedToken0 = token0.toLowerCase();
  const normalizedToken1 = token1.toLowerCase();

  let tokenReserve: bigint;
  let ethReserve: bigint;
  if (normalizedToken0 === normalizedToken && normalizedToken1 === normalizedWeth) {
    tokenReserve = reserve0;
    ethReserve = reserve1;
  } else if (normalizedToken0 === normalizedWeth && normalizedToken1 === normalizedToken) {
    tokenReserve = reserve1;
    ethReserve = reserve0;
  } else {
    throw new Error('Pair does not match token/WETH');
  }

  return {
    router,
    weth,
    pairAddress,
    tokenReserve,
    ethReserve,
    totalLiquidity,
    userTokenBalance,
    userLpBalance,
    tokenAllowance,
    lpAllowance,
  };
}

export async function approveTokenForLiquidity(tokenAddress: string, router: Address) {
  return await writeContract(config, {
    address: assertAddress(tokenAddress, 'Token'),
    abi: MEME_TOKEN_ABI,
    functionName: 'approve',
    args: [router, MAX_UINT256],
    chainId: DEFAULT_CHAIN_ID,
  });
}

export async function approveLpForLiquidity(pairAddress: string, router: Address) {
  return await writeContract(config, {
    address: assertAddress(pairAddress, 'Pair'),
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: 'approve',
    args: [router, MAX_UINT256],
    chainId: DEFAULT_CHAIN_ID,
  });
}

export async function addLiquidityEth(params: {
  tokenAddress: string;
  tokenAmount: bigint;
  ethAmount: bigint;
  minTokenAmount: bigint;
  minEthAmount: bigint;
  recipient: Address;
}) {
  const { router } = await getDexAddresses();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);
  return await writeContract(config, {
    address: router,
    abi: UNISWAP_V2_ROUTER_LIQUIDITY_ABI,
    functionName: 'addLiquidityETH',
    args: [
      assertAddress(params.tokenAddress, 'Token'),
      params.tokenAmount,
      params.minTokenAmount,
      params.minEthAmount,
      params.recipient,
      deadline,
    ],
    value: params.ethAmount,
    chainId: DEFAULT_CHAIN_ID,
  });
}

export async function removeLiquidityEth(params: {
  tokenAddress: string;
  liquidity: bigint;
  minTokenAmount: bigint;
  minEthAmount: bigint;
  recipient: Address;
}) {
  const { router } = await getDexAddresses();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);
  return await writeContract(config, {
    address: router,
    abi: UNISWAP_V2_ROUTER_LIQUIDITY_ABI,
    functionName: 'removeLiquidityETH',
    args: [
      assertAddress(params.tokenAddress, 'Token'),
      params.liquidity,
      params.minTokenAmount,
      params.minEthAmount,
      params.recipient,
      deadline,
    ],
    chainId: DEFAULT_CHAIN_ID,
  });
}
