CREATE TYPE "public"."reserve_delta_direction" AS ENUM('increase', 'decrease');--> statement-breakpoint
ALTER TABLE "market_trades" ADD COLUMN "market_address" text;--> statement-breakpoint
ALTER TABLE "market_trades" ADD COLUMN "reserve_delta_amount_raw" numeric(78, 0);--> statement-breakpoint
ALTER TABLE "market_trades" ADD COLUMN "reserve_delta_direction" "reserve_delta_direction";