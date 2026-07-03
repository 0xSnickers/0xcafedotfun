ALTER TABLE "token_markets" ADD COLUMN "creator_address" text;--> statement-breakpoint
ALTER TABLE "token_markets" ADD COLUMN "config_version" numeric(78, 0);--> statement-breakpoint
ALTER TABLE "token_markets" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "token_markets" ADD COLUMN "symbol" text;--> statement-breakpoint
ALTER TABLE "token_markets" ADD COLUMN "token_image" text;--> statement-breakpoint
ALTER TABLE "token_markets" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "token_markets" ADD COLUMN "created_block_number" numeric(78, 0);