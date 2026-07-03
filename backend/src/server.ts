import { pathToFileURL } from 'node:url'
import type { Server } from 'node:http'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { isAddress } from 'viem'
import router from './routes'
import { createLiquidityMonitor } from './services/liquidityMonitor'
import { setGlobalMonitor } from './routes/monitor'
import { createMarketIndexer } from './services/marketIndexer'
import type { MarketIndexer } from './services/marketIndexer'
import { createCreatorFeeIndexer } from './services/creatorFeeIndexer'
import type { CreatorFeeIndexer } from './services/creatorFeeIndexer'
import { redis } from './clients/redisClient'
import { postgresPool } from './clients/postgresClient'
import { bootstrapBackendServices } from './bootstrap/startup'
import { startApplicationServices } from './startupLifecycle'
import { assertOnlineMonitorAdminConfigured, getBackendEnvironment } from './config/environment'

dotenv.config()

let liquidityMonitor: any = null
let marketIndexer: MarketIndexer | null = null
let creatorFeeIndexer: CreatorFeeIndexer | null = null
let httpServer: Server | null = null

const DEFAULT_DEV_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]

export function getAllowedCorsOrigins(): string[] {
  const configured =
    process.env.BACKEND_CORS_ORIGINS ??
    process.env.CORS_ORIGINS ??
    ''
  const origins = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (origins.length > 0) {
    return origins
  }

  return process.env.NODE_ENV === 'production' ? [] : DEFAULT_DEV_CORS_ORIGINS
}

const allowedCorsOrigins = getAllowedCorsOrigins()
const app = express()
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true)
      return
    }
    callback(null, allowedCorsOrigins.includes(origin))
  },
}))
app.use(express.json())
app.use('/api', router)

async function initLiquidityMonitor() {
  const liquidityManagerAddress = process.env.LIQUIDITY_MANAGER_ADDRESS as `0x${string}`
  const factoryAddress = process.env.MEME_FACTORY_ADDRESS as `0x${string}` | undefined

  if (!liquidityManagerAddress) {
    console.log('Liquidity monitor disabled: LIQUIDITY_MANAGER_ADDRESS is missing')
    return null
  }

  try {
    const monitor = createLiquidityMonitor(liquidityManagerAddress, factoryAddress)
    await monitor.startMonitoring()

    console.log('✅ Liquidity monitor started successfully')
    console.log(`💧 LiquidityManager: ${liquidityManagerAddress}`)

    return monitor
  } catch (error) {
    console.error('❌ Failed to start liquidity monitor:', error)
    return null
  }
}

async function initMarketIndexer() {
  if (process.env.MARKET_INDEXER_ENABLED === 'false') {
    console.log('Market indexer disabled by MARKET_INDEXER_ENABLED=false')
    return null
  }

  const factoryAddress = process.env.MEME_FACTORY_ADDRESS as `0x${string}`
  const liquidityManagerAddress = process.env.LIQUIDITY_MANAGER_ADDRESS as `0x${string}` | undefined
  if (!factoryAddress) {
    console.log('Market indexer disabled: MEME_FACTORY_ADDRESS is missing')
    return null
  }

  try {
    const indexer = createMarketIndexer(factoryAddress, liquidityManagerAddress)
    await indexer.start()
    return indexer
  } catch (error) {
    console.error('Failed to start market indexer:', error)
    return null
  }
}

async function initCreatorFeeIndexer() {
  if (process.env.CREATOR_FEE_INDEXER_ENABLED === 'false') {
    console.log('Creator fee indexer disabled by CREATOR_FEE_INDEXER_ENABLED=false')
    return null
  }

  const feeVaultAddress = process.env.FEE_VAULT_ADDRESS
  if (!feeVaultAddress || !isAddress(feeVaultAddress)) {
    console.log('Creator fee indexer disabled: FEE_VAULT_ADDRESS is missing')
    return null
  }

  try {
    const indexer = createCreatorFeeIndexer(feeVaultAddress)
    await indexer.start()
    return indexer
  } catch (error) {
    console.error('Failed to start creator fee indexer:', error)
    return null
  }
}

const PORT = process.env.PORT || 9000

export function createApp() {
  return app
}

async function startServer(): Promise<void> {
  const backendEnv = getBackendEnvironment()
  assertOnlineMonitorAdminConfigured()

  const started = await startApplicationServices({
    bootstrapBackendServices,
    initLiquidityMonitor,
    initMarketIndexer,
    initCreatorFeeIndexer,
    setGlobalMonitor,
  })
  liquidityMonitor = started.liquidityMonitor
  marketIndexer = started.marketIndexer
  creatorFeeIndexer = started.creatorFeeIndexer

  httpServer = await new Promise<Server>((resolve, reject) => {
    const server = app.listen(PORT, () => resolve(server))
    server.once('error', reject)
  })
  console.log(`🚀 🚀 🚀  Server running at http://localhost:${PORT}`)
  console.log(`🌐 Environment: APP_ENV=${backendEnv.appEnv}, NODE_ENV=${process.env.NODE_ENV ?? 'development'}, CHAIN_ID=${backendEnv.chainId}`)

  if (liquidityMonitor) {
    console.log('💧 Auto liquidity monitoring is active!')
  } else {
    console.log('💧 Auto liquidity monitoring is disabled')
  }

  console.log('\n📋 Available endpoints:')
  console.log('   GET  /api/monitor/status     - Check monitor status')
  console.log('   POST /api/monitor/finalize   - Finalize graduation automatically')
  console.log('   POST /api/monitor/manual     - Legacy alias for graduation finalization')
  console.log('   POST /api/monitor/sweep      - Sweep graduation residuals (admin only)')
  console.log('   POST /api/monitor/restart    - Restart monitor')
  console.log('   POST /api/monitor/stop       - Stop monitor')
  console.log('   GET  /api/market/:tokenAddress/candles - Query 1m candles')
}

async function shutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down server...`)

  if (liquidityMonitor) {
    liquidityMonitor.stopMonitoring()
  }

  await Promise.all([
    marketIndexer?.stop(),
    creatorFeeIndexer?.stop(),
  ])
  await new Promise<void>((resolve) => {
    if (!httpServer) {
      resolve()
      return
    }
    httpServer.close(() => resolve())
  })
  await redis.quit()
  await postgresPool?.end()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startServer()
}

export { liquidityMonitor, marketIndexer, creatorFeeIndexer }
