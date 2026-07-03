import { Router, Request, Response } from 'express'
import { isAddress } from 'viem'
import { walletClient } from '../clients/viemClient'
import {
    createLiquidityMonitor,
    sweepMarketResidualsWithFactory,
} from '../services/liquidityMonitor'
import {
    getBackendEnvironment,
    getMonitorAdminKey,
    isMainnetEnvironment,
} from '../config/environment'
import { redis } from '../clients/redisClient'

const router = Router()
const ADMIN_HEADER = 'x-admin-key'
const FINALIZE_IN_FLIGHT_TTL_MS = 2 * 60 * 1000
const FINALIZE_RECENT_SUCCESS_TTL_MS = 5 * 60 * 1000
const FINALIZE_RATE_LIMIT_WINDOW_MS = 60 * 1000
const DEFAULT_FINALIZE_RATE_LIMIT_PER_MINUTE = 10
const DEFAULT_PUBLIC_FINALIZE_QUEUE_LIMIT = 100
const FINALIZE_REDIS_COORDINATION_TTL_MS = 10 * 60 * 1000
const FINALIZE_REDIS_KEY_PREFIX = 'monitor:public-finalize'

// 全局监控器实例存储
let globalMonitor: any = null
const finalizeInFlight = new Map<string, { startedAt: number }>()
const recentlyFinalized = new Map<string, { completedAt: number }>()
const finalizeRateLimits = new Map<string, number[]>()
const publicFinalizeQueue = new Map<string, { tokenAddress: `0x${string}`; queuedAt: number }>()
let publicFinalizeWorkerScheduled = false
let publicFinalizeWorkerRunning = false
let lastFinalizeRedisWarningAt = 0

type MonitorRouteDeps = {
    hasWalletAccount(): boolean
    getWalletAddress(): string | null
    sweepMarketResiduals(
        factoryAddress: `0x${string}`,
        marketAddress: `0x${string}`,
        tokenRecipient: `0x${string}`,
        ethRecipient: `0x${string}`,
    ): Promise<void>
}

const defaultRouteDeps: MonitorRouteDeps = {
    hasWalletAccount: () => Boolean(walletClient.account),
    getWalletAddress: () => walletClient.account?.address ?? null,
    sweepMarketResiduals: sweepMarketResidualsWithFactory,
}

let routeDeps: MonitorRouteDeps = defaultRouteDeps

function isLoopbackAddress(value: string | undefined): boolean {
    if (!value) return false
    const normalized = value.toLowerCase()
    return (
        normalized === '127.0.0.1' ||
        normalized === '::1' ||
        normalized === '::ffff:127.0.0.1' ||
        normalized === 'localhost'
    )
}

function isLocalRequest(req: Request): boolean {
    return (
        isLoopbackAddress(req.ip) ||
        isLoopbackAddress(req.socket.remoteAddress) ||
        isLoopbackAddress(req.hostname)
    )
}

function canAllowUnauthenticatedLocalRequest(req: Request): boolean {
    const { appEnv } = getBackendEnvironment()
    return (
        appEnv === 'local' &&
        process.env.MONITOR_ALLOW_UNAUTH_LOCAL === 'true' &&
        isLocalRequest(req)
    )
}

function isAuthorizedAdminRequest(req: Request): boolean {
    const adminKey = getMonitorAdminKey()
    if (!adminKey) {
        if (canAllowUnauthenticatedLocalRequest(req)) {
            console.warn('Monitor admin endpoint is allowing unauthenticated localhost access because MONITOR_ALLOW_UNAUTH_LOCAL=true')
            return true
        }
        return false
    }

    return (
        req.header(ADMIN_HEADER) === adminKey ||
        req.header('authorization') === `Bearer ${adminKey}`
    )
}

function requireMonitorAdmin(req: Request, res: Response): boolean {
    if (isAuthorizedAdminRequest(req)) {
        return true
    }

    res.status(401).json({
        success: false,
        error: 'Unauthorized monitor request'
    })
    return false
}

function requireFinalizeAccess(req: Request, res: Response): boolean {
    if (isPublicFinalizeEnabled()) {
        return true
    }
    return requireMonitorAdmin(req, res)
}

function isPublicFinalizeEnabled(): boolean {
    if (process.env.MONITOR_PUBLIC_FINALIZE !== 'true') return false
    const { appEnv } = getBackendEnvironment()
    if (isMainnetEnvironment(appEnv) && process.env.MONITOR_PUBLIC_FINALIZE_MAINNET_CONFIRM !== 'true') {
        return false
    }
    return true
}

function getFinalizeRateLimitPerMinute(): number {
    const configured = Number(process.env.MONITOR_PUBLIC_FINALIZE_RATE_LIMIT_PER_MINUTE)
    if (Number.isFinite(configured) && configured >= 0) {
        return configured
    }
    return DEFAULT_FINALIZE_RATE_LIMIT_PER_MINUTE
}

function getPublicFinalizeQueueLimit(): number {
    const configured = Number(process.env.MONITOR_PUBLIC_FINALIZE_QUEUE_LIMIT)
    if (Number.isFinite(configured) && configured > 0) {
        return Math.floor(configured)
    }
    return DEFAULT_PUBLIC_FINALIZE_QUEUE_LIMIT
}

function getPublicFinalizeCoordinationStore(): 'memory' | 'redis' {
    return process.env.MONITOR_PUBLIC_FINALIZE_COORDINATION === 'redis'
        ? 'redis'
        : 'memory'
}

function getFinalizeRedisKey(tokenKey: string): string {
    return `${FINALIZE_REDIS_KEY_PREFIX}:${tokenKey}`
}

function warnFinalizeRedisFallback(error: unknown): void {
    const now = Date.now()
    if (now - lastFinalizeRedisWarningAt < 60_000) return
    lastFinalizeRedisWarningAt = now
    console.warn('Redis public finalize coordination failed; falling back to in-memory coordination:', error)
}

async function claimRedisFinalizeToken(tokenKey: string): Promise<boolean | null> {
    if (getPublicFinalizeCoordinationStore() !== 'redis') return null
    try {
        const result = await redis.set(
            getFinalizeRedisKey(tokenKey),
            'queued',
            'PX',
            FINALIZE_REDIS_COORDINATION_TTL_MS,
            'NX',
        )
        return result === 'OK'
    } catch (error) {
        warnFinalizeRedisFallback(error)
        return null
    }
}

async function setRedisFinalizeState(
    tokenKey: string,
    state: 'processing' | 'finalized',
    ttlMs: number,
): Promise<void> {
    if (getPublicFinalizeCoordinationStore() !== 'redis') return
    try {
        await redis.set(getFinalizeRedisKey(tokenKey), state, 'PX', ttlMs)
    } catch (error) {
        warnFinalizeRedisFallback(error)
    }
}

async function releaseRedisFinalizeToken(tokenKey: string): Promise<void> {
    if (getPublicFinalizeCoordinationStore() !== 'redis') return
    try {
        await redis.del(getFinalizeRedisKey(tokenKey))
    } catch (error) {
        warnFinalizeRedisFallback(error)
    }
}

function getFinalizeRateLimitKey(req: Request): string {
    const forwardedFor = req.header('x-forwarded-for')?.split(',')[0]?.trim()
    return forwardedFor || req.ip || req.socket.remoteAddress || 'unknown'
}

function isFinalizeRateLimited(req: Request): boolean {
    if (!isPublicFinalizeEnabled()) return false
    if (getBackendEnvironment().appEnv === 'local') return false

    const limit = getFinalizeRateLimitPerMinute()
    if (limit === 0) return false

    const now = Date.now()
    const key = getFinalizeRateLimitKey(req)
    const recentRequests = (finalizeRateLimits.get(key) ?? [])
        .filter((timestamp) => now - timestamp < FINALIZE_RATE_LIMIT_WINDOW_MS)

    if (recentRequests.length >= limit) {
        finalizeRateLimits.set(key, recentRequests)
        return true
    }

    recentRequests.push(now)
    finalizeRateLimits.set(key, recentRequests)
    return false
}

function pruneFinalizeState(token: string): void {
    const now = Date.now()
    const inFlight = finalizeInFlight.get(token)
    if (inFlight && now - inFlight.startedAt > FINALIZE_IN_FLIGHT_TTL_MS) {
        finalizeInFlight.delete(token)
    }

    const recentSuccess = recentlyFinalized.get(token)
    if (recentSuccess && now - recentSuccess.completedAt > FINALIZE_RECENT_SUCCESS_TTL_MS) {
        recentlyFinalized.delete(token)
    }
}

async function processPublicFinalizeQueue(): Promise<void> {
    if (publicFinalizeWorkerRunning) return
    publicFinalizeWorkerScheduled = false
    publicFinalizeWorkerRunning = true

    try {
        while (publicFinalizeQueue.size > 0) {
            const nextJob = publicFinalizeQueue.entries().next().value as
                | [string, { tokenAddress: `0x${string}`; queuedAt: number }]
                | undefined
            if (!nextJob) break
            const [tokenKey, job] = nextJob
            publicFinalizeQueue.delete(tokenKey)
            pruneFinalizeState(tokenKey)

            if (recentlyFinalized.has(tokenKey)) {
                console.log('Public finalize queue skipped recently finalized token', {
                    tokenAddress: job.tokenAddress,
                })
                continue
            }

            if (finalizeInFlight.has(tokenKey)) {
                publicFinalizeQueue.set(tokenKey, job)
                break
            }

            if (!globalMonitor || !routeDeps.hasWalletAccount()) {
                console.warn('Public finalize queue dropped job because monitor wallet is unavailable', {
                    tokenAddress: job.tokenAddress,
                    hasMonitor: Boolean(globalMonitor),
                    hasWallet: routeDeps.hasWalletAccount(),
                })
                await releaseRedisFinalizeToken(tokenKey)
                continue
            }

            finalizeInFlight.set(tokenKey, { startedAt: Date.now() })
            try {
                await setRedisFinalizeState(tokenKey, 'processing', FINALIZE_REDIS_COORDINATION_TTL_MS)
                console.log('Public finalize worker executing queued token', {
                    tokenAddress: job.tokenAddress,
                    queuedMs: Date.now() - job.queuedAt,
                })
                await globalMonitor.finalizeGraduation(job.tokenAddress)
                recentlyFinalized.set(tokenKey, { completedAt: Date.now() })
                await setRedisFinalizeState(tokenKey, 'finalized', FINALIZE_RECENT_SUCCESS_TTL_MS)
                console.log('Public finalize worker completed token', {
                    tokenAddress: job.tokenAddress,
                })
            } catch (error) {
                await releaseRedisFinalizeToken(tokenKey)
                console.error('Public finalize worker failed token:', {
                    tokenAddress: job.tokenAddress,
                    error,
                })
            } finally {
                finalizeInFlight.delete(tokenKey)
            }
        }
    } finally {
        publicFinalizeWorkerRunning = false
        if (publicFinalizeQueue.size > 0) {
            schedulePublicFinalizeWorker()
        }
    }
}

function schedulePublicFinalizeWorker(): void {
    if (publicFinalizeWorkerScheduled || publicFinalizeWorkerRunning) return
    publicFinalizeWorkerScheduled = true
    setTimeout(() => {
        void processPublicFinalizeQueue()
    }, 0)
}

async function enqueuePublicFinalize(tokenAddress: `0x${string}`, res: Response): Promise<void> {
    const tokenKey = tokenAddress.toLowerCase()
    pruneFinalizeState(tokenKey)

    if (recentlyFinalized.has(tokenKey)) {
        res.json({
            success: true,
            status: 'already_finalized',
            message: `Graduation was recently finalized for token ${tokenAddress}`,
            data: { tokenAddress }
        })
        return
    }

    if (finalizeInFlight.has(tokenKey) || publicFinalizeQueue.has(tokenKey)) {
        res.status(202).json({
            success: true,
            status: 'already_processing',
            message: `Graduation finalize is already queued or processing for token ${tokenAddress}`,
            data: { tokenAddress }
        })
        return
    }

    const redisClaimed = await claimRedisFinalizeToken(tokenKey)
    if (redisClaimed === false) {
        res.status(202).json({
            success: true,
            status: 'already_processing',
            message: `Graduation finalize is already queued or processing for token ${tokenAddress}`,
            data: { tokenAddress }
        })
        return
    }

    if (!globalMonitor || !routeDeps.hasWalletAccount()) {
        await releaseRedisFinalizeToken(tokenKey)
        res.status(503).json({
            success: false,
            status: 'worker_unavailable',
            error: 'Finalize worker is not available'
        })
        return
    }

    const queueLimit = getPublicFinalizeQueueLimit()
    if (publicFinalizeQueue.size >= queueLimit) {
        await releaseRedisFinalizeToken(tokenKey)
        res.status(429).json({
            success: false,
            status: 'queue_full',
            error: 'Finalize queue is full'
        })
        return
    }

    publicFinalizeQueue.set(tokenKey, { tokenAddress, queuedAt: Date.now() })
    schedulePublicFinalizeWorker()
    res.status(202).json({
        success: true,
        status: 'accepted',
        message: `Graduation finalize queued for token ${tokenAddress}`,
        data: {
            tokenAddress,
            queueSize: publicFinalizeQueue.size,
        }
    })
}

function getValidatedAddress(
    req: Request,
    res: Response,
    fieldName: string,
    label: string,
): `0x${string}` | null {
    const value = req.body?.[fieldName]
    if (typeof value !== 'string' || !isAddress(value)) {
        res.status(400).json({
            success: false,
            error: `Valid ${label} is required`
        })
        return null
    }

    return value as `0x${string}`
}

function getValidatedTokenAddress(req: Request, res: Response): `0x${string}` | null {
    return getValidatedAddress(req, res, 'tokenAddress', 'token address')
}

function getValidatedMarketAddress(req: Request, res: Response): `0x${string}` | null {
    return getValidatedAddress(req, res, 'marketAddress', 'market address')
}

function getValidatedTokenRecipient(req: Request, res: Response): `0x${string}` | null {
    return getValidatedAddress(req, res, 'tokenRecipient', 'token recipient address')
}

function getValidatedEthRecipient(req: Request, res: Response): `0x${string}` | null {
    return getValidatedAddress(req, res, 'ethRecipient', 'ETH recipient address')
}
// GET  /api/monitor/status     # 检查监控器状态
// POST /api/monitor/finalize   # 自动完成毕业迁移
// POST /api/monitor/manual     # 兼容旧入口，实际也会自动完成毕业迁移
// POST /api/monitor/start      # 启动监控器
// POST /api/monitor/stop       # 停止监控器
// POST /api/monitor/restart    # 重启监控器
/**
 * 获取监控器状态
 * GET /api/monitor/status
 */
router.get('/status', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!requireMonitorAdmin(req, res)) return

        const liquidityManagerAddress = process.env.LIQUIDITY_MANAGER_ADDRESS
        const factoryAddress = process.env.MEME_FACTORY_ADDRESS
        const hasWalletAccount = routeDeps.hasWalletAccount()

        // 获取账户信息
        let accountInfo = null
        if (globalMonitor) {
            accountInfo = globalMonitor.getAccountInfo()
        }

        const status = {
            isActive: !!globalMonitor,
            isMonitoring: globalMonitor?.isMonitoring || false,
            publicFinalizeEnabled: isPublicFinalizeEnabled(),
            publicFinalizeQueue: {
                queued: publicFinalizeQueue.size,
                workerRunning: publicFinalizeWorkerRunning,
                coordination: getPublicFinalizeCoordinationStore(),
            },
            contractAddresses: {
                liquidityManager: liquidityManagerAddress || null,
                memeFactory: factoryAddress || null
            },
            configurationStatus: {
                hasRequiredAddresses: !!liquidityManagerAddress,
                hasFactoryAddress: !!factoryAddress,
                hasPrivateKey: hasWalletAccount,
                canExecuteTransactions: accountInfo?.canExecuteTransactions || false
            },
            accountInfo: accountInfo || {
                address: routeDeps.getWalletAddress(),
                hasPrivateKey: hasWalletAccount,
                canExecuteTransactions: hasWalletAccount
            }
        }

        res.json({
            success: true,
            data: status
        })
    } catch (error) {
        console.error('❌ Error getting monitor status:', error)
        res.status(500).json({
            success: false,
            error: 'Failed to get monitor status'
        })
    }
})

/**
 * 兼容旧入口：为特定代币完成毕业迁移
 * POST /api/monitor/manual
 * Body: { tokenAddress: "0x..." }
 */
router.post('/manual', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!requireMonitorAdmin(req, res)) return

        const tokenAddress = getValidatedTokenAddress(req, res)
        if (!tokenAddress) return

        if (!globalMonitor) {
            res.status(400).json({
                success: false,
                error: 'Liquidity monitor is not active'
            })
            return
        }

        // 检查是否配置了私钥
        if (!routeDeps.hasWalletAccount()) {
            res.status(400).json({
                success: false,
                error: 'Private key for the selected chain is not configured. Cannot execute transactions.'
            })
            return
        }

        console.log(`🔧 Legacy manual finalize requested for token: ${tokenAddress}`)

        // 调用手动添加流动性
        await globalMonitor.manualAddLiquidity(tokenAddress)

        res.json({
            success: true,
            message: `Graduation finalized for token ${tokenAddress}`,
            data: {
                tokenAddress,
                account: globalMonitor.getAccountInfo().address
            }
        })

    } catch (error) {
        console.error('❌ Error in manual liquidity addition:', error)
        res.status(500).json({
            success: false,
            error: 'Failed to add liquidity manually',
            details: error instanceof Error ? error.message : 'Unknown error'
        })
    }
})

/**
 * 自动完成毕业流程：prepareGraduation + addLiquidity
 * POST /api/monitor/finalize
 * Body: { tokenAddress: "0x..." }
 */
router.post('/finalize', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!requireFinalizeAccess(req, res)) return
        const isAdminFinalize = isAuthorizedAdminRequest(req)

        const tokenAddress = getValidatedTokenAddress(req, res)
        if (!tokenAddress) return

        if (!isAdminFinalize && isFinalizeRateLimited(req)) {
            res.status(429).json({
                success: false,
                status: 'rate_limited',
                error: 'Finalize request rate limit exceeded'
            })
            return
        }

        if (!isAdminFinalize && isPublicFinalizeEnabled()) {
            await enqueuePublicFinalize(tokenAddress, res)
            return
        }

        if (!globalMonitor) {
            res.status(400).json({
                success: false,
                error: 'Liquidity monitor is not active'
            })
            return
        }

        if (!routeDeps.hasWalletAccount()) {
            res.status(400).json({
                success: false,
                error: 'Private key for the selected chain is not configured. Cannot execute transactions.'
            })
            return
        }

        const tokenKey = tokenAddress.toLowerCase()
        pruneFinalizeState(tokenKey)

        if (finalizeInFlight.has(tokenKey)) {
            res.status(202).json({
                success: true,
                status: 'already_processing',
                message: `Graduation finalize is already processing for token ${tokenAddress}`,
                data: { tokenAddress }
            })
            return
        }

        if (recentlyFinalized.has(tokenKey)) {
            res.json({
                success: true,
                status: 'already_finalized',
                message: `Graduation was recently finalized for token ${tokenAddress}`,
                data: { tokenAddress }
            })
            return
        }

        console.log(`🚀 Finalizing graduation for token: ${tokenAddress}`)
        finalizeInFlight.set(tokenKey, { startedAt: Date.now() })
        try {
            await globalMonitor.finalizeGraduation(tokenAddress)
            recentlyFinalized.set(tokenKey, { completedAt: Date.now() })
        } finally {
            finalizeInFlight.delete(tokenKey)
        }

        res.json({
            success: true,
            status: 'accepted',
            message: `Graduation finalized for token ${tokenAddress}`,
            data: {
                tokenAddress,
                account: globalMonitor.getAccountInfo().address
            }
        })
    } catch (error) {
        console.error('❌ Error finalizing graduation:', error)
        res.status(500).json({
            success: false,
            error: 'Failed to finalize graduation',
            details: error instanceof Error ? error.message : 'Unknown error'
        })
    }
})


/**
 * 清理毕业后的 residual token / ETH
 * POST /api/monitor/sweep
 * Body: { marketAddress: "0x...", tokenRecipient: "0x...", ethRecipient: "0x..." }
 */
router.post('/sweep', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!requireMonitorAdmin(req, res)) return

        const marketAddress = getValidatedMarketAddress(req, res)
        if (!marketAddress) return

        const tokenRecipient = getValidatedTokenRecipient(req, res)
        if (!tokenRecipient) return

        const ethRecipient = getValidatedEthRecipient(req, res)
        if (!ethRecipient) return

        const factoryAddress = process.env.MEME_FACTORY_ADDRESS as `0x${string}` | undefined
        if (!factoryAddress || !isAddress(factoryAddress)) {
            res.status(400).json({
                success: false,
                error: 'MEME_FACTORY_ADDRESS is not configured'
            })
            return
        }

        if (!routeDeps.hasWalletAccount()) {
            res.status(400).json({
                success: false,
                error: 'Private key for the selected chain is not configured. Cannot execute transactions.'
            })
            return
        }

        console.log(`🧹 Sweeping graduation residuals for market: ${marketAddress}`)
        await routeDeps.sweepMarketResiduals(factoryAddress, marketAddress, tokenRecipient, ethRecipient)

        res.json({
            success: true,
            message: `Graduation residuals swept for market ${marketAddress}`,
            data: {
                marketAddress,
                tokenRecipient,
                ethRecipient,
                account: routeDeps.getWalletAddress()
            }
        })
    } catch (error) {
        console.error('❌ Error sweeping graduation residuals:', error)
        res.status(500).json({
            success: false,
            error: 'Failed to sweep graduation residuals',
            details: error instanceof Error ? error.message : 'Unknown error'
        })
    }
})

/**
 * 重启监控器
 * POST /api/monitor/restart
 */
router.post('/restart', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!requireMonitorAdmin(req, res)) return

        const liquidityManagerAddress = process.env.LIQUIDITY_MANAGER_ADDRESS as `0x${string}`

        if (!liquidityManagerAddress) {
            res.status(400).json({
                success: false,
                error: 'Missing required environment variable: LIQUIDITY_MANAGER_ADDRESS'
            })
            return
        }

        // 停止现有监控器
        if (globalMonitor) {
            console.log('🛑 Stopping existing monitor...')
            globalMonitor.stopMonitoring()
        }

        // 创建新的监控器
        console.log('🔄 Creating new monitor...')
        const factoryAddress = process.env.MEME_FACTORY_ADDRESS as `0x${string}` | undefined
        globalMonitor = createLiquidityMonitor(liquidityManagerAddress, factoryAddress)
        await globalMonitor.startMonitoring()

        console.log('✅ Monitor restarted successfully')

        res.json({
            success: true,
            message: 'Liquidity monitor restarted successfully',
            data: {
                liquidityManagerAddress,
                accountInfo: globalMonitor.getAccountInfo()
            }
        })

    } catch (error) {
        console.error('❌ Error restarting monitor:', error)
        res.status(500).json({
            success: false,
            error: 'Failed to restart monitor',
            details: error instanceof Error ? error.message : 'Unknown error'
        })
    }
})

/**
 * 停止监控器
 * POST /api/monitor/stop
 */
router.post('/stop', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!requireMonitorAdmin(req, res)) return

        if (!globalMonitor) {
            res.json({
                success: true,
                message: 'Monitor is already stopped'
            })
            return
        }

        console.log('🛑 Stopping monitor via API...')
        globalMonitor.stopMonitoring()
        globalMonitor = null

        res.json({
            success: true,
            message: 'Liquidity monitor stopped successfully'
        })

    } catch (error) {
        console.error('❌ Error stopping monitor:', error)
        res.status(500).json({
            success: false,
            error: 'Failed to stop monitor',
            details: error instanceof Error ? error.message : 'Unknown error'
        })
    }
})

/**
 * 启动监控器
 * POST /api/monitor/start
 */
router.post('/start', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!requireMonitorAdmin(req, res)) return

        if (globalMonitor) {
            res.status(400).json({
                success: false,
                error: 'Monitor is already running'
            })
            return
        }

        const liquidityManagerAddress = process.env.LIQUIDITY_MANAGER_ADDRESS as `0x${string}`

        if (!liquidityManagerAddress) {
            res.status(400).json({
                success: false,
                error: 'Missing required environment variable: LIQUIDITY_MANAGER_ADDRESS'
            })
            return
        }

        console.log('🚀 Starting monitor via API...')
        const factoryAddress = process.env.MEME_FACTORY_ADDRESS as `0x${string}` | undefined
        globalMonitor = createLiquidityMonitor(liquidityManagerAddress, factoryAddress)
        await globalMonitor.startMonitoring()

        console.log('✅ Monitor started successfully')

        res.json({
            success: true,
            message: 'Liquidity monitor started successfully',
            data: {
                liquidityManagerAddress,
                accountInfo: globalMonitor.getAccountInfo()
            }
        })

    } catch (error) {
        console.error('❌ Error starting monitor:', error)
        res.status(500).json({
            success: false,
            error: 'Failed to start monitor',
            details: error instanceof Error ? error.message : 'Unknown error'
        })
    }
})

// 设置全局监控器实例（从 server.ts 调用）
export function setGlobalMonitor(monitor: any) {
    globalMonitor = monitor
}

export function setMonitorRouteDepsForTest(deps: Partial<MonitorRouteDeps>) {
    routeDeps = {
        ...defaultRouteDeps,
        ...deps,
    }
}

export function resetMonitorRouteStateForTest() {
    globalMonitor = null
    routeDeps = defaultRouteDeps
    finalizeInFlight.clear()
    recentlyFinalized.clear()
    finalizeRateLimits.clear()
    publicFinalizeQueue.clear()
    publicFinalizeWorkerScheduled = false
    publicFinalizeWorkerRunning = false
    lastFinalizeRedisWarningAt = 0
}

export default router 
