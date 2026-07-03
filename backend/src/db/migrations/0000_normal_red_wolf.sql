CREATE TYPE "public"."market_source" AS ENUM('bonding_curve', 'uniswap_v2');--> statement-breakpoint
CREATE TYPE "public"."market_stage" AS ENUM('bonding_curve_live', 'graduated_pending_liquidity', 'dex_live');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TABLE "chain_blocks" (
	"chain_id" integer NOT NULL,
	"block_number" numeric(78, 0) NOT NULL,
	"block_hash" text NOT NULL,
	"parent_hash" text NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"canonical" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_blocks_chain_id_block_number_block_hash_pk" PRIMARY KEY("chain_id","block_number","block_hash")
);
--> statement-breakpoint
CREATE TABLE "indexer_checkpoints" (
	"consumer_name" text NOT NULL,
	"chain_id" integer NOT NULL,
	"cursor_key" text NOT NULL,
	"last_indexed_block" numeric(78, 0) NOT NULL,
	"last_finalized_block" numeric(78, 0) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indexer_checkpoints_consumer_name_chain_id_cursor_key_pk" PRIMARY KEY("consumer_name","chain_id","cursor_key")
);
--> statement-breakpoint
CREATE TABLE "market_trades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"source" "market_source" NOT NULL,
	"pair_address" text,
	"side" "trade_side" NOT NULL,
	"trader_address" text,
	"mark_price_quote_per_token_x18" numeric(78, 0) NOT NULL,
	"execution_price_quote_per_token_x18" numeric(78, 0),
	"token_amount_raw" numeric(78, 0) NOT NULL,
	"quote_amount_gross_raw" numeric(78, 0),
	"quote_amount_net_raw" numeric(78, 0),
	"creator_fee_raw" numeric(78, 0),
	"platform_fee_raw" numeric(78, 0),
	"token_decimals" integer NOT NULL,
	"quote_decimals" integer NOT NULL,
	"transaction_hash" text NOT NULL,
	"transaction_index" integer NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" numeric(78, 0) NOT NULL,
	"block_hash" text NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"canonical" boolean DEFAULT true NOT NULL,
	"legacy_volume_semantics" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_chain_logs" (
	"chain_id" integer NOT NULL,
	"block_number" numeric(78, 0) NOT NULL,
	"block_hash" text NOT NULL,
	"transaction_hash" text NOT NULL,
	"transaction_index" integer NOT NULL,
	"log_index" integer NOT NULL,
	"contract_address" text NOT NULL,
	"topic0" text NOT NULL,
	"topics" jsonb NOT NULL,
	"data" text NOT NULL,
	"event_name" text,
	"decoded_args" jsonb,
	"canonical" boolean DEFAULT true NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raw_chain_logs_chain_id_block_hash_transaction_hash_log_index_pk" PRIMARY KEY("chain_id","block_hash","transaction_hash","log_index")
);
--> statement-breakpoint
CREATE TABLE "token_markets" (
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"bonding_curve_address" text NOT NULL,
	"stage" "market_stage" DEFAULT 'bonding_curve_live' NOT NULL,
	"dex_source" "market_source",
	"pair_address" text,
	"quote_token_address" text,
	"token_decimals" integer NOT NULL,
	"quote_decimals" integer DEFAULT 18 NOT NULL,
	"graduated_block_number" numeric(78, 0),
	"graduated_at" timestamp with time zone,
	"dex_live_block_number" numeric(78, 0),
	"dex_live_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_markets_chain_id_token_address_pk" PRIMARY KEY("chain_id","token_address")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chain_blocks_one_canonical_height" ON "chain_blocks" USING btree ("chain_id","block_number") WHERE "chain_blocks"."canonical" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "market_trades_chain_log_idx" ON "market_trades" USING btree ("chain_id","block_hash","transaction_hash","log_index");--> statement-breakpoint
CREATE INDEX "market_trades_token_time_idx" ON "market_trades" USING btree ("chain_id","token_address","block_timestamp") WHERE "market_trades"."canonical" = true;--> statement-breakpoint
CREATE INDEX "market_trades_unconfirmed_idx" ON "market_trades" USING btree ("chain_id","block_number") WHERE "market_trades"."canonical" = true and "market_trades"."confirmed" = false;--> statement-breakpoint
CREATE INDEX "raw_chain_logs_contract_block_idx" ON "raw_chain_logs" USING btree ("chain_id","contract_address","block_number");--> statement-breakpoint
CREATE INDEX "raw_chain_logs_tx_idx" ON "raw_chain_logs" USING btree ("chain_id","transaction_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "token_markets_pair_idx" ON "token_markets" USING btree ("chain_id","pair_address") WHERE "token_markets"."pair_address" is not null;