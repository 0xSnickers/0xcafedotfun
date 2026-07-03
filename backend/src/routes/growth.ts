import { Request, Response, Router } from 'express'
import { isAddress } from 'viem'
import { db, postgresEnabled } from '../clients/postgresClient'
import { viemClient } from '../clients/viemClient'
import { growthAppeals, growthReferrals, growthRewards } from '../db/schema'
import { REWARD_DELAY_SECONDS, scoreGrowthTrade } from '../services/growthScoring'
import { sql } from 'drizzle-orm'

const router = Router()
const LEADERBOARD_TYPES = new Set(['new', 'trending', 'near-graduation', 'graduated'])
const MIN_QUALIFIED_REFERRAL_POINTS = 10
const OFFICIAL_TOKEN_SQL = sql`coalesce(m.is_official, lower(m.token_address) like '0xcafe%') = true`

function requireStore(): NonNullable<typeof db> {
  if (!postgresEnabled || !db) throw new Error('DATABASE_URL is required')
  return db
}

async function syncWalletGrowthRewards(walletAddress: string) {
  const store = requireStore()
  const wallet = walletAddress.toLowerCase()
  await store.execute(sql`
    update growth_rewards r
    set
      points = 0,
      status = 'rejected',
      risk_flags = '["non_canonical_or_unconfirmed"]'::jsonb,
      updated_at = now()
    where r.chain_id = ${viemClient.chain.id}
      and r.wallet_address = ${wallet}
      and r.reason = 'canonical_trade'
      and not exists (
        select 1
        from market_trades t
        left join token_markets m
          on m.chain_id = t.chain_id and m.token_address = t.token_address
        where t.id = r.source_trade_id
          and t.chain_id = r.chain_id
          and t.trader_address = r.wallet_address
          and t.confirmed = true
          and t.canonical = true
          and ${OFFICIAL_TOKEN_SQL}
      )
  `)
  const result = await store.execute(sql`
    select
      t.id::text,
      t.token_address,
      t.side,
      t.quote_amount_gross_raw,
      t.block_timestamp,
      m.creator_address
    from market_trades t
    left join token_markets m
      on m.chain_id = t.chain_id and m.token_address = t.token_address
    where t.chain_id = ${viemClient.chain.id}
      and t.trader_address = ${wallet}
      and t.confirmed = true
      and t.canonical = true
      and ${OFFICIAL_TOKEN_SQL}
    order by t.block_timestamp asc, t.id asc
  `)

  const tradingDays = new Set<string>()
  const markets = new Set<string>()
  const previousSides = new Map<string, Partial<Record<'buy' | 'sell', Date>>>()

  for (const row of result.rows) {
    const side = row.side as 'buy' | 'sell'
    const tokenAddress = String(row.token_address)
    const timestamp = new Date(String(row.block_timestamp))
    const opposite = side === 'buy' ? 'sell' : 'buy'
    const previousOpposite = previousSides.get(tokenAddress)?.[opposite]
    const secondsSincePreviousOppositeTrade = previousOpposite
      ? Math.max(0, Math.floor((timestamp.getTime() - previousOpposite.getTime()) / 1000))
      : null

    tradingDays.add(timestamp.toISOString().slice(0, 10))
    markets.add(tokenAddress)
    const score = scoreGrowthTrade({
      grossQuoteRaw: BigInt(String(row.quote_amount_gross_raw ?? '0')),
      traderAddress: wallet,
      creatorAddress: row.creator_address ? String(row.creator_address) : null,
      side,
      secondsSincePreviousOppositeTrade,
      distinctTradingDays: tradingDays.size,
      distinctMarkets: markets.size,
    })
    const settlesAt = new Date(timestamp.getTime() + REWARD_DELAY_SECONDS * 1000)
    const status = score.eligible
      ? settlesAt.getTime() <= Date.now() ? 'confirmed' as const : 'pending' as const
      : 'rejected' as const

    await store
      .insert(growthRewards)
      .values({
        chainId: viemClient.chain.id,
        walletAddress: wallet,
        sourceTradeId: BigInt(String(row.id)),
        reason: 'canonical_trade',
        points: score.points,
        status,
        riskFlags: score.riskFlags,
        settlesAt,
      })
      .onConflictDoUpdate({
        target: [growthRewards.chainId, growthRewards.sourceTradeId, growthRewards.reason],
        set: {
          points: score.points,
          status,
          riskFlags: score.riskFlags,
          settlesAt,
          updatedAt: new Date(),
        },
      })

    const sides = previousSides.get(tokenAddress) ?? {}
    sides[side] = timestamp
    previousSides.set(tokenAddress, sides)
  }

  await store.execute(sql`
    update growth_rewards
    set status = 'confirmed', updated_at = now()
    where chain_id = ${viemClient.chain.id}
      and wallet_address = ${wallet}
      and status = 'pending'
      and settles_at <= now()
  `)

  const summary = await store.execute(sql`
    select
      coalesce(sum(points) filter (where status = 'confirmed'), 0)::integer as confirmed_points,
      coalesce(sum(points) filter (where status = 'pending'), 0)::integer as pending_points,
      count(*) filter (where status = 'confirmed')::integer as confirmed_rewards,
      count(*) filter (where status = 'pending')::integer as pending_rewards,
      count(*) filter (where status = 'rejected')::integer as rejected_rewards
    from growth_rewards
    where chain_id = ${viemClient.chain.id} and wallet_address = ${wallet}
  `)
  const facts = summary.rows[0]!

  if (Number(facts.confirmed_points) >= MIN_QUALIFIED_REFERRAL_POINTS) {
    await store.execute(sql`
      update growth_referrals
      set qualified = true, qualified_at = coalesce(qualified_at, now())
      where chain_id = ${viemClient.chain.id}
        and invitee_address = ${wallet}
        and qualified = false
    `)
  }

  return facts
}

router.get('/leaderboards/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const type = req.params.type
    if (!LEADERBOARD_TYPES.has(type)) {
      res.status(400).json({ error: 'Invalid leaderboard type' })
      return
    }
    const store = requireStore()
    const result = await store.execute(sql`
      with facts as (
        select
          m.token_address,
          m.bonding_curve_address as market_address,
          m.name,
          m.symbol,
          m.creator_address,
          m.stage,
          m.created_at,
          count(distinct t.trader_address) filter (
            where t.confirmed = true and t.canonical = true
              and t.trader_address is distinct from m.creator_address
          )::integer as independent_traders,
          count(*) filter (where t.confirmed = true and t.canonical = true)::integer as trade_count,
          count(distinct date_trunc('hour', t.block_timestamp)) filter (
            where t.confirmed = true and t.canonical = true
          )::integer as active_hours,
          count(*) filter (
            where t.confirmed = true and t.canonical = true
              and t.side = 'buy' and t.trader_address = m.creator_address
          )::integer as creator_self_trades
        from token_markets m
        left join market_trades t
          on t.chain_id = m.chain_id and t.token_address = m.token_address
        where m.chain_id = ${viemClient.chain.id}
          and ${OFFICIAL_TOKEN_SQL}
        group by m.chain_id, m.token_address
      )
      select *,
        greatest(
          independent_traders * 20 + trade_count * 2 + active_hours * 10 - creator_self_trades * 50,
          0
        )::integer as trend_score
      from facts
      where
        (${type} = 'new' and stage = 'bonding_curve_live')
        or (${type} = 'trending' and stage = 'bonding_curve_live')
        or (${type} = 'near-graduation' and stage = 'graduated_pending_liquidity')
        or (${type} = 'graduated' and stage = 'dex_live')
      order by
        case when ${type} = 'new' then extract(epoch from created_at) else
          greatest(independent_traders * 20 + trade_count * 2 + active_hours * 10 - creator_self_trades * 50, 0)
        end desc
      limit 50
    `)
    res.json({ type, markets: result.rows })
  } catch (error) {
    console.error('Failed to query growth leaderboard:', error)
    res.status(500).json({ error: 'Failed to query growth leaderboard' })
  }
})

router.get('/traders/:walletAddress/points', async (req: Request, res: Response): Promise<void> => {
  try {
    const wallet = req.params.walletAddress
    if (!isAddress(wallet)) {
      res.status(400).json({ error: 'Invalid wallet address' })
      return
    }
    const facts = await syncWalletGrowthRewards(wallet)
    res.json({
      walletAddress: wallet,
      points: Number(facts.confirmed_points),
      pendingPoints: Number(facts.pending_points),
      confirmedRewards: Number(facts.confirmed_rewards),
      pendingRewards: Number(facts.pending_rewards),
      rejectedRewards: Number(facts.rejected_rewards),
      settlementDelayHours: REWARD_DELAY_SECONDS / 3600,
    })
  } catch (error) {
    console.error('Failed to query trader points:', error)
    res.status(500).json({ error: 'Failed to query trader points' })
  }
})

router.get('/creators/:walletAddress/profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const wallet = req.params.walletAddress
    if (!isAddress(wallet)) {
      res.status(400).json({ error: 'Invalid wallet address' })
      return
    }
    const result = await requireStore().execute(sql`
      select
        count(*)::integer as token_count,
        count(*) filter (where stage = 'dex_live')::integer as graduated_count,
        count(*) filter (where stage = 'bonding_curve_live')::integer as active_count
      from token_markets m
      where chain_id = ${viemClient.chain.id}
        and creator_address = ${wallet.toLowerCase()}
        and ${OFFICIAL_TOKEN_SQL}
    `)
    const facts = result.rows[0]!
    const graduated = Number(facts.graduated_count)
    const tokens = Number(facts.token_count)
    const level = graduated > 0 ? 'graduated' : tokens > 1 ? 'active' : tokens > 0 ? 'new' : 'none'
    res.json({
      walletAddress: wallet,
      level,
      verified: false,
      badges: graduated > 0 ? ['graduated-creator'] : [],
      ...facts,
    })
  } catch (error) {
    console.error('Failed to query creator growth profile:', error)
    res.status(500).json({ error: 'Failed to query creator growth profile' })
  }
})

router.get('/referrals/:inviterAddress', async (req: Request, res: Response): Promise<void> => {
  try {
    const inviter = req.params.inviterAddress
    if (!isAddress(inviter)) {
      res.status(400).json({ error: 'Invalid inviter address' })
      return
    }
    const rows = await requireStore()
      .select()
      .from(growthReferrals)
      .where(sql`${growthReferrals.chainId} = ${viemClient.chain.id}
        and ${growthReferrals.inviterAddress} = ${inviter.toLowerCase()}`)
    res.json({
      inviterAddress: inviter,
      referrals: rows,
      qualifiedCount: rows.filter((row) => row.qualified).length,
    })
  } catch (error) {
    console.error('Failed to query referrals:', error)
    res.status(500).json({ error: 'Failed to query referrals' })
  }
})

router.post('/referrals', async (req: Request, res: Response): Promise<void> => {
  try {
    const { inviteeAddress, inviterAddress } = req.body as Record<string, unknown>
    if (
      typeof inviteeAddress !== 'string' ||
      typeof inviterAddress !== 'string' ||
      !isAddress(inviteeAddress) ||
      !isAddress(inviterAddress) ||
      inviteeAddress.toLowerCase() === inviterAddress.toLowerCase()
    ) {
      res.status(400).json({ error: 'Invalid referral' })
      return
    }
    const [created] = await requireStore()
      .insert(growthReferrals)
      .values({
        chainId: viemClient.chain.id,
        inviteeAddress: inviteeAddress.toLowerCase(),
        inviterAddress: inviterAddress.toLowerCase(),
      })
      .onConflictDoNothing()
      .returning()
    res.status(created ? 201 : 409).json(created ?? { error: 'Referral already exists' })
  } catch (error) {
    console.error('Failed to create referral:', error)
    res.status(500).json({ error: 'Failed to create referral' })
  }
})

router.post('/appeals', async (req: Request, res: Response): Promise<void> => {
  try {
    const { walletAddress, reason, evidence } = req.body as Record<string, unknown>
    if (
      typeof walletAddress !== 'string' ||
      !isAddress(walletAddress) ||
      typeof reason !== 'string' ||
      reason.trim().length < 10
    ) {
      res.status(400).json({ error: 'Invalid appeal' })
      return
    }
    const [appeal] = await requireStore().insert(growthAppeals).values({
      chainId: viemClient.chain.id,
      walletAddress: walletAddress.toLowerCase(),
      reason: reason.trim(),
      evidence: typeof evidence === 'string' ? evidence.trim() : null,
    }).returning()
    res.status(201).json(appeal)
  } catch (error) {
    console.error('Failed to create appeal:', error)
    res.status(500).json({ error: 'Failed to create appeal' })
  }
})

router.get('/admin/appeals', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!process.env.GROWTH_ADMIN_KEY || req.header('x-admin-key') !== process.env.GROWTH_ADMIN_KEY) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    const rows = await requireStore().select().from(growthAppeals).orderBy(sql`${growthAppeals.createdAt} desc`)
    res.json({ appeals: rows })
  } catch (error) {
    console.error('Failed to query growth appeals:', error)
    res.status(500).json({ error: 'Failed to query growth appeals' })
  }
})

export default router
