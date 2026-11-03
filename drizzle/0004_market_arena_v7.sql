-- V7 private server-owned practice Arena. Existing v5/v6 records are not modified.
CREATE TABLE IF NOT EXISTS arena_v7_sessions (
 id TEXT PRIMARY KEY NOT NULL,
 owner TEXT NOT NULL,
 season_key TEXT NOT NULL,
 episode_id TEXT NOT NULL,
 snapshot_json TEXT NOT NULL,
 commitment TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open',
 council_json TEXT,
 council_hash TEXT,
 decision_json TEXT,
 created_at TEXT NOT NULL,
 settled_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS arena_v7_owner_season_episode ON arena_v7_sessions(owner,season_key,episode_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS arena_v7_session_owner ON arena_v7_sessions(owner,season_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS arena_v7_wallets (
 owner TEXT NOT NULL,
 season_key TEXT NOT NULL,
 credits_remaining INTEGER NOT NULL DEFAULT 100,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner,season_key),
 CHECK (credits_remaining >= 0 AND credits_remaining <= 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS arena_v7_jobs (
 id TEXT PRIMARY KEY NOT NULL,
 owner TEXT NOT NULL,
 session_id TEXT NOT NULL,
 specialist TEXT NOT NULL,
 cost INTEGER NOT NULL,
 report_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS arena_v7_jobs_session_role ON arena_v7_jobs(session_id,specialist);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS arena_v7_jobs_owner_session ON arena_v7_jobs(owner,session_id);
