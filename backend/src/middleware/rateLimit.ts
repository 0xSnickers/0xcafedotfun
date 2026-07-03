import type { RequestHandler } from 'express'
import { redis } from '../clients/redisClient'

interface RateLimitOptions {
  windowMs: number
  maxRequests: number
  keyPrefix?: string
  store?: 'memory' | 'redis'
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

let lastRedisRateLimitWarningAt = 0
const REDIS_RATE_LIMIT_WARNING_COOLDOWN_MS = 60_000

function shouldUseRedisRateLimit(store: RateLimitOptions['store']): boolean {
  return store === 'redis' || process.env.RATE_LIMIT_STORE === 'redis'
}

function getClientIp(req: Parameters<RequestHandler>[0]): string {
  const forwardedFor = req.header('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || req.ip || req.socket.remoteAddress || 'unknown'
}

function warnRedisRateLimitFallback(error: unknown): void {
  const now = Date.now()
  if (now - lastRedisRateLimitWarningAt < REDIS_RATE_LIMIT_WARNING_COOLDOWN_MS) {
    return
  }
  lastRedisRateLimitWarningAt = now
  console.warn('Redis rate limit failed; falling back to in-memory limiter:', error)
}

export function createRateLimit({
  windowMs,
  maxRequests,
  keyPrefix = 'rate',
  store,
}: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, RateLimitEntry>()

  function applyMemoryLimit(clientIp: string): {
    allowed: boolean
    retryAfterSeconds?: number
  } {
    const now = Date.now()
    if (buckets.size > maxRequests * 10) {
      for (const [key, entry] of buckets.entries()) {
        if (entry.resetAt <= now) buckets.delete(key)
      }
    }

    const key = `${keyPrefix}:${clientIp}`
    const current = buckets.get(key)

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return { allowed: true }
    }

    current.count += 1
    if (current.count > maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      }
    }

    return { allowed: true }
  }

  async function applyRedisLimit(clientIp: string): Promise<{
    allowed: boolean
    retryAfterSeconds?: number
  }> {
    const key = `${keyPrefix}:${clientIp}`
    const count = await redis.incr(key)
    if (count === 1) {
      await redis.pexpire(key, windowMs)
    }

    if (count <= maxRequests) {
      return { allowed: true }
    }

    const ttlMs = await redis.pttl(key)
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(Math.max(ttlMs, windowMs) / 1000)),
    }
  }

  return async (req, res, next) => {
    if (maxRequests <= 0 || windowMs <= 0) {
      next()
      return
    }

    const clientIp = getClientIp(req)
    let result: { allowed: boolean; retryAfterSeconds?: number }
    if (shouldUseRedisRateLimit(store)) {
      try {
        result = await applyRedisLimit(clientIp)
      } catch (error) {
        warnRedisRateLimitFallback(error)
        result = applyMemoryLimit(clientIp)
      }
    } else {
      result = applyMemoryLimit(clientIp)
    }

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds))
      res.status(429).json({
        error: 'Too many requests',
        retryAfterSeconds: result.retryAfterSeconds,
      })
      return
    }

    next()
  }
}
