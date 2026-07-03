begin;
truncate table
  growth_rewards,
  growth_referrals,
  growth_appeals,
  market_candles_1m,
  market_trades,
  raw_chain_logs,
  token_markets,
  indexer_checkpoints,
  chain_blocks
restart identity cascade;
commit;
