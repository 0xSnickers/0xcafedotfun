import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import router from './routes'
import { createLiquidityMonitor } from './services/liquidityMonitor'
import { setGlobalMonitor } from './routes/monitor'

dotenv.config()

// 全局监控器实例
let liquidityMonitor: any = null

const app = express()
app.use(cors())
app.use(express.json())

app.use('/api', router)
console.log('process.env.PRIVATE_KEY_LOCAL->',process.env.PRIVATE_KEY_LOCAL)
// 初始化流动性监控器
async function initLiquidityMonitor() {
  const bondingCurveAddress = process.env.BONDING_CURVE_ADDRESS as `0x${string}`
  const liquidityManagerAddress = process.env.LIQUIDITY_MANAGER_ADDRESS as `0x${string}`

  if (!bondingCurveAddress || !liquidityManagerAddress) {
    console.log('⚠️ Liquidity monitor disabled: Missing contract addresses in environment variables')
    console.log('   Set BONDING_CURVE_ADDRESS and LIQUIDITY_MANAGER_ADDRESS to enable auto liquidity')
    return null
  }

  try {
    const monitor = createLiquidityMonitor(bondingCurveAddress, liquidityManagerAddress)
    await monitor.startMonitoring()
    
    console.log('✅ Liquidity monitor started successfully')
    console.log(`📊 BondingCurve: ${bondingCurveAddress}`)
    console.log(`💧 LiquidityManager: ${liquidityManagerAddress}`)
    
    return monitor
  } catch (error) {
    console.error('❌ Failed to start liquidity monitor:', error)
    return null
  }
}

const PORT = process.env.PORT || 9000

app.listen(PORT, async () => {
  console.log(`🚀 🚀 🚀  Server running at http://localhost:${PORT}`)
  
  // 启动流动性监控器
  console.log('\n🔄 Initializing liquidity monitor...')
  liquidityMonitor = await initLiquidityMonitor()
  
  // 设置全局监控器实例供 API 使用
  setGlobalMonitor(liquidityMonitor)
  
  if (liquidityMonitor) {
    console.log('💧 Auto liquidity monitoring is active!')
  } else {
    console.log('💧 Auto liquidity monitoring is disabled')
  }
  
  console.log('\n📋 Available endpoints:')
  console.log('   GET  /api/monitor/status     - Check monitor status')
  console.log('   POST /api/monitor/manual     - Manually add liquidity for token')
  console.log('   POST /api/monitor/restart    - Restart monitor')
  console.log('   POST /api/monitor/stop       - Stop monitor')
})

// 优雅退出处理
process.on('SIGINT', () => {
  console.log('\n📭 Shutting down server...')
  
  if (liquidityMonitor) {
    console.log('🛑 Stopping liquidity monitor...')
    liquidityMonitor.stopMonitoring()
  }
  
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n📭 Received SIGTERM, shutting down server...')
  
  if (liquidityMonitor) {
    console.log('🛑 Stopping liquidity monitor...')
    liquidityMonitor.stopMonitoring()
  }
  
  process.exit(0)
})

// 导出监控器实例供路由使用
export { liquidityMonitor }
