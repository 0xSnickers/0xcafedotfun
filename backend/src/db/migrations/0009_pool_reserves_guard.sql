CREATE TABLE IF NOT EXISTS "pool_reserves" (
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pool_reserves_chain_id_pair_address_pk" PRIMARY KEY("chain_id","pair_address")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pool_reserves_token_idx" ON "pool_reserves" USING btree ("chain_id","token_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pool_reserves_updated_idx" ON "pool_reserves" USING btree ("chain_id","block_number");
