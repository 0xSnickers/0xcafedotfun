CREATE TABLE "market_candles_1m" (
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"open_price_quote_per_token_x18" numeric(78, 0) NOT NULL,
	"high_price_quote_per_token_x18" numeric(78, 0) NOT NULL,
	"low_price_quote_per_token_x18" numeric(78, 0) NOT NULL,
	"close_price_quote_per_token_x18" numeric(78, 0) NOT NULL,
	"volume_token_raw" numeric(78, 0) DEFAULT '0' NOT NULL,
	"volume_quote_gross_raw" numeric(78, 0) DEFAULT '0' NOT NULL,
	"volume_quote_net_raw" numeric(78, 0) DEFAULT '0' NOT NULL,
	"volume_quote_gross_complete" boolean DEFAULT true NOT NULL,
	"volume_quote_net_complete" boolean DEFAULT true NOT NULL,
	"trade_count" integer DEFAULT 0 NOT NULL,
	"first_trade_id" bigint NOT NULL,
	"last_trade_id" bigint NOT NULL,
	"dirty" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_candles_1m_chain_id_token_address_bucket_start_pk" PRIMARY KEY("chain_id","token_address","bucket_start")
);
--> statement-breakpoint
ALTER TABLE "market_candles_1m" ADD CONSTRAINT "market_candles_1m_first_trade_id_market_trades_id_fk" FOREIGN KEY ("first_trade_id") REFERENCES "public"."market_trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_candles_1m" ADD CONSTRAINT "market_candles_1m_last_trade_id_market_trades_id_fk" FOREIGN KEY ("last_trade_id") REFERENCES "public"."market_trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_candles_1m_token_time_idx" ON "market_candles_1m" USING btree ("chain_id","token_address","bucket_start");