CREATE TABLE IF NOT EXISTS "pool_reserve_snapshots" (
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"market_address" text NOT NULL,
	"pair_address" text NOT NULL,
	"token_reserve_raw" numeric(78, 0) NOT NULL,
	"quote_reserve_raw" numeric(78, 0) NOT NULL,
	"liquidity_quote_raw" numeric(78, 0) NOT NULL,
	"quote_token_address" text,
	"block_number" numeric(78, 0) NOT NULL,
	"block_hash" text NOT NULL,
	"transaction_hash" text NOT NULL,
	"transaction_index" integer NOT NULL,
	"log_index" integer NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"canonical" boolean DEFAULT true NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pool_reserve_snapshots_chain_id_block_hash_transaction_hash_log_index_pk" PRIMARY KEY("chain_id","block_hash","transaction_hash","log_index")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pool_reserve_snapshots_token_time_idx" ON "pool_reserve_snapshots" USING btree ("chain_id","token_address","block_timestamp") WHERE "pool_reserve_snapshots"."canonical" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pool_reserve_snapshots_pair_time_idx" ON "pool_reserve_snapshots" USING btree ("chain_id","pair_address","block_timestamp") WHERE "pool_reserve_snapshots"."canonical" = true;
