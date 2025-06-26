import { getStorageAt, getBondingCurveAddress, decodeAddressFromStorage, getGraduatedLiquidityData } from '../services/blockchain'
import { cacheUserPermit, getCachedUserPermit, delCachedUserPermit } from '../services/cache'
import { Request, Response, Router } from 'express'
import monitorRouter from './monitor'

const router = Router()

// 添加监控路由
router.use('/monitor', monitorRouter)

// ========================获取合约 slot 数据========================

/**
 * 通用 slot 读取接口
 * GET /getStorageAt/:address?slot=5
 */
router.get('/getStorageAt/:address', async (req: any, res: any) => {
    try {
    const address = req.params.address as `0x${string}`
        const slot = parseInt(req.query.slot as string, 10)
        
        if (isNaN(slot)) {
            return res.json({ 
                code: 1, 
                message: 'Invalid slot parameter. Must be a number.', 
                data: null 
            })
        }
        
    const data = await getStorageAt(address, slot)
        res.json({ 
            code: 0, 
            message: 'success', 
            data: data 
        })
    } catch (error: any) {
        res.json({ 
            code: 1, 
            message: error.message || 'Failed to read storage', 
            data: null 
        })
    }
})

/**
 * 获取 LiquidityManager 合约的 bondingCurve 地址 (slot 4)
 * GET /getBondingCurve/:liquidityManagerAddress
 */
router.get('/getBondingCurve/:liquidityManagerAddress', async (req: any, res: any) => {
    try {
        const liquidityManagerAddress = req.params.liquidityManagerAddress as `0x${string}`
        
        // 验证地址格式
        if (!liquidityManagerAddress.startsWith('0x') || liquidityManagerAddress.length !== 42) {
            return res.json({ 
                code: 1, 
                message: 'Invalid contract address format', 
                data: null 
            })
        }
        
        const bondingCurveAddress = await getBondingCurveAddress(liquidityManagerAddress)
        
        res.json({ 
            code: 0, 
            message: 'success', 
            data: {
                liquidityManager: liquidityManagerAddress,
                bondingCurve: bondingCurveAddress,
                slot: 4
            }
        })
    } catch (error: any) {
        res.json({ 
            code: 1, 
            message: error.message || 'Failed to get bondingCurve address', 
            data: null 
        })
    }
})

/**
 * 获取代币的流动性数据
 * GET /getLiquidityData/:liquidityManagerAddress/:tokenAddress
 */
router.get('/getLiquidityData/:liquidityManagerAddress/:tokenAddress', async (req: any, res: any) => {
    try {
        const liquidityManagerAddress = req.params.liquidityManagerAddress as `0x${string}`
        const tokenAddress = req.params.tokenAddress as `0x${string}`
        
        // 验证地址格式
        if (!liquidityManagerAddress.startsWith('0x') || liquidityManagerAddress.length !== 42) {
            return res.json({ 
                code: 1, 
                message: 'Invalid liquidityManager address format', 
                data: null 
            })
        }
        
        if (!tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
            return res.json({ 
                code: 1, 
                message: 'Invalid token address format', 
                data: null 
            })
        }
        
        const liquidityData = await getGraduatedLiquidityData(liquidityManagerAddress, tokenAddress)
        
        res.json({ 
            code: 0, 
            message: 'success', 
            data: {
                liquidityManager: liquidityManagerAddress,
                tokenAddress: tokenAddress,
                liquidityData: liquidityData
            }
        })
    } catch (error: any) {
        res.json({ 
            code: 1, 
            message: error.message || 'Failed to get liquidity data', 
            data: null 
        })
    }
})



export default router
