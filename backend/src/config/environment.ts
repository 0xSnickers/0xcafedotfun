import { anvil, mainnet, sepolia } from 'viem/chains'

export type AppEnv = 'local' | 'sepolia' | 'mainnet'

export interface BackendEnvironment {
  appEnv: AppEnv
  chainId: number
  chainName: string
}

const CHAIN_BY_APP_ENV: Record<AppEnv, number> = {
  local: anvil.id,
  sepolia: sepolia.id,
  mainnet: mainnet.id,
}

const APP_ENV_BY_CHAIN_ID = new Map<number, AppEnv>([
  [anvil.id, 'local'],
  [sepolia.id, 'sepolia'],
  [mainnet.id, 'mainnet'],
])

const CHAIN_NAME_BY_ID = new Map<number, string>([
  [anvil.id, anvil.name],
  [sepolia.id, sepolia.name],
  [mainnet.id, mainnet.name],
])

export function parseAppEnv(value = process.env.APP_ENV): AppEnv {
  if (!value) return 'local'

  if (value === 'local' || value === 'sepolia' || value === 'mainnet') {
    return value
  }

  throw new Error(`Unsupported APP_ENV "${value}". Expected local, sepolia, or mainnet.`)
}

function parseChainId(value = process.env.CHAIN_ID): number | null {
  if (!value) return null

  const chainId = Number(value)
  if (!Number.isInteger(chainId)) {
    throw new Error(`CHAIN_ID must be an integer. Received "${value}".`)
  }

  return chainId
}

export function getBackendEnvironment(): BackendEnvironment {
  const rawAppEnv = process.env.APP_ENV
  const configuredChainId = parseChainId()
  const appEnv = rawAppEnv
    ? parseAppEnv(rawAppEnv)
    : configuredChainId
      ? APP_ENV_BY_CHAIN_ID.get(configuredChainId) ?? 'local'
      : 'local'
  const chainId = configuredChainId ?? CHAIN_BY_APP_ENV[appEnv]
  const expectedChainId = CHAIN_BY_APP_ENV[appEnv]

  if (chainId !== expectedChainId) {
    throw new Error(
      `APP_ENV=${appEnv} requires CHAIN_ID=${expectedChainId}, received CHAIN_ID=${chainId}.`,
    )
  }

  const chainName = CHAIN_NAME_BY_ID.get(chainId)
  if (!chainName) {
    throw new Error(`Unsupported CHAIN_ID=${chainId}. Supported chains: 31337, 11155111, 1.`)
  }

  return { appEnv, chainId, chainName }
}

export function isOnlineEnvironment(appEnv = getBackendEnvironment().appEnv): boolean {
  return appEnv === 'sepolia' || appEnv === 'mainnet'
}

export function isMainnetEnvironment(appEnv = getBackendEnvironment().appEnv): boolean {
  return appEnv === 'mainnet'
}

export function getMonitorAdminKey(): string | null {
  return process.env.MONITOR_ADMIN_KEY || null
}

export function assertOnlineMonitorAdminConfigured(): void {
  const { appEnv } = getBackendEnvironment()
  if (isOnlineEnvironment(appEnv) && !getMonitorAdminKey()) {
    throw new Error(`APP_ENV=${appEnv} requires MONITOR_ADMIN_KEY for monitor admin routes.`)
  }
}
