import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getLogsWithProviderLimit,
  getRpcLogRangeLimit,
  uniqueEventBlockNumbers,
} from './logRange'

test('returns only unique blocks containing project events', () => {
  assert.deepEqual(
    uniqueEventBlockNumbers([
      { blockNumber: 100n },
      { blockNumber: 100n },
      { blockNumber: 105n },
    ]),
    [100n, 105n],
  )
  assert.deepEqual(uniqueEventBlockNumbers([]), [])
})

test('rejects logs without block identity', () => {
  assert.throws(() => uniqueEventBlockNumbers([{ blockNumber: null }]))
})

test('extracts an eth_getLogs provider range limit from nested errors', () => {
  assert.equal(
    getRpcLogRangeLimit({
      cause: {
        details:
          'Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.',
      },
    }),
    10n,
  )
  assert.equal(getRpcLogRangeLimit(new Error('temporary failure')), null)
})

test('splits an oversized eth_getLogs request using the provider limit', async () => {
  const requests: Array<[bigint, bigint]> = []
  const logs = await getLogsWithProviderLimit(async (fromBlock, toBlock) => {
    requests.push([fromBlock, toBlock])
    if (toBlock - fromBlock + 1n > 10n) {
      throw {
        details:
          'Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.',
      }
    }
    return [`${fromBlock}-${toBlock}`]
  }, 100n, 124n)

  assert.deepEqual(requests, [
    [100n, 124n],
    [100n, 109n],
    [110n, 119n],
    [120n, 124n],
  ])
  assert.deepEqual(logs, ['100-109', '110-119', '120-124'])
})
