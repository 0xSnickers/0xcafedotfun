import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import express from 'express'
import { redis } from '../clients/redisClient'
import { createRateLimit } from './rateLimit'

async function startRateLimitServer(
  middleware = createRateLimit({
    keyPrefix: `test-rate-${Date.now()}`,
    windowMs: 60_000,
    maxRequests: 1,
  }),
): Promise<{ baseUrl: string; server: Server }> {
  const app = express()
  app.use(middleware)
  app.get('/ok', (_req, res) => {
    res.json({ ok: true })
  })

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

test('limits repeated requests with the in-memory store', async () => {
  const { baseUrl, server } = await startRateLimitServer()
  try {
    const first = await fetch(`${baseUrl}/ok`)
    const second = await fetch(`${baseUrl}/ok`)

    assert.equal(first.status, 200)
    assert.equal(second.status, 429)
    assert.equal(second.headers.has('retry-after'), true)
  } finally {
    await closeServer(server)
  }
})

test('falls back to memory when Redis rate limit store fails', async () => {
  const originalIncr = redis.incr.bind(redis)
  const redisPatch = redis as unknown as {
    incr: typeof redis.incr
  }
  redisPatch.incr = async () => {
    throw new Error('redis unavailable')
  }

  const { baseUrl, server } = await startRateLimitServer(
    createRateLimit({
      keyPrefix: `test-rate-redis-fallback-${Date.now()}`,
      windowMs: 60_000,
      maxRequests: 1,
      store: 'redis',
    }),
  )

  try {
    const first = await fetch(`${baseUrl}/ok`)
    const second = await fetch(`${baseUrl}/ok`)

    assert.equal(first.status, 200)
    assert.equal(second.status, 429)
  } finally {
    redisPatch.incr = originalIncr
    await closeServer(server)
  }
})
