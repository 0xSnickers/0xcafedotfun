import { existsSync, readFileSync } from 'node:fs'

const required = [
  'SEPOLIA_RPC_URL',
  'PRIVATE_KEY_SEPOLIA',
  'ETHERSCAN_API_KEY',
]
const envFiles = ['.env', 'backend/.env', 'frontend/.env.local']
const merged = new Map()

for (const file of envFiles) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index <= 0 || line.startsWith('#')) continue
    merged.set(line.slice(0, index), line.slice(index + 1))
  }
}

const missing = required.filter((key) => !merged.get(key))
if (missing.length > 0) {
  throw new Error(`Missing release variables: ${missing.join(', ')}`)
}

const forbidden = [
  'NEXT_PUBLIC_BONDING_CURVE_ADDRESS',
  'NEXT_PUBLIC_MEME_PLATFORM_ADDRESS',
  'NEXT_PUBLIC_FEE_MANAGER_ADDRESS',
  'BONDING_CURVE_ADDRESS',
]
const stale = forbidden.filter((key) => merged.has(key))
if (stale.length > 0) {
  throw new Error(`Remove legacy environment variables before release: ${stale.join(', ')}`)
}

console.log('Release preflight passed: required secrets exist and legacy address keys are absent.')
