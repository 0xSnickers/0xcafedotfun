import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertOnlineMonitorAdminConfigured,
  getBackendEnvironment,
} from './environment'

const ORIGINAL_ENV = { ...process.env }

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  process.env = { ...ORIGINAL_ENV }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    fn()
  } finally {
    process.env = { ...ORIGINAL_ENV }
  }
}

test('accepts local APP_ENV with Anvil chain id', () => {
  withEnv({ APP_ENV: 'local', CHAIN_ID: '31337' }, () => {
    assert.deepEqual(getBackendEnvironment(), {
      appEnv: 'local',
      chainId: 31337,
      chainName: 'Anvil',
    })
  })
})

test('accepts sepolia APP_ENV with Sepolia chain id', () => {
  withEnv({ APP_ENV: 'sepolia', CHAIN_ID: '11155111' }, () => {
    const env = getBackendEnvironment()
    assert.equal(env.appEnv, 'sepolia')
    assert.equal(env.chainId, 11155111)
  })
})

test('accepts mainnet APP_ENV with Ethereum chain id', () => {
  withEnv({ APP_ENV: 'mainnet', CHAIN_ID: '1' }, () => {
    const env = getBackendEnvironment()
    assert.equal(env.appEnv, 'mainnet')
    assert.equal(env.chainId, 1)
  })
})

test('rejects mismatched APP_ENV and CHAIN_ID', () => {
  withEnv({ APP_ENV: 'sepolia', CHAIN_ID: '31337' }, () => {
    assert.throws(
      () => getBackendEnvironment(),
      /APP_ENV=sepolia requires CHAIN_ID=11155111/,
    )
  })
})

test('rejects unknown CHAIN_ID', () => {
  withEnv({ APP_ENV: undefined, CHAIN_ID: '999' }, () => {
    assert.throws(
      () => getBackendEnvironment(),
      /requires CHAIN_ID=31337|Unsupported CHAIN_ID/,
    )
  })
})

test('rejects online monitor startup without admin key', () => {
  withEnv({
    APP_ENV: 'mainnet',
    CHAIN_ID: '1',
    MONITOR_ADMIN_KEY: undefined,
    GROWTH_ADMIN_KEY: undefined,
  }, () => {
    assert.throws(
      () => assertOnlineMonitorAdminConfigured(),
      /requires MONITOR_ADMIN_KEY/,
    )
  })
})

test('does not accept growth admin key as monitor admin key', () => {
  withEnv({
    APP_ENV: 'sepolia',
    CHAIN_ID: '11155111',
    MONITOR_ADMIN_KEY: undefined,
    GROWTH_ADMIN_KEY: 'growth-secret',
  }, () => {
    assert.throws(
      () => assertOnlineMonitorAdminConfigured(),
      /requires MONITOR_ADMIN_KEY/,
    )
  })
})
