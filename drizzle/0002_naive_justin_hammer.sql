CREATE TABLE `market_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`case_id` text NOT NULL,
	`mode` text NOT NULL,
	`choice` text NOT NULL,
	`confidence` integer NOT NULL,
	`overrode` integer NOT NULL,
	`snapshot_hash` text NOT NULL,
	`receipt_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_decisions_owner_case` ON `market_decisions` (`owner`,`case_id`);