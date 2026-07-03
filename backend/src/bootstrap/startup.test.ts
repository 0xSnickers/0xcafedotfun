import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBootstrapBackendServices,
  StartupBootstrapDeps,
} from './startup'

test('runs PostgreSQL readiness, migrations, and Redis check in order when PostgreSQL is enabled', async () => {
  const steps: string[] = []
  const bootstrap = createBootstrapBackendServices({
    postgresEnabled: true,
    waitForPostgresReady: async () => {
      steps.push('postgres-ready')
    },
    runPostgresMigrations: async () => {
      steps.push('migrations')
    },
    checkRedisReady: async () => {
      steps.push('redis-ready')
    },
  })

  await bootstrap()

  assert.deepEqual(steps, ['postgres-ready', 'migrations', 'redis-ready'])
})

test('skips PostgreSQL steps and requires Redis when PostgreSQL is disabled', async () => {
  const steps: string[] = []
  const bootstrap = createBootstrapBackendServices({
    postgresEnabled: false,
    waitForPostgresReady: async () => {
      steps.push('postgres-ready')
    },
    runPostgresMigrations: async () => {
      steps.push('migrations')
    },
    checkRedisReady: async () => {
      steps.push('redis-ready')
    },
  })

  await bootstrap()

  assert.deepEqual(steps, ['redis-ready'])
})

test('downgrades Redis readiness failures to a warning when PostgreSQL is enabled', async () => {
  const bootstrap = createBootstrapBackendServices({
    postgresEnabled: true,
    waitForPostgresReady: async () => undefined,
    runPostgresMigrations: async () => undefined,
    checkRedisReady: async () => {
      throw new Error('redis down')
    },
  })

  await assert.doesNotReject(bootstrap)
})
