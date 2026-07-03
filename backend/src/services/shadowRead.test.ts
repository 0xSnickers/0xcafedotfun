import assert from 'node:assert/strict'
import test from 'node:test'
import { runBestEffortShadowRead } from './shadowRead'

test('does not reject the primary request when a shadow read fails', async () => {
  await assert.doesNotReject(
    runBestEffortShadowRead(async () => {
      throw new Error('shadow unavailable')
    }),
  )
})

test('runs a healthy shadow comparison', async () => {
  let compared = false

  await runBestEffortShadowRead(async () => {
    compared = true
  })

  assert.equal(compared, true)
})
