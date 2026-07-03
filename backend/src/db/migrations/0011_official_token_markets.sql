ALTER TABLE "token_markets" ADD COLUMN "is_official" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "token_markets"
SET "is_official" = lower("token_address") LIKE '0xcafe%';