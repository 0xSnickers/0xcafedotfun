import dotenv from 'dotenv'
import Redis from 'ioredis'

dotenv.config()

export const redis = new Redis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? '6379'),
  lazyConnect: true,
  maxRetriesPerRequest: 2,
})

redis.on('error', (error) => {
  console.error('Redis connection error:', error.message)
})
