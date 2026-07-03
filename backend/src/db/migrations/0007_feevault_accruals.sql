CREATE TABLE "creator_fee_accruals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"market_address" text NOT NULL,
	"creator_address" text NOT NULL,
	"platform_fee_raw" numeric(78, 0) NOT NULL,
	"creator_fee_raw" numeric(78, 0) NOT NULL,
	"transaction_hash" text NOT NULL,
	"transaction_index" integer NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" numeric(78, 0) NOT NULL,
	"block_hash" text NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"canonical" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "creator_fee_accruals_chain_log_idx" ON "creator_fee_accruals" USING btree ("chain_id","block_hash","transaction_hash","log_index");--> statement-breakpoint
CREATE INDEX "creator_fee_accruals_creator_time_idx" ON "creator_fee_accruals" USING btree ("chain_id","creator_address","block_timestamp") WHERE "creator_fee_accruals"."canonical" = true;--> statement-breakpoint
CREATE INDEX "creator_fee_accruals_token_time_idx" ON "creator_fee_accruals" USING btree ("chain_id","token_address","block_timestamp") WHERE "creator_fee_accruals"."canonical" = true;--> statement-breakpoint
CREATE INDEX "creator_fee_accruals_unconfirmed_idx" ON "creator_fee_accruals" USING btree ("chain_id","block_number") WHERE "creator_fee_accruals"."canonical" = true and "creator_fee_accruals"."confirmed" = false;
