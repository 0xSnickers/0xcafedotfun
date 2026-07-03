import { postgresPool } from '../../clients/postgresClient'

export interface StoredPostgresCandle1m {
  time: number
  open: string
  high: string
  low: string
  close: string
  volume: string
  volumeQuoteGrossComplete: boolean
}

export class PostgresCandleStore {
  async getFirstTradeBucket(
    chainId: number,
    tokenAddress: string,
  ): Promise<number | null> {
    if (!postgresPool) {
      throw new Error('PostgreSQL candle store is not configured')
    }

    const result = await postgresPool.query(
      `select
         floor(extract(epoch from min(block_timestamp)) / 60) * 60 as bucket_time
       from market_trades
       where chain_id = $1
         and token_address = $2
         and canonical = true`,
      [chainId, tokenAddress.toLowerCase()],
    )

    const bucketTime = result.rows[0]?.bucket_time
    return bucketTime === null || bucketTime === undefined
      ? null
      : Number(bucketTime)
  }

  async getCandles(
    chainId: number,
    tokenAddress: string,
    from: number,
    to: number,
  ): Promise<StoredPostgresCandle1m[]> {
    if (!postgresPool) {
      throw new Error('PostgreSQL candle store is not configured')
    }

    const result = await postgresPool.query(
      `select
         extract(epoch from bucket_start)::bigint::text as time,
         open_price_quote_per_token_x18::text as open,
         high_price_quote_per_token_x18::text as high,
         low_price_quote_per_token_x18::text as low,
         close_price_quote_per_token_x18::text as close,
         volume_quote_gross_raw::text as volume,
         volume_quote_gross_complete
       from market_candles_1m
       where chain_id = $1
         and token_address = $2
         and bucket_start >= to_timestamp($3)
         and bucket_start < to_timestamp($4)
       order by bucket_start`,
      [chainId, tokenAddress.toLowerCase(), from, to],
    )

    return result.rows.map((row) => ({
      time: Number(row.time),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      volumeQuoteGrossComplete: row.volume_quote_gross_complete,
    }))
  }
}

export const postgresCandleStore = new PostgresCandleStore()
