import { sql, SQL } from 'drizzle-orm'

export interface CandleBucket {
  tokenAddress: string
  bucketStart: Date
}

interface SqlExecutor {
  execute(query: SQL): Promise<unknown>
}

function getBucketLockKey(tokenAddress: string, bucketStart: Date): string {
  return `${tokenAddress.toLowerCase()}:${bucketStart.toISOString()}`
}

export function getTradeMinuteBucket(timestamp: number): Date {
  return new Date(Math.floor(timestamp / 60) * 60_000)
}

export function getAffectedCandleBuckets(
  trades: Array<{ tokenAddress: string; timestamp: number }>,
): CandleBucket[] {
  const buckets = new Map<string, CandleBucket>()

  for (const trade of trades) {
    const tokenAddress = trade.tokenAddress.toLowerCase()
    const bucketStart = getTradeMinuteBucket(trade.timestamp)
    buckets.set(`${tokenAddress}:${bucketStart.toISOString()}`, {
      tokenAddress,
      bucketStart,
    })
  }

  return [...buckets.values()]
}

export async function rebuildCandleBucket(
  executor: SqlExecutor,
  chainId: number,
  bucket: CandleBucket,
): Promise<void> {
  const bucketStart = new Date(bucket.bucketStart)
  if (Number.isNaN(bucketStart.getTime())) {
    throw new Error(`Invalid Candle bucket start: ${bucket.bucketStart}`)
  }

  await executor.execute(sql`
    select pg_advisory_xact_lock(
      hashtextextended(${getBucketLockKey(bucket.tokenAddress, bucketStart)}, ${chainId}::bigint)
    )
  `)

  await executor.execute(sql`
    with ordered_trades as (
      select
        id,
        mark_price_quote_per_token_x18,
        token_amount_raw,
        quote_amount_gross_raw,
        quote_amount_net_raw,
        row_number() over (
          order by block_number, transaction_index, log_index, id
        ) as sequence_asc,
        row_number() over (
          order by block_number desc, transaction_index desc, log_index desc, id desc
        ) as sequence_desc
      from market_trades
      where chain_id = ${chainId}
        and token_address = ${bucket.tokenAddress}
        and canonical = true
        and block_timestamp >= ${bucketStart}
        and block_timestamp < ${new Date(bucketStart.getTime() + 60_000)}
    ),
    previous_close as (
      select mark_price_quote_per_token_x18 as price
      from market_trades
      where chain_id = ${chainId}
        and token_address = ${bucket.tokenAddress}
        and canonical = true
        and block_timestamp < ${bucketStart}
      order by block_number desc, transaction_index desc, log_index desc, id desc
      limit 1
    ),
    market_initial_price as (
      select initial_price_x18 as price
      from token_markets
      where chain_id = ${chainId}
        and token_address = ${bucket.tokenAddress}
      limit 1
    ),
    aggregated as (
      select
        max(mark_price_quote_per_token_x18) filter (where sequence_asc = 1) as first_trade_price,
        max(mark_price_quote_per_token_x18) as trade_high_price,
        min(mark_price_quote_per_token_x18) as trade_low_price,
        max(mark_price_quote_per_token_x18) filter (where sequence_desc = 1) as close_price,
        coalesce(sum(token_amount_raw), 0) as volume_token,
        coalesce(sum(quote_amount_gross_raw), 0) as volume_quote_gross,
        coalesce(sum(quote_amount_net_raw), 0) as volume_quote_net,
        bool_and(quote_amount_gross_raw is not null) as volume_quote_gross_complete,
        bool_and(quote_amount_net_raw is not null) as volume_quote_net_complete,
        count(*)::integer as trade_count,
        max(id) filter (where sequence_asc = 1) as first_trade_id,
        max(id) filter (where sequence_desc = 1) as last_trade_id
      from ordered_trades
    ),
    projected as (
      select
        coalesce(
          (select price from previous_close),
          (select price from market_initial_price),
          first_trade_price
        ) as open_price,
        greatest(
          trade_high_price,
          coalesce(
            (select price from previous_close),
            (select price from market_initial_price),
            first_trade_price
          )
        ) as high_price,
        least(
          trade_low_price,
          coalesce(
            (select price from previous_close),
            (select price from market_initial_price),
            first_trade_price
          )
        ) as low_price,
        close_price,
        volume_token,
        volume_quote_gross,
        volume_quote_net,
        volume_quote_gross_complete,
        volume_quote_net_complete,
        trade_count,
        first_trade_id,
        last_trade_id
      from aggregated
    ),
    upserted as (
      insert into market_candles_1m (
        chain_id,
        token_address,
        bucket_start,
        open_price_quote_per_token_x18,
        high_price_quote_per_token_x18,
        low_price_quote_per_token_x18,
        close_price_quote_per_token_x18,
        volume_token_raw,
        volume_quote_gross_raw,
        volume_quote_net_raw,
        volume_quote_gross_complete,
        volume_quote_net_complete,
        trade_count,
        first_trade_id,
        last_trade_id,
        dirty,
        updated_at
      )
      select
        ${chainId},
        ${bucket.tokenAddress},
        ${bucketStart},
        open_price,
        high_price,
        low_price,
        close_price,
        volume_token,
        volume_quote_gross,
        volume_quote_net,
        volume_quote_gross_complete,
        volume_quote_net_complete,
        trade_count,
        first_trade_id,
        last_trade_id,
        false,
        now()
      from projected
      where trade_count > 0
      on conflict (chain_id, token_address, bucket_start) do update set
        open_price_quote_per_token_x18 = excluded.open_price_quote_per_token_x18,
        high_price_quote_per_token_x18 = excluded.high_price_quote_per_token_x18,
        low_price_quote_per_token_x18 = excluded.low_price_quote_per_token_x18,
        close_price_quote_per_token_x18 = excluded.close_price_quote_per_token_x18,
        volume_token_raw = excluded.volume_token_raw,
        volume_quote_gross_raw = excluded.volume_quote_gross_raw,
        volume_quote_net_raw = excluded.volume_quote_net_raw,
        volume_quote_gross_complete = excluded.volume_quote_gross_complete,
        volume_quote_net_complete = excluded.volume_quote_net_complete,
        trade_count = excluded.trade_count,
        first_trade_id = excluded.first_trade_id,
        last_trade_id = excluded.last_trade_id,
        dirty = false,
        updated_at = now()
      returning 1
    )
    delete from market_candles_1m
    where chain_id = ${chainId}
      and token_address = ${bucket.tokenAddress}
      and bucket_start = ${bucketStart}
      and not exists (select 1 from projected where trade_count > 0)
  `)
}

export async function rebuildAffectedCandleBuckets(
  executor: SqlExecutor,
  chainId: number,
  trades: Array<{ tokenAddress: string; timestamp: number }>,
): Promise<CandleBucket[]> {
  const buckets = getAffectedCandleBuckets(trades)
  for (const bucket of buckets) {
    await rebuildCandleBucket(executor, chainId, bucket)
  }
  return buckets
}
