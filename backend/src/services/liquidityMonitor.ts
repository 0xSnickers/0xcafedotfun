import { randomUUID } from 'node:crypto'
import { getContract } from 'viem'
import {
  graduationRegisteredEvent,
  liquidityAddedEvent,
} from '../abi/formalMarketEvents'
import { postgresPool } from '../clients/postgresClient'
import { redis } from '../clients/redisClient'
import { viemClient, walletClient } from '../clients/viemClient'
import { isGraduationCandidateStage, MARKET_STAGE } from '../types/marketStage'

const MEME_FACTORY_ABI = [
  {
    type: 'function',
    name: 'marketOf',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'sweepMarketResiduals',
    inputs: [
      { name: 'market', type: 'address' },
      { name: 'tokenRecipient', type: 'address' },
      { name: 'ethRecipient', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

const TOKEN_MARKET_ABI = [
  {
    type: 'function',
    name: 'prepareGraduation',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getMarketState',
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'stage', type: 'uint8' },
          { name: 'curveSupply', type: 'uint256' },
          { name: 'reserveBalance', type: 'uint256' },
          { name: 'currentPriceX18', type: 'uint256' },
          { name: 'currentMarketCap', type: 'uint256' },
          { name: 'creator', type: 'address' },
          { name: 'buyPaused', type: 'bool' },
          { name: 'sellPaused', type: 'bool' },
          {
            name: 'curveConfig',
            type: 'tuple',
            components: [
              { name: 'initialPriceX18', type: 'uint256' },
              { name: 'targetPriceX18', type: 'uint256' },
              { name: 'targetSupply', type: 'uint256' },
              { name: 'graduationMarketCap', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const

const LIQUIDITY_MANAGER_ABI = [
  {
    type: 'function',
    name: 'addLiquidity',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'minTokenAmount', type: 'uint256' },
      { name: 'minEthAmount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getLiquidityInfo',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'liquidityTokenAmount', type: 'uint256' },
      { name: 'liquidityEthAmount', type: 'uint256' },
      { name: 'uniswapPair', type: 'address' },
      { name: 'liquidityTokens', type: 'uint256' },
      { name: 'liquidityAdded', type: 'bool' },
      { name: 'liquidityLocked', type: 'bool' },
      { name: 'addedAt', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
] as const

const DEFAULT_ADD_LIQUIDITY_SLIPPAGE_BPS = 100n
const BPS_DENOMINATOR = 10_000n
const INVALID_STAGE_ERROR_SELECTOR = '0xe82a5329'
const FINALIZE_LOCK_KEY_PREFIX = 'liquidity-monitor:finalize'
const FINALIZE_LOCK_TTL_MS = 2 * 60 * 1000
let lastFinalizeLockWarningAt = 0

function getAddLiquiditySlippageBps(): bigint {
  try {
    const configured = BigInt(process.env.LIQUIDITY_ADD_SLIPPAGE_BPS ?? '')
    if (configured >= 0n && configured < BPS_DENOMINATOR) {
      return configured
    }
  } catch {
    // Use the default below.
  }
  return DEFAULT_ADD_LIQUIDITY_SLIPPAGE_BPS
}

function calculateMinAmount(amount: bigint, slippageBps: bigint): bigint {
  if (amount <= 0n) return 0n
  if (slippageBps <= 0n) return amount
  return amount - (amount * slippageBps) / BPS_DENOMINATOR
}

function collectErrorText(error: unknown, seen = new Set<unknown>()): string {
  if (error === null || error === undefined || seen.has(error)) {
    return ''
  }
  seen.add(error)

  if (typeof error === 'string') return error
  if (typeof error !== 'object') return String(error)

  const record = error as Record<string, unknown>
  return [
    record.name,
    record.shortMessage,
    record.details,
    record.message,
    record.data,
    record.cause ? collectErrorText(record.cause, seen) : '',
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')
}

function isInvalidStageError(error: unknown): boolean {
  const text = collectErrorText(error).toLowerCase()
  return text.includes('invalidstage') || text.includes(INVALID_STAGE_ERROR_SELECTOR)
}

function isGraduationProgressedStage(stage: number): boolean {
  return stage === MARKET_STAGE.LIQUIDITY_PENDING || stage === MARKET_STAGE.DEX_LIVE
}

function warnFinalizeLockFallback(error: unknown): void {
  const now = Date.now()
  if (now - lastFinalizeLockWarningAt < 60_000) return
  lastFinalizeLockWarningAt = now
  console.warn('Redis graduation finalize lock failed; falling back to process-local coordination:', error)
}

interface FinalizeLock {
  acquired: boolean
  owner: string | null
}

export class LiquidityMonitor {
  public isMonitoring = false
  private readonly liquidityManagerAddress: `0x${string}`
  private readonly factoryAddress?: `0x${string}`
  private unwatch: Array<() => void> = []
  private inFlight = new Set<string>()
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  private isSweeping = false

  constructor(liquidityManagerAddress: `0x${string}`, factoryAddress?: `0x${string}`) {
    this.liquidityManagerAddress = liquidityManagerAddress
    this.factoryAddress = factoryAddress
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return
    this.isMonitoring = true

    this.unwatch.push(
      viemClient.watchEvent({
        address: this.liquidityManagerAddress,
        event: graduationRegisteredEvent,
        onLogs: (logs) => {
          for (const log of logs) {
            const token = log.args.token
            if (token) void this.autoAddLiquidity(token)
          }
        },
      }),
      viemClient.watchEvent({
        address: this.liquidityManagerAddress,
        event: liquidityAddedEvent,
        onLogs: (logs) => {
          for (const log of logs) {
            console.log('Formal liquidity added', {
              token: log.args.token,
              market: log.args.market,
              pair: log.args.pair,
              transactionHash: log.transactionHash,
            })
          }
        },
      }),
    )

    void this.sweepGraduationCandidates()
    this.sweepTimer = setInterval(() => {
      void this.sweepGraduationCandidates()
    }, 5_000)

    console.log(
      `Formal liquidity keeper active (manager=${this.liquidityManagerAddress}, ` +
        `wallet=${walletClient.account?.address ?? 'read-only'})`,
    )
  }

  stopMonitoring(): void {
    for (const unwatch of this.unwatch) unwatch()
    this.unwatch = []
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer)
      this.sweepTimer = null
    }
    this.isMonitoring = false
  }

  private async getGraduationCandidateTokens(): Promise<Array<`0x${string}`>> {
    if (!postgresPool) return []

    const result = await postgresPool.query<{ token_address: string }>(
      `select token_address
       from token_markets
       where chain_id = $1
         and stage <> 'dex_live'
       order by updated_at desc
       limit 100`,
      [viemClient.chain.id],
    )

    return result.rows
      .map((row) => row.token_address)
      .filter((tokenAddress): tokenAddress is `0x${string}` => /^0x[a-fA-F0-9]{40}$/.test(tokenAddress))
  }

  private async sweepGraduationCandidates(): Promise<void> {
    if (!walletClient.account || this.isSweeping) return
    this.isSweeping = true

    try {
      const tokenAddresses = await this.getGraduationCandidateTokens()
      for (const tokenAddress of tokenAddresses) {
        const token = tokenAddress.toLowerCase()
        if (this.inFlight.has(token)) continue

        try {
          const marketAddress = await this.resolveMarket(tokenAddress)
          const stage = await this.getMarketStage(marketAddress)
          if (isGraduationCandidateStage(stage)) {
            console.log('Graduation candidate detected; finalizing automatically', {
              tokenAddress,
              marketAddress,
              stage,
            })
            await this.finalizeGraduation(tokenAddress)
          }
        } catch (error) {
          console.error('Graduation candidate sweep failed:', {
            tokenAddress,
            error,
          })
        }
      }
    } finally {
      this.isSweeping = false
    }
  }

  private async autoAddLiquidity(tokenAddress: `0x${string}`): Promise<void> {
    const token = tokenAddress.toLowerCase()
    if (!walletClient.account || this.inFlight.has(token)) return
    this.inFlight.add(token)

    try {
      await this.addLiquidityUnlocked(tokenAddress)
    } catch (error) {
      console.error('Formal liquidity keeper failed; permissionless path remains available:', error)
    } finally {
      this.inFlight.delete(token)
    }
  }

  private async addLiquidityUnlocked(tokenAddress: `0x${string}`): Promise<void> {
    if (!walletClient.account) {
      throw new Error('Wallet private key is not configured. Cannot finalize liquidity.')
    }

    const info = await this.getLiquidityInfo(tokenAddress)
    if (info.liquidityAdded) return

    const slippageBps = getAddLiquiditySlippageBps()
    const minTokenAmount = calculateMinAmount(info.liquidityTokenAmount, slippageBps)
    const minEthAmount = calculateMinAmount(info.liquidityEthAmount, slippageBps)
    const contract = getContract({
      address: this.liquidityManagerAddress,
      abi: LIQUIDITY_MANAGER_ABI,
      client: walletClient,
    })
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)
    const txHash = await contract.write.addLiquidity([
      tokenAddress,
      minTokenAmount,
      minEthAmount,
      deadline,
    ], { account: walletClient.account })
    const receipt = await viemClient.waitForTransactionReceipt({ hash: txHash })
    if (receipt.status !== 'success') {
      throw new Error(`addLiquidity transaction ${txHash} reverted`)
    }
    console.log('Permissionless graduation finalized', {
      tokenAddress,
      txHash,
      slippageBps: slippageBps.toString(),
    })
  }

  private async resolveMarket(tokenAddress: `0x${string}`): Promise<`0x${string}`> {
    if (!this.factoryAddress) {
      throw new Error('MEME_FACTORY_ADDRESS is not configured. Cannot resolve market.')
    }

    const factory = getContract({
      address: this.factoryAddress,
      abi: MEME_FACTORY_ABI,
      client: viemClient,
    })
    const market = await factory.read.marketOf([tokenAddress])
    if (!market || /^0x0{40}$/i.test(market)) {
      throw new Error(`Token market not found for ${tokenAddress}`)
    }
    return market
  }

  private async getMarketStage(marketAddress: `0x${string}`): Promise<number> {
    const market = getContract({
      address: marketAddress,
      abi: TOKEN_MARKET_ABI,
      client: viemClient,
    })
    const state = await market.read.getMarketState()
    return Number(state.stage)
  }

  private async prepareGraduation(tokenAddress: `0x${string}`): Promise<void> {
    if (!walletClient.account) return
    const marketAddress = await this.resolveMarket(tokenAddress)
    const stage = await this.getMarketStage(marketAddress)

    if (stage === MARKET_STAGE.DEX_LIVE) return
    if (stage === MARKET_STAGE.LIQUIDITY_PENDING) return
    if (stage !== MARKET_STAGE.GRADUATION_PENDING) {
      throw new Error(`Token market is not ready for graduation. Current stage: ${stage}`)
    }

    const market = getContract({
      address: marketAddress,
      abi: TOKEN_MARKET_ABI,
      client: walletClient,
    })
    let txHash: `0x${string}`
    try {
      txHash = await market.write.prepareGraduation({ account: walletClient.account })
    } catch (error) {
      if (!isInvalidStageError(error)) {
        throw error
      }

      const latestStage = await this.getMarketStage(marketAddress)
      if (isGraduationProgressedStage(latestStage)) {
        console.log('Graduation preparation already progressed by another worker', {
          tokenAddress,
          marketAddress,
          stage: latestStage,
        })
        return
      }

      throw error
    }
    const receipt = await viemClient.waitForTransactionReceipt({ hash: txHash })
    if (receipt.status !== 'success') {
      throw new Error(`prepareGraduation transaction ${txHash} reverted`)
    }
    console.log('Graduation prepared', { tokenAddress, marketAddress, txHash })
  }

  private async getLiquidityInfo(tokenAddress: `0x${string}`) {
    const contract = getContract({
      address: this.liquidityManagerAddress,
      abi: LIQUIDITY_MANAGER_ABI,
      client: viemClient,
    })
    const result = await contract.read.getLiquidityInfo([tokenAddress])
    return {
      liquidityTokenAmount: result[0],
      liquidityEthAmount: result[1],
      liquidityAdded: result[4],
    }
  }

  private async acquireFinalizeLock(tokenKey: string): Promise<FinalizeLock> {
    const owner = randomUUID()
    try {
      const result = await redis.set(
        `${FINALIZE_LOCK_KEY_PREFIX}:${tokenKey}`,
        owner,
        'PX',
        FINALIZE_LOCK_TTL_MS,
        'NX',
      )
      return {
        acquired: result === 'OK',
        owner: result === 'OK' ? owner : null,
      }
    } catch (error) {
      warnFinalizeLockFallback(error)
      return { acquired: true, owner: null }
    }
  }

  private async releaseFinalizeLock(tokenKey: string, owner: string | null): Promise<void> {
    if (!owner) return
    try {
      await redis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then
           return redis.call("del", KEYS[1])
         else
           return 0
         end`,
        1,
        `${FINALIZE_LOCK_KEY_PREFIX}:${tokenKey}`,
        owner,
      )
    } catch (error) {
      warnFinalizeLockFallback(error)
    }
  }

  async finalizeGraduation(tokenAddress: `0x${string}`): Promise<void> {
    const token = tokenAddress.toLowerCase()
    if (!walletClient.account || this.inFlight.has(token)) return
    this.inFlight.add(token)
    const lock = await this.acquireFinalizeLock(token)
    if (!lock.acquired) {
      this.inFlight.delete(token)
      console.log('Graduation finalize skipped because another worker holds the lock', {
        tokenAddress,
      })
      return
    }

    try {
      await this.prepareGraduation(tokenAddress)
      await this.addLiquidityUnlocked(tokenAddress)
    } finally {
      await this.releaseFinalizeLock(token, lock.owner)
      this.inFlight.delete(token)
    }
  }

  async manualAddLiquidity(tokenAddress: `0x${string}`): Promise<void> {
    await this.finalizeGraduation(tokenAddress)
  }

  async sweepMarketResiduals(
    marketAddress: `0x${string}`,
    tokenRecipient: `0x${string}`,
    ethRecipient: `0x${string}`,
  ): Promise<void> {
    if (!this.factoryAddress) {
      throw new Error('MEME_FACTORY_ADDRESS is not configured. Cannot sweep market residuals.')
    }
    await sweepMarketResidualsWithFactory(
      this.factoryAddress,
      marketAddress,
      tokenRecipient,
      ethRecipient,
    )
  }

  getAccountInfo() {
    return {
      address: walletClient.account?.address ?? null,
      hasPrivateKey: Boolean(walletClient.account),
      canExecuteTransactions: Boolean(walletClient.account),
    }
  }
}

export function createLiquidityMonitor(
  liquidityManagerAddress: `0x${string}`,
  factoryAddress?: `0x${string}`,
): LiquidityMonitor {
  return new LiquidityMonitor(liquidityManagerAddress, factoryAddress)
}

export async function sweepMarketResidualsWithFactory(
  factoryAddress: `0x${string}`,
  marketAddress: `0x${string}`,
  tokenRecipient: `0x${string}`,
  ethRecipient: `0x${string}`,
): Promise<void> {
  if (!walletClient.account) {
    throw new Error('Wallet private key is not configured. Cannot sweep residuals.')
  }

  const factory = getContract({
    address: factoryAddress,
    abi: MEME_FACTORY_ABI,
    client: walletClient,
  })
  const txHash = await factory.write.sweepMarketResiduals(
    [marketAddress, tokenRecipient, ethRecipient],
    { account: walletClient.account },
  )
  const receipt = await viemClient.waitForTransactionReceipt({ hash: txHash })
  if (receipt.status !== 'success') {
    throw new Error(`sweepMarketResiduals transaction ${txHash} reverted`)
  }

  console.log('Graduation residuals swept', {
    marketAddress,
    tokenRecipient,
    ethRecipient,
    txHash,
  })
}
