import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectReorg,
  ReorgFacts,
} from './reorgHandler'

function createFacts(overrides?: Partial<ReorgFacts>): ReorgFacts {
  return {
    blocks: [],
    logs: [],
    ...overrides,
  }
}

test('returns null when fetched facts match stored canonical facts', () => {
  const stored = createFacts({
    blocks: [{ blockNumber: 100n, blockHash: '0xblock100' }],
    logs: [
      {
        blockNumber: 100n,
        blockHash: '0xblock100',
        transactionHash: '0xtx1',
        transactionIndex: 0,
        logIndex: 0,
      },
    ],
  })

  const fetched = createFacts({
    blocks: [{ blockNumber: 100n, blockHash: '0xblock100' }],
    logs: [
      {
        blockNumber: 100n,
        blockHash: '0xblock100',
        transactionHash: '0xtx1',
        transactionIndex: 0,
        logIndex: 0,
      },
    ],
  })

  assert.equal(detectReorg(stored, fetched), null)
})

test('detects a missing canonical block in the fetched tail window', () => {
  const stored = createFacts({
    blocks: [{ blockNumber: 100n, blockHash: '0xblock100' }],
  })

  const fetched = createFacts()

  assert.deepEqual(detectReorg(stored, fetched), {
    affectedFromBlock: 100n,
    reason: 'block_missing',
  })
})

test('detects a block hash change at the same height', () => {
  const stored = createFacts({
    blocks: [{ blockNumber: 100n, blockHash: '0xblock100' }],
  })

  const fetched = createFacts({
    blocks: [{ blockNumber: 100n, blockHash: '0xblock100b' }],
  })

  assert.deepEqual(detectReorg(stored, fetched), {
    affectedFromBlock: 100n,
    reason: 'block_hash_changed',
  })
})

test('detects a canonical log disappearing from the fetched window', () => {
  const stored = createFacts({
    logs: [
      {
        blockNumber: 100n,
        blockHash: '0xblock100',
        transactionHash: '0xtx1',
        transactionIndex: 0,
        logIndex: 0,
      },
    ],
  })

  const fetched = createFacts()

  assert.deepEqual(detectReorg(stored, fetched), {
    affectedFromBlock: 100n,
    reason: 'log_missing',
  })
})

test('detects a changed log identity at the same block and position', () => {
  const stored = createFacts({
    logs: [
      {
        blockNumber: 100n,
        blockHash: '0xblock100',
        transactionHash: '0xtx1',
        transactionIndex: 0,
        logIndex: 0,
      },
    ],
  })

  const fetched = createFacts({
    logs: [
      {
        blockNumber: 100n,
        blockHash: '0xblock100b',
        transactionHash: '0xtx2',
        transactionIndex: 0,
        logIndex: 0,
      },
    ],
  })

  assert.deepEqual(detectReorg(stored, fetched), {
    affectedFromBlock: 100n,
    reason: 'log_changed',
  })
})

test('detects a newly added log in the fetched window', () => {
  const stored = createFacts()

  const fetched = createFacts({
    logs: [
      {
        blockNumber: 101n,
        blockHash: '0xblock101',
        transactionHash: '0xtx3',
        transactionIndex: 1,
        logIndex: 2,
      },
    ],
  })

  assert.deepEqual(detectReorg(stored, fetched), {
    affectedFromBlock: 101n,
    reason: 'log_added',
  })
})
