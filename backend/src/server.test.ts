import assert from 'node:assert/strict'
import test from 'node:test'
import { getAllowedCorsOrigins } from './server'

function withEnv<T>(updates: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map<string, string | undefined>()
  for (const key of Object.keys(updates)) {
    previous.set(key, process.env[key])
    const value = updates[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return run()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test('returns no default CORS origins in production', () => {
  withEnv({
    NODE_ENV: 'production',
    BACKEND_CORS_ORIGINS: undefined,
    CORS_ORIGINS: undefined,
  }, () => {
    assert.deepEqual(getAllowedCorsOrigins(), [])
  })
})

test('parses configured CORS origin allowlist', () => {
  withEnv({
    NODE_ENV: 'production',
    BACKEND_CORS_ORIGINS: ' https://0xcafe.fun, https://app.0xcafe.fun ',
    CORS_ORIGINS: undefined,
  }, () => {
    assert.deepEqual(getAllowedCorsOrigins(), [
      'https://0xcafe.fun',
      'https://app.0xcafe.fun',
    ])
  })
})

test('uses localhost CORS defaults outside production', () => {
  withEnv({
    NODE_ENV: 'development',
    BACKEND_CORS_ORIGINS: undefined,
    CORS_ORIGINS: undefined,
  }, () => {
    assert.deepEqual(getAllowedCorsOrigins(), [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ])
  })
})
