CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`prev_hash` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_owner_seq` ON `events` (`owner`,`seq`);--> statement-breakpoint
CREATE TABLE `execution_locks` (
	`owner` text NOT NULL,
	`portfolio_version` integer NOT NULL,
	`proposal_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `execution_locks_owner_version` ON `execution_locks` (`owner`,`portfolio_version`);--> statement-breakpoint
CREATE TABLE `fills` (
	`proposal_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`action` text NOT NULL,
	`source` text NOT NULL,
	`price_cents` integer NOT NULL,
	`units_micro` integer NOT NULL,
	`gross_cents` integer NOT NULL,
	`fee_cents` integer NOT NULL,
	`executed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mandates` (
	`owner` text PRIMARY KEY NOT NULL,
	`max_trade_bps` integer DEFAULT 1000 NOT NULL,
	`max_position_bps` integer DEFAULT 2500 NOT NULL,
	`max_drawdown_bps` integer DEFAULT 1200 NOT NULL,
	`expires_at` text NOT NULL,
	`killed` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portfolios` (
	`owner` text PRIMARY KEY NOT NULL,
	`cash_cents` integer DEFAULT 1000000 NOT NULL,
	`units_micro` integer DEFAULT 0 NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`realized_cents` integer DEFAULT 0 NOT NULL,
	`peak_cents` integer DEFAULT 1000000 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`owner` text PRIMARY KEY NOT NULL,
	`alias` text NOT NULL,
	`agent_name` text DEFAULT 'Scout' NOT NULL,
	`tutorial_done` integer DEFAULT 0 NOT NULL,
	`mode` text DEFAULT 'human' NOT NULL,
	`strategy` text DEFAULT 'trend' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`strategy` text NOT NULL,
	`action` text NOT NULL,
	`source` text NOT NULL,
	`quote_cents` integer NOT NULL,
	`size_cents` integer NOT NULL,
	`rationale` text NOT NULL,
	`factors_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`strategy` text NOT NULL,
	`source` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL
);
