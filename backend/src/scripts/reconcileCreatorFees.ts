import { postgresPool } from '../clients/postgresClient'
import { viemClient } from '../clients/viemClient'
import { feeVaultCreatorAbi } from '../abi/creatorFees'

if (!postgresPool) {
  throw new Error('DATABASE_URL is required for creator fee reconciliation')
}

const feeVaultAddress = process.env.FEE_VAULT_ADDRESS as `0x${string}` | undefined
if (!feeVaultAddress) {
  throw new Error('FEE_VAULT_ADDRESS is required for creator fee reconciliation')
}

const chainId = viemClient.chain.id
const creatorAddress = process.env.RECONCILE_CREATOR_ADDRESS?.toLowerCase() ?? null
const limit = process.env.RECONCILE_CREATOR_LIMIT ? Number(process.env.RECONCILE_CREATOR_LIMIT) : 20

if (!Number.isInteger(limit) || limit <= 0) {
  throw new Error('RECONCILE_CREATOR_LIMIT must be a positive integer')
}

const result = await postgresPool.query(
  `with creators as (
     select creator_address
     from creator_fee_facts
     where chain_id = $1
       and ($2::text is null or creator_address = $2)
     union
     select creator_address
     from creator_fee_claims
     where chain_id = $1
       and canonical = true
       and ($2::text is null or creator_address = $2)
     union
     select creator_address
     from creator_fee_accruals
     where chain_id = $1
       and canonical = true
       and ($2::text is null or creator_address = $2)
   )
   select creator_address
   from creators
   order by creator_address asc
   limit $3`,
  [chainId, creatorAddress, limit],
)

const creators = result.rows.map((row) => row.creator_address as `0x${string}`)
const reconciled = [] as Array<{
  creatorAddress: string
  indexed: {
    totalAccrued: string
    totalClaimed: string
  }
  chain: {
    claimable: string
    totalAccrued: string
    totalClaimed: string
  }
  matches: {
    totalAccrued: boolean
    totalClaimed: boolean
  }
}>

for (const creator of creators) {
  const summaryResult = await postgresPool.query(
    `select
       total_accrued_raw::text as total_accrued,
       total_claimed_raw::text as total_claimed
     from creator_fee_facts
     where chain_id = $1
       and creator_address = $2
     limit 1`,
    [chainId, creator],
  )

  const indexedTotalAccrued = (summaryResult.rows[0]?.total_accrued as string | undefined) ?? '0'
  const indexedTotalClaimed = (summaryResult.rows[0]?.total_claimed as string | undefined) ?? '0'

  const [chainClaimable, chainTotalAccrued, chainTotalClaimed] = await Promise.all([
    viemClient.readContract({
      address: feeVaultAddress,
      abi: feeVaultCreatorAbi,
      functionName: 'creatorFeesClaimable',
      args: [creator],
    }),
    viemClient.readContract({
      address: feeVaultAddress,
      abi: feeVaultCreatorAbi,
      functionName: 'totalCreatorFeesAccrued',
      args: [creator],
    }),
    viemClient.readContract({
      address: feeVaultAddress,
      abi: feeVaultCreatorAbi,
      functionName: 'totalCreatorFeesClaimed',
      args: [creator],
    }),
  ])

  reconciled.push({
    creatorAddress: creator,
    indexed: {
      totalAccrued: indexedTotalAccrued,
      totalClaimed: indexedTotalClaimed,
    },
    chain: {
      claimable: chainClaimable.toString(),
      totalAccrued: chainTotalAccrued.toString(),
      totalClaimed: chainTotalClaimed.toString(),
    },
    matches: {
      totalAccrued: indexedTotalAccrued === chainTotalAccrued.toString(),
      totalClaimed: indexedTotalClaimed === chainTotalClaimed.toString(),
    },
  })
}

console.log(JSON.stringify({
  chainId,
  feeVaultAddress,
  creators: reconciled,
  allMatched: reconciled.every((item) => item.matches.totalAccrued && item.matches.totalClaimed),
}, null, 2))

await postgresPool.end()
