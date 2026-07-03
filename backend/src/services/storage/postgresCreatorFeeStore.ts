import { sql } from 'drizzle-orm'
import { feeVaultCreatorAbi } from '../../abi/creatorFees'
import { viemClient } from '../../clients/viemClient'
import {
  chainBlocks,
  creatorFeeAccruals,
  creatorFeeClaims,
  creatorFeeFacts,
  creatorTokenFeeFacts,
  indexerCheckpoints,
  rawChainLogs,
  tokenMarkets,
} from '../../db/schema'
import { db, postgresEnabled } from '../../clients/postgresClient'

const CONSUMER_NAME = 'creator-fee-indexer'
const DEFAULT_CLAIMS_LIMIT = 50
const MAX_CLAIMS_LIMIT = 100
const LOCAL_E2E_TOKEN_NAME = 'local formal token'
const LOCAL_E2E_TOKEN_SYMBOL = 'lft'

type SqlExecutor = {
  execute(query: ReturnType<typeof sql>): Promise<{ rows: Array<Record<string, unknown>> } | unknown>
}

export interface CreatorFeeAccrualRecord {
  tokenAddress: string
  marketAddress: string
  creatorAddress: string
  platformFeeRaw: bigint
  creatorFeeRaw: bigint
  transactionHash: string
  transactionIndex: number
  logIndex: number
  blockNumber: bigint
  blockHash: string
  blockTimestamp: number
}

export interface CreatorFeeClaimRecord {
  creatorAddress: string
  recipientAddress: string
  amountRaw: bigint
  transactionHash: string
  transactionIndex: number
  logIndex: number
  blockNumber: bigint
  blockHash: string
  blockTimestamp: number
}

export interface CreatorFeesResponse {
  creatorAddress: string
  feeVaultAddress: string
  claimable: string
  totalAccrued: string
  totalClaimed: string
  tokenEarnings: Array<{
    tokenAddress: string
    name: string
    symbol: string
    tokenImage: string
    accrued: string
  }>
  claims: Array<{
    recipient: string
    amount: string
    transactionHash: string
    blockNumber: string
    timestamp: number | null
  }>
}

export interface CreatorFeeCheckpointMetadata {
  lastIndexedBlock: bigint | null
  lastFinalizedBlock: bigint | null
}

export interface StoredCanonicalBlock {
  blockNumber: bigint
  blockHash: string
}

export interface StoredCanonicalLog {
  blockNumber: bigint
  blockHash: string
  transactionHash: string
  transactionIndex: number
  logIndex: number
}

export interface RollbackCanonicalResult {
  affectedCreatorAddresses: string[]
  resetToBlock: bigint
}

interface ResetCheckpointInput {
  chainId: number
  cursorKey: string
  lastIndexedBlock: bigint
  lastFinalizedBlock: bigint
}

interface AdvanceCheckpointInput {
  chainId: number
  cursorKey: string
  confirmationDepth: bigint
  lastIndexedBlock: bigint
}

interface PersistCreatorFeeEventsInput {
  chainId: number
  cursorKey: string
  confirmationDepth: bigint
  block: {
    number: bigint
    hash: string
    parentHash?: string
    timestamp: number
  }
  accruals: CreatorFeeAccrualRecord[]
  claims: CreatorFeeClaimRecord[]
  rawLogs?: Array<{
    blockNumber: bigint
    blockHash: string
    transactionHash: string
    transactionIndex: number
    logIndex: number
    contractAddress: string
    topic0: string
    topics: string[]
    data: string
    eventName: string
    decodedArgs: Record<string, string>
  }>
  advanceCheckpoint?: boolean
}

function normalizeAddress(value: string): string {
  return value.toLowerCase()
}

function getHiddenTokenAddresses(): string[] {
  return [
    ...(process.env.HIDDEN_TOKEN_ADDRESSES ?? '').split(','),
    ...(process.env.NEXT_PUBLIC_HIDDEN_TOKEN_ADDRESSES ?? '').split(','),
  ]
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^0x[a-f0-9]{40}$/.test(value))
}

function shouldHideLocalE2ETokens(): boolean {
  return process.env.HIDE_LOCAL_E2E_TOKENS !== 'false'
}

function getFinalizedBlock(lastIndexedBlock: bigint, confirmationDepth: bigint): bigint {
  return lastIndexedBlock > confirmationDepth ? lastIndexedBlock - confirmationDepth : 0n
}

function clampClaimsLimit(limit: number | null | undefined): number {
  if (!Number.isInteger(limit) || (limit ?? 0) <= 0) {
    return DEFAULT_CLAIMS_LIMIT
  }
  return Math.min(limit!, MAX_CLAIMS_LIMIT)
}

function toUnixSeconds(value: Date | string | null): number | null {
  if (!value) {
    return null
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const timestamp = Number(value)
    return Number.isInteger(timestamp) && timestamp >= 0 ? timestamp : null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000)
}

async function upsertCheckpoint(
  executor: SqlExecutor,
  input: ResetCheckpointInput,
): Promise<void> {
  await executor.execute(sql`
    insert into indexer_checkpoints (
      consumer_name,
      chain_id,
      cursor_key,
      last_indexed_block,
      last_finalized_block,
      updated_at
    )
    values (
      ${CONSUMER_NAME},
      ${input.chainId},
      ${normalizeAddress(input.cursorKey)},
      ${input.lastIndexedBlock.toString()},
      ${input.lastFinalizedBlock.toString()},
      now()
    )
    on conflict (consumer_name, chain_id, cursor_key) do update set
      last_indexed_block = excluded.last_indexed_block,
      last_finalized_block = excluded.last_finalized_block,
      updated_at = now()
  `)
}

async function markConfirmedAccruals(
  executor: SqlExecutor,
  chainId: number,
  finalizedBlock: bigint,
): Promise<void> {
  await executor.execute(sql`
    update creator_fee_accruals
    set confirmed = true
    where chain_id = ${chainId}
      and canonical = true
      and confirmed = false
      and block_number <= ${finalizedBlock.toString()}
  `)
}

async function markConfirmedClaims(
  executor: SqlExecutor,
  chainId: number,
  finalizedBlock: bigint,
): Promise<void> {
  await executor.execute(sql`
    update creator_fee_claims
    set confirmed = true
    where chain_id = ${chainId}
      and canonical = true
      and confirmed = false
      and block_number <= ${finalizedBlock.toString()}
  `)
}

async function refreshCreatorFeeAggregates(
  executor: SqlExecutor,
  chainId: number,
  creatorAddresses: string[],
): Promise<void> {
  const creators = [...new Set(creatorAddresses.map(normalizeAddress).filter((value) => value.length > 0))]
  if (creators.length === 0) {
    return
  }

  const creatorValues = sql.join(creators.map((creator) => sql`(${creator})`), sql`, `)
  const creatorScope = sql`(
    select creator_address
    from (values ${creatorValues}) as creator_scope(creator_address)
  )`

  await executor.execute(sql`
    delete from creator_token_fee_facts
    where chain_id = ${chainId}
      and creator_address in ${creatorScope}
  `)

  await executor.execute(sql`
    insert into creator_token_fee_facts (
      chain_id,
      creator_address,
      token_address,
      accrued_raw,
      updated_at
    )
    select
      chain_id,
      creator_address,
      token_address,
      coalesce(sum(creator_fee_raw), 0)::numeric(78, 0) as accrued_raw,
      now()
    from creator_fee_accruals
    where chain_id = ${chainId}
      and creator_address in ${creatorScope}
      and canonical = true
    group by chain_id, creator_address, token_address
  `)

  await executor.execute(sql`
    delete from creator_fee_facts
    where chain_id = ${chainId}
      and creator_address in ${creatorScope}
  `)

  await executor.execute(sql`
    insert into creator_fee_facts (
      chain_id,
      creator_address,
      total_accrued_raw,
      total_claimed_raw,
      token_count,
      updated_at
    )
    with creators as ${creatorScope},
    accrued as (
      select
        creator_address,
        coalesce(sum(creator_fee_raw), 0)::numeric(78, 0) as total_accrued_raw
      from creator_fee_accruals
      where chain_id = ${chainId}
        and creator_address in ${creatorScope}
        and canonical = true
      group by creator_address
    ),
    claimed as (
      select
        creator_address,
        coalesce(sum(amount_raw), 0)::numeric(78, 0) as total_claimed_raw
      from creator_fee_claims
      where chain_id = ${chainId}
        and creator_address in ${creatorScope}
        and canonical = true
      group by creator_address
    ),
    token_counts as (
      select
        creator_address,
        count(*)::integer as token_count
      from creator_token_fee_facts
      where chain_id = ${chainId}
        and creator_address in ${creatorScope}
      group by creator_address
    )
    select
      ${chainId},
      creators.creator_address,
      coalesce(accrued.total_accrued_raw, 0)::numeric(78, 0),
      coalesce(claimed.total_claimed_raw, 0)::numeric(78, 0),
      coalesce(token_counts.token_count, 0)::integer,
      now()
    from creators
    left join accrued on accrued.creator_address = creators.creator_address
    left join claimed on claimed.creator_address = creators.creator_address
    left join token_counts on token_counts.creator_address = creators.creator_address
    where coalesce(accrued.total_accrued_raw, 0) > 0::numeric
      or coalesce(claimed.total_claimed_raw, 0) > 0::numeric
      or coalesce(token_counts.token_count, 0) > 0
  `)
}

export class PostgresCreatorFeeStore {
  get enabled(): boolean {
    return postgresEnabled
  }

  async getCreatorFeeCheckpointMetadata(
    chainId: number,
    cursorKey: string,
  ): Promise<CreatorFeeCheckpointMetadata> {
    if (!db) {
      return { lastIndexedBlock: null, lastFinalizedBlock: null }
    }

    const [checkpoint] = await db
      .select({
        lastIndexedBlock: indexerCheckpoints.lastIndexedBlock,
        lastFinalizedBlock: indexerCheckpoints.lastFinalizedBlock,
      })
      .from(indexerCheckpoints)
      .where(
        sql`${indexerCheckpoints.consumerName} = ${CONSUMER_NAME}
          and ${indexerCheckpoints.chainId} = ${chainId}
          and ${indexerCheckpoints.cursorKey} = ${normalizeAddress(cursorKey)}`,
      )
      .limit(1)

    if (!checkpoint) {
      return { lastIndexedBlock: null, lastFinalizedBlock: null }
    }

    return {
      lastIndexedBlock: BigInt(checkpoint.lastIndexedBlock),
      lastFinalizedBlock: BigInt(checkpoint.lastFinalizedBlock),
    }
  }

  async getLastIndexedBlock(chainId: number, cursorKey: string): Promise<bigint | null> {
    const metadata = await this.getCreatorFeeCheckpointMetadata(chainId, cursorKey)
    return metadata.lastIndexedBlock
  }

  async getCanonicalBlocksInRange(
    chainId: number,
    contractAddress: string,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<StoredCanonicalBlock[]> {
    if (!db) {
      return []
    }

    const result = await db.execute(sql`
      select distinct block_number::text as block_number, block_hash
      from raw_chain_logs
      where chain_id = ${chainId}
        and canonical = true
        and contract_address = ${normalizeAddress(contractAddress)}
        and block_number >= ${fromBlock.toString()}::numeric
        and block_number <= ${toBlock.toString()}::numeric
      order by block_number asc
    `)

    return result.rows.map((row) => ({
      blockNumber: BigInt(row.block_number as string),
      blockHash: row.block_hash as string,
    }))
  }

  async getCanonicalLogsInRange(
    chainId: number,
    contractAddress: string | null,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<StoredCanonicalLog[]> {
    if (!db) {
      return []
    }

    const result = await db.execute(sql`
      select
        block_number::text as block_number,
        block_hash,
        transaction_hash,
        transaction_index,
        log_index
      from raw_chain_logs
      where chain_id = ${chainId}
        ${contractAddress
          ? sql`and contract_address = ${normalizeAddress(contractAddress)}`
          : sql``}
        and canonical = true
        and block_number >= ${fromBlock.toString()}::numeric
        and block_number <= ${toBlock.toString()}::numeric
      order by block_number asc, transaction_index asc, log_index asc
    `)

    return result.rows.map((row) => ({
      blockNumber: BigInt(row.block_number as string),
      blockHash: row.block_hash as string,
      transactionHash: row.transaction_hash as string,
      transactionIndex: row.transaction_index as number,
      logIndex: row.log_index as number,
    }))
  }

  async persistEvents(input: PersistCreatorFeeEventsInput): Promise<void> {
    if (!db) {
      throw new Error('PostgreSQL creator fee store is not configured')
    }

    const finalizedBlock = getFinalizedBlock(input.block.number, input.confirmationDepth)
    const affectedCreators = [
      ...input.accruals.map((accrual) => accrual.creatorAddress),
      ...input.claims.map((claim) => claim.creatorAddress),
    ]

    await db.transaction(async (tx) => {
      await tx
        .insert(chainBlocks)
        .values({
          chainId: input.chainId,
          blockNumber: input.block.number.toString(),
          blockHash: input.block.hash.toLowerCase(),
          parentHash: (input.block.parentHash ?? input.block.hash).toLowerCase(),
          blockTimestamp: new Date(input.block.timestamp * 1000),
        })
        .onConflictDoNothing({
          target: [chainBlocks.chainId, chainBlocks.blockNumber, chainBlocks.blockHash],
        })
      await tx.execute(sql`
        update chain_blocks
        set canonical = true
        where chain_id = ${input.chainId}
          and block_number = ${input.block.number.toString()}::numeric
          and block_hash = ${input.block.hash.toLowerCase()}
      `)

      if ((input.rawLogs?.length ?? 0) > 0) {
        await tx
          .insert(rawChainLogs)
          .values(
            input.rawLogs!.map((log) => ({
              chainId: input.chainId,
              blockNumber: log.blockNumber.toString(),
              blockHash: log.blockHash.toLowerCase(),
              transactionHash: log.transactionHash.toLowerCase(),
              transactionIndex: log.transactionIndex,
              logIndex: log.logIndex,
              contractAddress: normalizeAddress(log.contractAddress),
              topic0: log.topic0.toLowerCase(),
              topics: log.topics.map((topic) => topic.toLowerCase()),
              data: log.data.toLowerCase(),
              eventName: log.eventName,
              decodedArgs: log.decodedArgs,
            })),
          )
          .onConflictDoNothing()
        for (const log of input.rawLogs!) {
          await tx.execute(sql`
            update raw_chain_logs
            set canonical = true
            where chain_id = ${input.chainId}
              and block_hash = ${log.blockHash.toLowerCase()}
              and transaction_hash = ${log.transactionHash.toLowerCase()}
              and log_index = ${log.logIndex}
              and contract_address = ${normalizeAddress(log.contractAddress)}
          `)
        }
      }

      if (input.accruals.length > 0) {
        await tx
          .insert(creatorFeeAccruals)
          .values(
            input.accruals.map((accrual) => ({
              chainId: input.chainId,
              tokenAddress: normalizeAddress(accrual.tokenAddress),
              marketAddress: normalizeAddress(accrual.marketAddress),
              creatorAddress: normalizeAddress(accrual.creatorAddress),
              platformFeeRaw: accrual.platformFeeRaw.toString(),
              creatorFeeRaw: accrual.creatorFeeRaw.toString(),
              transactionHash: accrual.transactionHash.toLowerCase(),
              transactionIndex: accrual.transactionIndex,
              logIndex: accrual.logIndex,
              blockNumber: accrual.blockNumber.toString(),
              blockHash: accrual.blockHash.toLowerCase(),
              blockTimestamp: new Date(accrual.blockTimestamp * 1000),
            })),
          )
          .onConflictDoNothing()
        for (const accrual of input.accruals) {
          await tx.execute(sql`
            update creator_fee_accruals
            set canonical = true, confirmed = false
            where chain_id = ${input.chainId}
              and block_hash = ${accrual.blockHash.toLowerCase()}
              and transaction_hash = ${accrual.transactionHash.toLowerCase()}
              and log_index = ${accrual.logIndex}
          `)
        }
      }

      if (input.claims.length > 0) {
        await tx
          .insert(creatorFeeClaims)
          .values(
            input.claims.map((claim) => ({
              chainId: input.chainId,
              creatorAddress: normalizeAddress(claim.creatorAddress),
              recipientAddress: normalizeAddress(claim.recipientAddress),
              amountRaw: claim.amountRaw.toString(),
              transactionHash: claim.transactionHash.toLowerCase(),
              transactionIndex: claim.transactionIndex,
              logIndex: claim.logIndex,
              blockNumber: claim.blockNumber.toString(),
              blockHash: claim.blockHash.toLowerCase(),
              blockTimestamp: new Date(claim.blockTimestamp * 1000),
            })),
          )
          .onConflictDoNothing()
        for (const claim of input.claims) {
          await tx.execute(sql`
            update creator_fee_claims
            set canonical = true, confirmed = false
            where chain_id = ${input.chainId}
              and block_hash = ${claim.blockHash.toLowerCase()}
              and transaction_hash = ${claim.transactionHash.toLowerCase()}
              and log_index = ${claim.logIndex}
          `)
        }
      }

      await markConfirmedAccruals(tx, input.chainId, finalizedBlock)
      await markConfirmedClaims(tx, input.chainId, finalizedBlock)
      await refreshCreatorFeeAggregates(tx, input.chainId, affectedCreators)

      if (input.advanceCheckpoint !== false) {
        await upsertCheckpoint(tx, {
          chainId: input.chainId,
          cursorKey: input.cursorKey,
          lastIndexedBlock: input.block.number,
          lastFinalizedBlock: finalizedBlock,
        })
      }
    })
  }

  async advanceCheckpoint(input: AdvanceCheckpointInput): Promise<void> {
    if (!db) {
      throw new Error('PostgreSQL creator fee store is not configured')
    }

    const finalizedBlock = getFinalizedBlock(input.lastIndexedBlock, input.confirmationDepth)

    await db.transaction(async (tx) => {
      await upsertCheckpoint(tx, {
        chainId: input.chainId,
        cursorKey: input.cursorKey,
        lastIndexedBlock: input.lastIndexedBlock,
        lastFinalizedBlock: finalizedBlock,
      })
      await markConfirmedAccruals(tx, input.chainId, finalizedBlock)
      await markConfirmedClaims(tx, input.chainId, finalizedBlock)
    })
  }

  async resetCheckpoint(input: ResetCheckpointInput): Promise<void> {
    if (!db) {
      throw new Error('PostgreSQL creator fee store is not configured')
    }

    await upsertCheckpoint(db, input)
  }

  async rollbackCanonicalFromBlock(
    chainId: number,
    cursorKey: string,
    fromBlock: bigint,
  ): Promise<RollbackCanonicalResult> {
    if (!db) {
      throw new Error('PostgreSQL creator fee store is not configured')
    }

    const resetToBlock = fromBlock > 0n ? fromBlock - 1n : 0n
    const result = await db.execute(sql`
      with affected_creators as (
        select distinct creator_address
        from creator_fee_accruals
        where chain_id = ${chainId}
          and canonical = true
          and block_number >= ${fromBlock.toString()}::numeric
        union
        select distinct creator_address
        from creator_fee_claims
        where chain_id = ${chainId}
          and canonical = true
          and block_number >= ${fromBlock.toString()}::numeric
      )
      select creator_address
      from affected_creators
    `)
    const affectedCreatorAddresses = result.rows.map((row) => row.creator_address as string)

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        update raw_chain_logs
        set canonical = false
        where chain_id = ${chainId}
          and canonical = true
          and contract_address = ${normalizeAddress(cursorKey)}
          and block_number >= ${fromBlock.toString()}::numeric
      `)

      await tx.execute(sql`
        update creator_fee_accruals
        set canonical = false, confirmed = false
        where chain_id = ${chainId}
          and canonical = true
          and block_number >= ${fromBlock.toString()}::numeric
      `)

      await tx.execute(sql`
        update creator_fee_claims
        set canonical = false, confirmed = false
        where chain_id = ${chainId}
          and canonical = true
          and block_number >= ${fromBlock.toString()}::numeric
      `)

      await refreshCreatorFeeAggregates(tx, chainId, affectedCreatorAddresses)

      await upsertCheckpoint(tx, {
        chainId,
        cursorKey,
        lastIndexedBlock: resetToBlock,
        lastFinalizedBlock: resetToBlock,
      })
    })

    return {
      affectedCreatorAddresses,
      resetToBlock,
    }
  }

  async getCreatorFees(
    chainId: number,
    creatorAddress: string,
    feeVaultAddress: string,
    limit?: number | null,
  ): Promise<CreatorFeesResponse> {
    if (!db) {
      throw new Error('PostgreSQL creator fee store is not configured')
    }

    const creator = normalizeAddress(creatorAddress)
    const pageLimit = clampClaimsLimit(limit)
    const hiddenTokenAddresses = [...new Set(getHiddenTokenAddresses())]
    const hiddenTokenFilter = hiddenTokenAddresses.length > 0
      ? sql`and f.token_address not in (${sql.join(hiddenTokenAddresses.map((address) => sql`${address}`), sql`, `)})`
      : sql``
    const localE2ETokenFilter = shouldHideLocalE2ETokens()
      ? sql`and not (
          lower(coalesce(m.name, '')) = ${LOCAL_E2E_TOKEN_NAME}
          and lower(coalesce(m.symbol, '')) = ${LOCAL_E2E_TOKEN_SYMBOL}
        )`
      : sql``

    const [summaryResult, tokenResult, allTokenTotalResult, claimResult, claimable] = await Promise.all([
      db.execute(sql`
        select
          total_accrued_raw::text as total_accrued,
          total_claimed_raw::text as total_claimed
        from creator_fee_facts
        where chain_id = ${chainId}
          and creator_address = ${creator}
        limit 1
      `),
      db.execute(sql`
        select
          f.token_address,
          coalesce(m.name, '') as name,
          coalesce(m.symbol, '') as symbol,
          coalesce(m.token_image, '') as token_image,
          f.accrued_raw::text as accrued
        from creator_token_fee_facts f
        left join token_markets m
          on m.chain_id = f.chain_id and m.token_address = f.token_address
        where f.chain_id = ${chainId}
          and f.creator_address = ${creator}
          ${hiddenTokenFilter}
          ${localE2ETokenFilter}
        order by f.accrued_raw desc, f.token_address asc
      `),
      db.execute(sql`
        select coalesce(sum(accrued_raw), 0)::numeric(78, 0)::text as total_accrued
        from creator_token_fee_facts
        where chain_id = ${chainId}
          and creator_address = ${creator}
      `),
      db.execute(sql`
        select
          recipient_address,
          amount_raw::text as amount,
          transaction_hash,
          block_number::text as block_number,
          block_timestamp
        from creator_fee_claims
        where chain_id = ${chainId}
          and creator_address = ${creator}
          and canonical = true
        order by block_timestamp desc, id desc
        limit ${pageLimit}
      `),
      viemClient.readContract({
        address: feeVaultAddress as `0x${string}`,
        abi: feeVaultCreatorAbi,
        functionName: 'creatorFeesClaimable',
        args: [creatorAddress as `0x${string}`],
      }),
    ])

    const summary = summaryResult.rows[0]
    const totalAccrued = (summary?.total_accrued as string | undefined) ?? '0'
    const totalClaimed = (summary?.total_claimed as string | undefined) ?? '0'
    const visibleTotalAccrued = tokenResult.rows.reduce(
      (sum, row) => sum + BigInt(row.accrued as string),
      0n,
    )
    const allTokenTotalAccrued = BigInt(
      (allTokenTotalResult.rows[0]?.total_accrued as string | undefined) ?? totalAccrued,
    )
    const hasPresentationFilter =
      hiddenTokenAddresses.length > 0 || shouldHideLocalE2ETokens()
    const hiddenAccrued =
      hasPresentationFilter && allTokenTotalAccrued > visibleTotalAccrued
        ? allTokenTotalAccrued - visibleTotalAccrued
        : 0n
    const chainClaimable = BigInt(claimable.toString())
    const visibleClaimable =
      hasPresentationFilter && chainClaimable > hiddenAccrued
        ? chainClaimable - hiddenAccrued
        : hasPresentationFilter
          ? 0n
          : chainClaimable
    const visibleTotalClaimed =
      hasPresentationFilter && BigInt(totalClaimed) > visibleTotalAccrued
        ? visibleTotalAccrued.toString()
        : totalClaimed
    const indexedVisibleClaimable =
      visibleTotalAccrued > BigInt(visibleTotalClaimed)
        ? visibleTotalAccrued - BigInt(visibleTotalClaimed)
        : 0n

    return {
      creatorAddress,
      feeVaultAddress,
      claimable: hasPresentationFilter ? indexedVisibleClaimable.toString() : visibleClaimable.toString(),
      totalAccrued: hasPresentationFilter ? visibleTotalAccrued.toString() : totalAccrued,
      totalClaimed: visibleTotalClaimed,
      tokenEarnings: tokenResult.rows.map((row) => ({
        tokenAddress: row.token_address as string,
        name: row.name as string,
        symbol: row.symbol as string,
        tokenImage: row.token_image as string,
        accrued: row.accrued as string,
      })),
      claims: claimResult.rows.map((row) => ({
        recipient: row.recipient_address as string,
        amount: row.amount as string,
        transactionHash: row.transaction_hash as string,
        blockNumber: row.block_number as string,
        timestamp: toUnixSeconds((row.block_timestamp as string | Date | null) ?? null),
      })),
    }
  }
}

export const postgresCreatorFeeStore = new PostgresCreatorFeeStore()
