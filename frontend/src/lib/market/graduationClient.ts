import { readContract, waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { LIQUIDITY_MANAGER_ABI, TOKEN_MARKET_ABI } from '@/config/abis';
import { DEFAULT_CHAIN_ID, getContractAddresses } from '@/config/contracts';
import { config } from '@/config/wagmi';
import { MARKET_STAGE } from '@/lib/marketStages';
import { getMarketState, resolveMarketAddress, type Address } from '@/lib/market/tokenMarketClient';

const DEFAULT_DEADLINE_SECONDS = 300;
const DEFAULT_GRADUATION_SLIPPAGE_BPS = 100n;
const BPS_DENOMINATOR = 10_000n;

export type GraduationStep =
  | 'checking_stage'
  | 'prepare_submitted'
  | 'prepare_confirmed'
  | 'liquidity_submitted'
  | 'liquidity_confirmed'
  | 'already_live';

export interface GraduationResult {
  tokenAddress: Address;
  marketAddress: Address;
  prepareHash?: `0x${string}`;
  addLiquidityHash?: `0x${string}`;
  alreadyLive: boolean;
}

function assertAddress(value: string | null | undefined, label: string): Address {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${label} address is not configured`);
  }
  return value as Address;
}

function getGraduationSlippageBps(): bigint {
  const configured = Number(process.env.NEXT_PUBLIC_GRADUATION_ADD_LIQUIDITY_SLIPPAGE_BPS);
  if (Number.isFinite(configured) && configured >= 0 && configured < Number(BPS_DENOMINATOR)) {
    return BigInt(Math.floor(configured));
  }
  return DEFAULT_GRADUATION_SLIPPAGE_BPS;
}

function calculateMinAmount(amount: bigint, slippageBps: bigint): bigint {
  if (amount <= 0n) return 0n;
  if (slippageBps <= 0n) return amount;
  return amount - (amount * slippageBps) / BPS_DENOMINATOR;
}

function isGraduationProgressedStage(stage: number) {
  return stage === MARKET_STAGE.LIQUIDITY_PENDING || stage === MARKET_STAGE.DEX_LIVE;
}

async function waitForSuccess(hash: `0x${string}`) {
  const receipt = await waitForTransactionReceipt(config, {
    hash,
    chainId: DEFAULT_CHAIN_ID,
  });

  if (receipt.status !== 'success') {
    throw new Error(`Transaction ${hash} reverted onchain`);
  }
}

async function getLiquidityInfo(tokenAddress: Address) {
  const liquidityManager = assertAddress(
    getContractAddresses(DEFAULT_CHAIN_ID).LIQUIDITY_MANAGER,
    'LiquidityManager',
  );
  const result = await readContract(config, {
    address: liquidityManager,
    abi: LIQUIDITY_MANAGER_ABI,
    functionName: 'getLiquidityInfo',
    args: [tokenAddress],
    chainId: DEFAULT_CHAIN_ID,
  }) as readonly [bigint, bigint, Address, bigint, boolean, boolean, bigint];

  return {
    liquidityManager,
    liquidityTokenAmount: result[0],
    liquidityEthAmount: result[1],
    liquidityAdded: result[4],
  };
}

export async function finalizeGraduationPermissionless(
  tokenAddress: string,
  onStep?: (step: GraduationStep) => void,
): Promise<GraduationResult> {
  const token = assertAddress(tokenAddress, 'Token');
  const marketAddress = await resolveMarketAddress(token);

  onStep?.('checking_stage');
  let state = await getMarketState(marketAddress);
  if (state.stage === MARKET_STAGE.DEX_LIVE) {
    onStep?.('already_live');
    return { tokenAddress: token, marketAddress, alreadyLive: true };
  }

  let prepareHash: `0x${string}` | undefined;
  if (state.stage === MARKET_STAGE.GRADUATION_PENDING) {
    try {
      prepareHash = await writeContract(config, {
        address: marketAddress,
        abi: TOKEN_MARKET_ABI,
        functionName: 'prepareGraduation',
        chainId: DEFAULT_CHAIN_ID,
      });
      onStep?.('prepare_submitted');
      await waitForSuccess(prepareHash);
      onStep?.('prepare_confirmed');
      state = await getMarketState(marketAddress);
    } catch (error) {
      state = await getMarketState(marketAddress);
      if (!isGraduationProgressedStage(state.stage)) {
        throw error;
      }

      if (state.stage === MARKET_STAGE.DEX_LIVE) {
        onStep?.('already_live');
        return { tokenAddress: token, marketAddress, prepareHash, alreadyLive: true };
      }

      onStep?.('prepare_confirmed');
    }
  }

  if (state.stage === MARKET_STAGE.DEX_LIVE) {
    onStep?.('already_live');
    return { tokenAddress: token, marketAddress, prepareHash, alreadyLive: true };
  }

  if (state.stage !== MARKET_STAGE.LIQUIDITY_PENDING) {
    throw new Error(`Token market is not ready for DEX migration. Current stage: ${state.stage}`);
  }

  const info = await getLiquidityInfo(token);
  if (info.liquidityAdded) {
    onStep?.('already_live');
    return { tokenAddress: token, marketAddress, prepareHash, alreadyLive: true };
  }

  const slippageBps = getGraduationSlippageBps();
  const minTokenAmount = calculateMinAmount(info.liquidityTokenAmount, slippageBps);
  const minEthAmount = calculateMinAmount(info.liquidityEthAmount, slippageBps);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);
  const addLiquidityHash = await writeContract(config, {
    address: info.liquidityManager,
    abi: LIQUIDITY_MANAGER_ABI,
    functionName: 'addLiquidity',
    args: [token, minTokenAmount, minEthAmount, deadline],
    chainId: DEFAULT_CHAIN_ID,
  });

  onStep?.('liquidity_submitted');
  await waitForSuccess(addLiquidityHash);
  onStep?.('liquidity_confirmed');

  return {
    tokenAddress: token,
    marketAddress,
    prepareHash,
    addLiquidityHash,
    alreadyLive: false,
  };
}
