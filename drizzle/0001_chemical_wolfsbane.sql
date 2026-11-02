CREATE TABLE `forecasts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`strategy` text NOT NULL,
	`source` text NOT NULL,
	`direction` text NOT NULL,
	`quote_cents` integer NOT NULL,
	`target_bar_t` integer NOT NULL,
	`rationale` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`observed_cents` integer,
	`observed_direction` text,
	`created_at` text NOT NULL,
	`reviewed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forecasts_owner_target_strategy_source` ON `forecasts` (`owner`,`target_bar_t`,`strategy`,`source`);--> statement-breakpoint
CREATE TABLE `review_locks` (
	`forecast_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL
);
