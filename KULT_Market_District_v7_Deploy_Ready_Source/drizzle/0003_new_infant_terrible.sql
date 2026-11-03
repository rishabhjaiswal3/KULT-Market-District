CREATE TABLE `agency_daily_cases` (
	`case_id` text PRIMARY KEY NOT NULL,
	`bars_json` text NOT NULL,
	`regime` text NOT NULL,
	`commitment` text NOT NULL,
	`version` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agency_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`case_id` text NOT NULL,
	`season_key` text NOT NULL,
	`specialist` text NOT NULL,
	`cost` integer NOT NULL,
	`report_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agency_jobs_owner_case_role` ON `agency_jobs` (`owner`,`case_id`,`specialist`);--> statement-breakpoint
CREATE TABLE `agency_missions` (
	`owner` text NOT NULL,
	`case_id` text NOT NULL,
	`council_json` text,
	`council_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agency_missions_owner_case` ON `agency_missions` (`owner`,`case_id`);--> statement-breakpoint
CREATE TABLE `agency_seasons` (
	`owner` text NOT NULL,
	`season_key` text NOT NULL,
	`credits_remaining` integer DEFAULT 100 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agency_seasons_owner_key` ON `agency_seasons` (`owner`,`season_key`);--> statement-breakpoint
ALTER TABLE `market_decisions` ADD `allocation_bps` integer DEFAULT 2000 NOT NULL;--> statement-breakpoint
ALTER TABLE `market_decisions` ADD `credits_spent` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `market_decisions` ADD `mission_hash` text DEFAULT '' NOT NULL;