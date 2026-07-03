import type { MarketIndexer } from './services/marketIndexer'
import type { CreatorFeeIndexer } from './services/creatorFeeIndexer'

export interface StartupLifecycleDeps {
  bootstrapBackendServices: () => Promise<void>
  initLiquidityMonitor: () => Promise<any>
  initMarketIndexer: () => Promise<MarketIndexer | null>
  initCreatorFeeIndexer: () => Promise<CreatorFeeIndexer | null>
  setGlobalMonitor: (monitor: any) => void
}

export async function startApplicationServices(
  deps: StartupLifecycleDeps,
): Promise<{
  liquidityMonitor: any
  marketIndexer: MarketIndexer | null
  creatorFeeIndexer: CreatorFeeIndexer | null
}> {
  console.log('\nBootstrapping backend services...')

  try {
    await deps.bootstrapBackendServices()
  } catch (error) {
    deps.setGlobalMonitor(null)
    throw error
  }

  console.log('\n🔄 Initializing liquidity monitor...')
  const nextLiquidityMonitor = await deps.initLiquidityMonitor()
  deps.setGlobalMonitor(nextLiquidityMonitor)

  console.log('\nInitializing market indexer...')
  const nextMarketIndexer = await deps.initMarketIndexer()

  console.log('\nInitializing creator fee indexer...')
  const nextCreatorFeeIndexer = await deps.initCreatorFeeIndexer()

  return {
    liquidityMonitor: nextLiquidityMonitor,
    marketIndexer: nextMarketIndexer,
    creatorFeeIndexer: nextCreatorFeeIndexer,
  }
}
