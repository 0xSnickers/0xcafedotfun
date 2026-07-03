import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAffectedCandleBuckets,
  getTradeMinuteBucket,
} from './candleProjector'

test('rounds trade timestamps down to UTC minute buckets', () => {
  assert.equal(
    getTradeMinuteBucket(1_710_000_059).toISOString(),
    new Date(1_710_000_000 * 1000).toISOString(),
  )
})

test('deduplicates affected token minute buckets', () => {
  const buckets = getAffectedCandleBuckets([
    { tokenAddress: '0xABC', timestamp: 1_710_000_001 },
    { tokenAddress: '0xabc', timestamp: 1_710_000_059 },
    { tokenAddress: '0xabc', timestamp: 1_710_000_060 },
  ])

  assert.deepEqual(
    buckets.map((bucket) => ({
      tokenAddress: bucket.tokenAddress,
      bucketStart: bucket.bucketStart.toISOString(),
    })),
    [
      {
        tokenAddress: '0xabc',
        bucketStart: new Date(1_710_000_000 * 1000).toISOString(),
      },
      {
        tokenAddress: '0xabc',
        bucketStart: new Date(1_710_000_060 * 1000).toISOString(),
      },
    ],
  )
})
