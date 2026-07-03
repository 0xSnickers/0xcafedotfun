import assert from 'node:assert/strict'
import test from 'node:test'
import { startApplicationServices } from './startupLifecycle'

test('rejects startup when backend bootstrap fails', async () => {
  const steps: string[] = []

  await assert.rejects(
    startApplicationServices({
      bootstrapBackendServices: async () => {
        steps.push('bootstrap')
        throw new Error('bootstrap failed')
      },
      initLiquidityMonitor: async () => {
        steps.push('liquidity')
        return { stopMonitoring() {} }
      },
      initMarketIndexer: async () => {
        steps.push('indexer')
        return null
      },
      initCreatorFeeIndexer: async () => {
        steps.push('creator-fee-indexer')
        return null
      },
      setGlobalMonitor: (monitor: unknown) => {
        steps.push(`set-monitor:${monitor === null ? 'null' : 'value'}`)
      },
    }),
    /bootstrap failed/,
  )

  assert.deepEqual(steps, ['bootstrap', 'set-monitor:null'])
})

test('starts liquidity monitor and indexers after successful bootstrap', async () => {
  const steps: string[] = []
  const monitor = { stopMonitoring() {} }
  const indexer = { stop() {} }
  const creatorFeeIndexer = { stop() {} }

  const result = await startApplicationServices({
    bootstrapBackendServices: async () => {
      steps.push('bootstrap')
    },
    initLiquidityMonitor: async () => {
      steps.push('liquidity')
      return monitor
    },
    initMarketIndexer: async () => {
      steps.push('indexer')
      return indexer as any
    },
    initCreatorFeeIndexer: async () => {
      steps.push('creator-fee-indexer')
      return creatorFeeIndexer as any
    },
    setGlobalMonitor: (nextMonitor: unknown) => {
      steps.push(`set-monitor:${nextMonitor === monitor ? 'value' : 'other'}`)
    },
  })

  assert.deepEqual(steps, [
    'bootstrap',
    'liquidity',
    'set-monitor:value',
    'indexer',
    'creator-fee-indexer',
  ])
  assert.equal(result.liquidityMonitor, monitor)
  assert.equal(result.marketIndexer, indexer)
  assert.equal(result.creatorFeeIndexer, creatorFeeIndexer)
})
