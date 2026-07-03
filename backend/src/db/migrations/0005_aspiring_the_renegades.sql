CREATE TYPE "public"."growth_appeal_status" AS ENUM('open', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."growth_reward_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TABLE "growth_appeals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"wallet_address" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" text,
	"status" "growth_appeal_status" DEFAULT 'open' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "growth_referrals" (
	"chain_id" integer NOT NULL,
	"invitee_address" text NOT NULL,
	"inviter_address" text NOT NULL,
	"qualified" boolean DEFAULT false NOT NULL,
	"qualified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_referrals_chain_id_invitee_address_pk" PRIMARY KEY("chain_id","invitee_address")
);
--> statement-breakpoint
CREATE TABLE "growth_rewards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"wallet_address" text NOT NULL,
	"source_trade_id" bigint,
	"reason" text NOT NULL,
	"points" integer NOT NULL,
	"status" "growth_reward_status" DEFAULT 'pending' NOT NULL,
	"risk_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settles_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "growth_rewards" ADD CONSTRAINT "growth_rewards_source_trade_id_market_trades_id_fk" FOREIGN KEY ("source_trade_id") REFERENCES "public"."market_trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "growth_appeals_wallet_idx" ON "growth_appeals" USING btree ("chain_id","wallet_address","status");--> statement-breakpoint
CREATE INDEX "growth_referrals_inviter_idx" ON "growth_referrals" USING btree ("chain_id","inviter_address");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_rewards_trade_reason_idx" ON "growth_rewards" USING btree ("chain_id","source_trade_id","reason");--> statement-breakpoint
CREATE INDEX "growth_rewards_wallet_idx" ON "growth_rewards" USING btree ("chain_id","wallet_address","status");