import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import express from 'express'
import { redis } from '../clients/redisClient'

const VALID_MARKET = '0x0000000000000000000000000000000000000001'
const VALID_TOKEN = '0x0000000000000000000000000000000000000002'
const VALID_RECIPIENT = '0x0000000000000000000000000000000000000003'
const VALID_FACTORY = '0x0000000000000000000000000000000000000004'

process.env.APP_ENV = 'local'
process.env.CHAIN_ID = '31337'
process.env.RPC_URL_LOCAL = 'http://127.0.0.1:8545'
process.env.PRIVATE_KEY_LOCAL = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

async function loadMonitorModule() {
  return import('./monitor')
}

async function startTestServer(): Promise<{ baseUrl: string; server: Server }> {
  const { default: monitorRouter } = await loadMonitorModule()
  const app = express()
  app.use(express.json())
  app.use('/api/monitor', monitorRouter)

  const server = createServer(app)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address() as AddressInfo | null
  assert.ok(address)
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

async function requestJson(
  baseUrl: string,
  path: string,
  init: Omit<RequestInit, 'body'> & { body?: unknown } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  return {
    status: response.status,
    body: await response.json(),
  }
}

test('rejects monitor admin routes without admin key outside explicit local bypass', async () => {
  const monitor = await loadMonitorModule()
  monitor.resetMonitorRouteStateForTest()
  process.env.APP_ENV = 'sepolia'
  process.env.CHAIN_ID = '11155111'
  delete process.env.MONITOR_ADMIN_KEY
  delete process.env.GROWTH_ADMIN_KEY
  delete process.env.MONITOR_ALLOW_UNAUTH_LOCAL

  const { baseUrl, server } = await startTestServer()
  try {
    const result = await requestJson(baseUrl, '/api/monitor/sweep', {
      method: 'POST',
      body: {
        marketAddress: VALID_MARKET,
        tokenRecipient: VALID_RECIPIENT,
        ethRecipient: VALID_RECIPIENT,
      },
    })

    assert.equal(result.status, 401)
    assert.equal(result.body.success, false)
  } finally {
    await closeServer(server)
    process.env.APP_ENV = 'local'
    process.env.CHAIN_ID = '31337'
  }
})

test('does not authorize monitor routes with growth admin key only', async () => {
  const monitor = await loadMonitorModule()
  monitor.resetMonitorRouteStateForTest()
  process.env.APP_ENV = 'sepolia'
  process.env.CHAIN_ID = '11155111'
  delete process.env.MONITOR_ADMIN_KEY
  process.env.GROWTH_ADMIN_KEY = 'growth-secret'
  delete process.env.MONITOR_ALLOW_UNAUTH_LOCAL

  const { baseUrl, server } = await startTestServer()
  try {
    const result = await requestJson(baseUrl, '/api/monitor/status', {
      headers: { 'x-admin-key': 'growth-secret' },
    })

    assert.equal(result.status, 401)
    assert.equal(result.body.success, false)
  } finally {
    await closeServer(server)
    process.env.APP_ENV = 'local'
    process.env.CHAIN_ID = '31337'
    delete process.env.GROWTH_ADMIN_KEY
  }
})

test('allows sweep without an active monitor when admin is authorized', async () => {
  const monitor = await loadMonitorModule()
  monitor.resetMonitorRouteStateForTest()
  process.env.APP_ENV = 'sepolia'
  process.env.CHAIN_ID = '11155111'
  process.env.MONITOR_ADMIN_KEY = 'secret'
  process.env.MEME_FACTORY_ADDRESS = VALID_FACTORY

  let swept = false
  monitor.setMonitorRouteDepsForTest({
    hasWalletAccount: () => true,
    getWalletAddress: () => VALID_RECIPIENT,
    sweepMarketResiduals: async () => {
      swept = true
    },
  })

  const { baseUrl, server } = await startTestServer()
  try {
    const result = await requestJson(baseUrl, '/api/monitor/sweep', {
      method: 'POST',
      headers: { 'x-admin-key': 'secret' },
      body: {
        marketAddress: VALID_MARKET,
        tokenRecipient: VALID_RECIPIENT,
        ethRecipient: VALID_RECIPIENT,
      },
    })

    assert.equal(result.status, 200)
    assert.equal(result.body.success, true)
    assert.equal(swept, true)
  } finally {
    await closeServer(server)
    monitor.resetMonitorRouteStateForTest()
    process.env.APP_ENV = 'local'
    process.env.CHAIN_ID = '31337'
    delete process.env.MONITOR_ADMIN_KEY
    delete process.env.MEME_FACTORY_ADDRESS
  }
})

test('rejects invalid sweep addresses before calling the service', async () => {
  const monitor = await loadMonitorModule()
  monitor.resetMonitorRouteStateForTest()
  process.env.MONITOR_ADMIN_KEY = 'secret'

  let swept = false
  monitor.setMonitorRouteDepsForTest({
    hasWalletAccount: () => true,
    sweepMarketResiduals: async () => {
      swept = true
    },
  })

  const { baseUrl, server } = await startTestServer()
  try {
    const result = await requestJson(baseUrl, '/api/monitor/sweep', {
      method: 'POST',
      headers: { 'x-admin-key': 'secret' },
      body: {
        marketAddress: 'not-an-address',
        tokenRecipient: VALID_RECIPIENT,
        ethRecipient: VALID_RECIPIENT,
      },
    })

    assert.equal(result.status, 400)
    assert.equal(result.body.success, false)
    assert.equal(swept, false)
  } finally {
    await closeServer(server)
    monitor.resetMonitorRouteStateForTest()
    delete process.env.MONITOR_ADMIN_KEY
  }
})

test('returns 500 when sweep service throws', async () => {
  const monitor = await loadMonitorModule()
  monitor.resetMonitorRouteStateForTest()
  process.env.APP_ENV = 'sepolia'
  process.env.CHAIN_ID = '11155111'
  process.env.MONITOR_ADMIN_KEY = 'secret'
  process.env.MEME_FACTORY_ADDRESS = VALID_FACTORY

  monitor.setMonitorRouteDepsForTest({
    hasWalletAccount: () => true,
    getWalletAddress: () => VALID_RECIPIENT,
    sweepMarketResiduals: async () => {
      throw new Error('sweep failed')
    },
  })

  const { baseUrl, server } = await startTestServer()
  try {
    const result = await requestJson(baseUrl, '/api/monitor/sweep', {
      method: 'POST',
      headers: { 'x-admin-key': 'secret' },
      body: {
        marketAddress: VALID_MARKET,
        tokenRecipient: VALID_RECIPIENT,
        ethRecipient: VALID_RECIPIENT,
      },
    })

    assert.equal(result.status, 500)
    assert.equal(result.body.success, false)
    assert.match(result.body.details, /sweep failed/)
  } finally {
    await closeServer(server)
    monitor.resetMonitorRouteStateForTest()
    process.env.APP_ENV = 'local'
    process.env.CHAIN_ID = '31337'
    delete process.env.MONITOR_ADMIN_KEY
    delete process.env.MEME_FACTORY_ADDRESS
  }
})

test('requires admin key for finalize when public finalize is disabled', async () => {
  const monitor = await loadMonitorModule()
  monitor.resetMonitorRouteStateForTest()
  process.env.APP_ENV = 'sepolia'
  process.env.CHAIN_ID = '11155111'
  process.env.MONITOR_PUBLIC_FINALIZE = 'false'
  delete process.env.MONITOR_ADMIN_KEY
  delete process.env.GROWTH_ADMIN_KEY

  const { baseUrl, server } = await startTestServer()
  try {
    const result = await requestJson(baseUrl, '/api/monitor/finalize', {
      method: 'POST',
      body: { tokenAddress: VALID_TOKEN },
    })

    assert.equal(result.status, 401)
    assert.equal(result.body.success, false)
  } finally {
    await closeServer(server)
    monitor.resetMonitorRouteStateForTest()
    process.env.APP_ENV = 'local'
    process.env.CHAIN_ID = '31337'
    delete process.env.MONITOR_PUBLIC_FINALIZE
  }
})

test('allows explicit localhost monitor bypass in local APP_ENV', async () => {
  const monitor = await loadMonitorModule()
  monitor.resetMonitorRouteStateForTest()
  process.env.APP_ENV = 'local'
  process.env.CHAIN_ID = '31337'
  process.env.MONITOR_ALLOW_UNAUTH_LOCAL = 'true'
  delete process.env.MONITOR_ADMIN_KEY
  delete process.env.GROWTH_ADMIN_KEY

  const { baseUrl, server } = await startTestServer()
  try {
    const result = await requestJson(baseUrl, '/api/monitor/status')

    assert.equal(result.status, 200)
    assert.equal(result.body.success, true)
  } finally {
    await closeServer(server)
    monitor.resetMonitorRouteStateForTest()
    delete process.env.MONITOR_ALLOW_UNAUTH_LOCAL
  }
})

test('deduplicates concurrent public finalize requests', async () => {
  const monitor = await loadMonitorModule()
  monitor.resetMonitorRouteStateForTest()
  process.env.APP_ENV = 'sepolia'
  process.env.CHAIN_ID = '11155111'
  process.env.MONITOR_PUBLIC_FINALIZE = 'true'
  process.env.MONITOR_PUBLIC_FINALIZE_RATE_LIMIT_PER_MINUTE = '0'

  let resolveFinalize!: () => void
  const finalizeStarted = new Promise<void>((resolve) => {
    monitor.setGlobalMonitor({
      getAccountInfo: () => ({ address: VALID_RECIPIENT }),
      finalizeGraduation: async () => {
        resolve()
        await new Promise<void>((release) => {
          resolveFinalize = release
        })
      },
    })
  })

  monitor.setMonitorRouteDepsForTest({
    hasWalletAccount: () => true,
    getWalletAddress: () => VALID_RECIPIENT,
  })

  const { baseUrl, server } = await startTestServer()
  try {
    const firstResult = await requestJson(baseUrl, '/api/monitor/finalize', {
      method: 'POST',
      body: { tokenAddress: VALID_TOKEN },
    })
    assert.equal(firstResult.status, 202)
    assert.equal(firstResult.body.status, 'accepted')

    await finalizeStarted

    const second = await requestJson(baseUrl, '/api/monitor/finalize', {
      method: 'POST',
      body: { tokenAddress: VALID_TOKEN },
    })
    assert.equal(second.status, 202)
    assert.equal(second.body.status, 'already_processing')

    resolveFinalize()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  } finally {
    await closeServer(server)
    monitor.resetMonitorRouteStateForTest()
    process.env.APP_ENV = 'local'
    process.env.CHAIN_ID = '31337'
    delete process.env.MONITOR_PUBLIC_FINALIZE
    delete process.env.MONITOR_PUBLIC_FINALIZE_RATE_LIMIT_PER_MINUTE
  }
})

test('uses Redis coordination to dedupe public finalize across instances', async () => {
  const monitor = await loadMonitorModule()
  monitor.resetMonitorRouteStateForTest()
  process.env.APP_ENV = 'sepolia'
  process.env.CHAIN_ID = '11155111'
  process.env.MONITOR_PUBLIC_FINALIZE = 'true'
  process.env.MONITOR_PUBLIC_FINALIZE_COORDINATION = 'redis'
  process.env.MONITOR_PUBLIC_FINALIZE_RATE_LIMIT_PER_MINUTE = '0'

  const redisPatch = redis as unknown as {
    set: (...args: unknown[]) => Promise<'OK' | null>
    del: (...args: unknown[]) => Promise<number>
  }
  const originalSet = redisPatch.set
  const originalDel = redisPatch.del
  let redisLocked = false

  redisPatch.set = async (...args: unknown[]) => {
    const isNxClaim = args.includes('NX')
    if (isNxClaim && redisLocked) return null
    redisLocked = true
    return 'OK'
  }
  redisPatch.del = async () => {
    redisLocked = false
    return 1
  }

  let resolveFinalize!: () => void
  const finalizeStarted = new Promise<void>((resolve) => {
    monitor.setGlobalMonitor({
      getAccountInfo: () => ({ address: VALID_RECIPIENT }),
      finalizeGraduation: async () => {
        resolve()
        await new Promise<void>((release) => {
          resolveFinalize = release
        })
      },
    })
  })

  monitor.setMonitorRouteDepsForTest({
    hasWalletAccount: () => true,
    getWalletAddress: () => VALID_RECIPIENT,
  })

  const { baseUrl, server } = await startTestServer()
  try {
    const firstResult = await requestJson(baseUrl, '/api/monitor/finalize', {
      method: 'POST',
      body: { tokenAddress: VALID_TOKEN },
    })
    assert.equal(firstResult.status, 202)
    assert.equal(firstResult.body.status, 'accepted')

    await finalizeStarted

    const second = await requestJson(baseUrl, '/api/monitor/finalize', {
      method: 'POST',
      body: { tokenAddress: VALID_TOKEN },
    })
    assert.equal(second.status, 202)
    assert.equal(second.body.status, 'already_processing')

    resolveFinalize()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  } finally {
    await closeServer(server)
    redisPatch.set = originalSet
    redisPatch.del = originalDel
    monitor.resetMonitorRouteStateForTest()
    process.env.APP_ENV = 'local'
    process.env.CHAIN_ID = '31337'
    delete process.env.MONITOR_PUBLIC_FINALIZE
    delete process.env.MONITOR_PUBLIC_FINALIZE_COORDINATION
    delete process.env.MONITOR_PUBLIC_FINALIZE_RATE_LIMIT_PER_MINUTE
  }
})

test('falls back to in-memory public finalize coordination when Redis fails', async () => {
  const monitor = await loadMonitorModule()
  monitor.resetMonitorRouteStateForTest()
  process.env.APP_ENV = 'sepolia'
  process.env.CHAIN_ID = '11155111'
  process.env.MONITOR_PUBLIC_FINALIZE = 'true'
  process.env.MONITOR_PUBLIC_FINALIZE_COORDINATION = 'redis'
  process.env.MONITOR_PUBLIC_FINALIZE_RATE_LIMIT_PER_MINUTE = '0'

  const redisPatch = redis as unknown as {
    set: (...args: unknown[]) => Promise<'OK' | null>
  }
  const originalSet = redisPatch.set
  redisPatch.set = async () => {
    throw new Error('redis unavailable')
  }

  let finalized = false
  monitor.setGlobalMonitor({
    getAccountInfo: () => ({ address: VALID_RECIPIENT }),
    finalizeGraduation: async () => {
      finalized = true
    },
  })
  monitor.setMonitorRouteDepsForTest({
    hasWalletAccount: () => true,
    getWalletAddress: () => VALID_RECIPIENT,
  })

  const { baseUrl, server } = await startTestServer()
  try {
    const result = await requestJson(baseUrl, '/api/monitor/finalize', {
      method: 'POST',
      body: { tokenAddress: VALID_TOKEN },
    })

    assert.equal(result.status, 202)
    assert.equal(result.body.status, 'accepted')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    assert.equal(finalized, true)
  } finally {
    await closeServer(server)
    redisPatch.set = originalSet
    monitor.resetMonitorRouteStateForTest()
    process.env.APP_ENV = 'local'
    process.env.CHAIN_ID = '31337'
    delete process.env.MONITOR_PUBLIC_FINALIZE
    delete process.env.MONITOR_PUBLIC_FINALIZE_COORDINATION
    delete process.env.MONITOR_PUBLIC_FINALIZE_RATE_LIMIT_PER_MINUTE
  }
})

test('rejects public finalize queueing when worker is unavailable', async () => {
  const monitor = await loadMonitorModule()
  monitor.resetMonitorRouteStateForTest()
  process.env.APP_ENV = 'sepolia'
  process.env.CHAIN_ID = '11155111'
  process.env.MONITOR_PUBLIC_FINALIZE = 'true'
  process.env.MONITOR_PUBLIC_FINALIZE_RATE_LIMIT_PER_MINUTE = '0'

  const { baseUrl, server } = await startTestServer()
  try {
    const result = await requestJson(baseUrl, '/api/monitor/finalize', {
      method: 'POST',
      body: { tokenAddress: VALID_TOKEN },
    })

    assert.equal(result.status, 503)
    assert.equal(result.body.status, 'worker_unavailable')
  } finally {
    await closeServer(server)
    monitor.resetMonitorRouteStateForTest()
    process.env.APP_ENV = 'local'
    process.env.CHAIN_ID = '31337'
    delete process.env.MONITOR_PUBLIC_FINALIZE
    delete process.env.MONITOR_PUBLIC_FINALIZE_RATE_LIMIT_PER_MINUTE
  }
})

test('keeps admin finalize synchronous when public finalize is enabled', async () => {
  const monitor = await loadMonitorModule()
  monitor.resetMonitorRouteStateForTest()
  process.env.APP_ENV = 'sepolia'
  process.env.CHAIN_ID = '11155111'
  process.env.MONITOR_ADMIN_KEY = 'secret'
  process.env.MONITOR_PUBLIC_FINALIZE = 'true'
  process.env.MONITOR_PUBLIC_FINALIZE_RATE_LIMIT_PER_MINUTE = '1'

  let finalized = false
  monitor.setGlobalMonitor({
    getAccountInfo: () => ({ address: VALID_RECIPIENT }),
    finalizeGraduation: async () => {
      finalized = true
    },
  })
  monitor.setMonitorRouteDepsForTest({
    hasWalletAccount: () => true,
    getWalletAddress: () => VALID_RECIPIENT,
  })

  const { baseUrl, server } = await startTestServer()
  try {
    const result = await requestJson(baseUrl, '/api/monitor/finalize', {
      method: 'POST',
      headers: { 'x-admin-key': 'secret' },
      body: { tokenAddress: VALID_TOKEN },
    })

    assert.equal(result.status, 200)
    assert.equal(result.body.status, 'accepted')
    assert.equal(finalized, true)
  } finally {
    await closeServer(server)
    monitor.resetMonitorRouteStateForTest()
    process.env.APP_ENV = 'local'
    process.env.CHAIN_ID = '31337'
    delete process.env.MONITOR_ADMIN_KEY
    delete process.env.MONITOR_PUBLIC_FINALIZE
    delete process.env.MONITOR_PUBLIC_FINALIZE_RATE_LIMIT_PER_MINUTE
  }
})
