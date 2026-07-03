CREATE TABLE "creator_fee_claims" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"creator_address" text NOT NULL,
	"recipient_address" text NOT NULL,
	"amount_raw" numeric(78, 0) NOT NULL,
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
CREATE TABLE "creator_token_fee_facts" (
	"chain_id" integer NOT NULL,
	"creator_address" text NOT NULL,
	"token_address" text NOT NULL,
	"accrued_raw" numeric(78, 0) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_token_fee_facts_chain_id_creator_address_token_address_pk" PRIMARY KEY("chain_id","creator_address","token_address")
);
--> statement-breakpoint
CREATE TABLE "creator_fee_facts" (
	"chain_id" integer NOT NULL,
	"creator_address" text NOT NULL,
	"total_accrued_raw" numeric(78, 0) DEFAULT '0' NOT NULL,
	"total_claimed_raw" numeric(78, 0) DEFAULT '0' NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_fee_facts_chain_id_creator_address_pk" PRIMARY KEY("chain_id","creator_address")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "creator_fee_claims_chain_log_idx" ON "creator_fee_claims" USING btree ("chain_id","block_hash","transaction_hash","log_index");--> statement-breakpoint
CREATE INDEX "creator_fee_claims_creator_time_idx" ON "creator_fee_claims" USING btree ("chain_id","creator_address","block_timestamp") WHERE "creator_fee_claims"."canonical" = true;--> statement-breakpoint
CREATE INDEX "creator_fee_claims_unconfirmed_idx" ON "creator_fee_claims" USING btree ("chain_id","block_number") WHERE "creator_fee_claims"."canonical" = true and "creator_fee_claims"."confirmed" = false;--> statement-breakpoint
CREATE INDEX "creator_token_fee_facts_creator_idx" ON "creator_token_fee_facts" USING btree ("chain_id","creator_address","updated_at");