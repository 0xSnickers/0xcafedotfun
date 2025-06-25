import { Router, Request, Response } from 'express'
import { createLiquidityMonitor } from '../services/liquidityMonitor'

const router = Router()

// 全局监控器实例存储
let globalMonitor: any = null
// GET  /api/monitor/status     # 检查监控器状态
// POST /api/monitor/manual     # 手动添加流动性
// POST /api/monitor/start      # 启动监控器
// POST /api/monitor/stop       # 停止监控器
// POST /api/monitor/restart    # 重启监控器
/**
 * 获取监控器状态
 * GET /api/monitor/status
 */
router.get('/status', async (req: any, res: any) => {
    try {
        const bondingCurveAddress = process.env.BONDING_CURVE_ADDRESS
        const liquidityManagerAddress = process.env.LIQUIDITY_MANAGER_ADDRESS
        const privateKeyLocal = process.env.PRIVATE_KEY_LOCAL

        // 获取账户信息
        let accountInfo = null
        if (globalMonitor) {
            accountInfo = globalMonitor.getAccountInfo()
        }

        const status = {
            isActive: !!globalMonitor,
            isMonitoring: globalMonitor?.isMonitoring || false,
            contractAddresses: {
                bondingCurve: bondingCurveAddress || null,
                liquidityManager: liquidityManagerAddress || null
            },
            configurationStatus: {
                hasRequiredAddresses: !!(bondingCurveAddress && liquidityManagerAddress),
                hasPrivateKey: !!privateKeyLocal,
                canExecuteTransactions: accountInfo?.canExecuteTransactions || false
            },
            accountInfo: accountInfo || {
                address: null,
                hasPrivateKey: !!privateKeyLocal,
                canExecuteTransactions: false
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
 * 手动为特定代币添加流动性
 * POST /api/monitor/manual
 * Body: { tokenAddress: "0x..." }
 */
router.post('/manual', async (req: any, res: any) => {
    try {
        const { tokenAddress } = req.body

        if (!tokenAddress) {
            return res.status(400).json({
                success: false,
                error: 'Token address is required'
            })
        }

        if (!globalMonitor) {
            return res.status(400).json({
                success: false,
                error: 'Liquidity monitor is not active'
            })
        }

        // 检查是否配置了私钥
        if (!process.env.PRIVATE_KEY_LOCAL) {
            return res.status(400).json({
                success: false,
                error: 'PRIVATE_KEY_LOCAL not configured. Cannot execute transactions.'
            })
        }

        console.log(`🔧 Manual liquidity addition requested for token: ${tokenAddress}`)

        // 调用手动添加流动性
        await globalMonitor.manualAddLiquidity(tokenAddress as `0x${string}`)

        res.json({
            success: true,
            message: `Manual liquidity addition initiated for token ${tokenAddress}`,
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
 * 重启监控器
 * POST /api/monitor/restart
 */
router.post('/restart', async (req: any, res: any) => {
    try {
        const bondingCurveAddress = process.env.BONDING_CURVE_ADDRESS as `0x${string}`
        const liquidityManagerAddress = process.env.LIQUIDITY_MANAGER_ADDRESS as `0x${string}`

        if (!bondingCurveAddress || !liquidityManagerAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing required environment variables: BONDING_CURVE_ADDRESS, LIQUIDITY_MANAGER_ADDRESS'
            })
        }

        // 停止现有监控器
        if (globalMonitor) {
            console.log('🛑 Stopping existing monitor...')
            globalMonitor.stopMonitoring()
        }

        // 创建新的监控器
        console.log('🔄 Creating new monitor...')
        globalMonitor = createLiquidityMonitor(bondingCurveAddress, liquidityManagerAddress)
        await globalMonitor.startMonitoring()

        console.log('✅ Monitor restarted successfully')

        res.json({
            success: true,
            message: 'Liquidity monitor restarted successfully',
            data: {
                bondingCurveAddress,
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
router.post('/stop', async (req: any, res: any) => {
    try {
        if (!globalMonitor) {
            return res.json({
                success: true,
                message: 'Monitor is already stopped'
            })
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
router.post('/start', async (req: any, res: any) => {
    try {
        if (globalMonitor) {
            return res.status(400).json({
                success: false,
                error: 'Monitor is already running'
            })
        }

        const bondingCurveAddress = process.env.BONDING_CURVE_ADDRESS as `0x${string}`
        const liquidityManagerAddress = process.env.LIQUIDITY_MANAGER_ADDRESS as `0x${string}`

        if (!bondingCurveAddress || !liquidityManagerAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing required environment variables: BONDING_CURVE_ADDRESS, LIQUIDITY_MANAGER_ADDRESS'
            })
        }

        console.log('🚀 Starting monitor via API...')
        globalMonitor = createLiquidityMonitor(bondingCurveAddress, liquidityManagerAddress)
        await globalMonitor.startMonitoring()

        console.log('✅ Monitor started successfully')

        res.json({
            success: true,
            message: 'Liquidity monitor started successfully',
            data: {
                bondingCurveAddress,
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

export default router 