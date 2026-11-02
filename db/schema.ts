import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  owner: text("owner").primaryKey(),
  alias: text("alias").notNull(),
  agentName: text("agent_name").notNull().default("Scout"),
  tutorialDone: integer("tutorial_done").notNull().default(0),
  mode: text("mode").notNull().default("human"),
  strategy: text("strategy").notNull().default("trend"),
  createdAt: text("created_at").notNull(),
});

export const mandates = sqliteTable("mandates", {
  owner: text("owner").primaryKey(),
  maxTradeBps: integer("max_trade_bps").notNull().default(1000),
  maxPositionBps: integer("max_position_bps").notNull().default(2500),
  maxDrawdownBps: integer("max_drawdown_bps").notNull().default(1200),
  expiresAt: text("expires_at").notNull(),
  killed: integer("killed").notNull().default(0),
  version: integer("version").notNull().default(0),
});

export const portfolios = sqliteTable("portfolios", {
  owner: text("owner").primaryKey(),
  cashCents: integer("cash_cents").notNull().default(1000000),
  unitsMicro: integer("units_micro").notNull().default(0),
  costCents: integer("cost_cents").notNull().default(0),
  realizedCents: integer("realized_cents").notNull().default(0),
  peakCents: integer("peak_cents").notNull().default(1000000),
  version: integer("version").notNull().default(0),
});

export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  strategy: text("strategy").notNull(),
  action: text("action").notNull(),
  source: text("source").notNull(),
  quoteCents: integer("quote_cents").notNull(),
  sizeCents: integer("size_cents").notNull(),
  rationale: text("rationale").notNull(),
  factorsJson: text("factors_json").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const fills = sqliteTable("fills", {
  proposalId: text("proposal_id").primaryKey(),
  owner: text("owner").notNull(),
  action: text("action").notNull(),
  source: text("source").notNull(),
  priceCents: integer("price_cents").notNull(),
  unitsMicro: integer("units_micro").notNull(),
  grossCents: integer("gross_cents").notNull(),
  feeCents: integer("fee_cents").notNull(),
  executedAt: text("executed_at").notNull(),
});

export const research = sqliteTable("research", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  strategy: text("strategy").notNull(),
  source: text("source").notNull(),
  resultJson: text("result_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const forecasts = sqliteTable("forecasts", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  strategy: text("strategy").notNull(),
  source: text("source").notNull(),
  direction: text("direction").notNull(),
  quoteCents: integer("quote_cents").notNull(),
  targetBarT: integer("target_bar_t").notNull(),
  rationale: text("rationale").notNull(),
  status: text("status").notNull().default("pending"),
  observedCents: integer("observed_cents"),
  observedDirection: text("observed_direction"),
  createdAt: text("created_at").notNull(),
  reviewedAt: text("reviewed_at"),
}, (table) => [uniqueIndex("forecasts_owner_target_strategy_source").on(table.owner, table.targetBarT, table.strategy, table.source)]);

export const reviewLocks = sqliteTable("review_locks", {
  forecastId: text("forecast_id").primaryKey(),
  owner: text("owner").notNull(),
});

export const marketDecisions = sqliteTable("market_decisions", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  caseId: text("case_id").notNull(),
  mode: text("mode").notNull(),
  choice: text("choice").notNull(),
  confidence: integer("confidence").notNull(),
  overrode: integer("overrode").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  receiptHash: text("receipt_hash").notNull(),
  allocationBps: integer("allocation_bps").notNull().default(2000),
  creditsSpent: integer("credits_spent").notNull().default(0),
  missionHash: text("mission_hash").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("market_decisions_owner_case").on(table.owner, table.caseId)]);

export const agencyDailyCases = sqliteTable("agency_daily_cases", {
  caseId: text("case_id").primaryKey(),
  barsJson: text("bars_json").notNull(),
  regime: text("regime").notNull(),
  commitment: text("commitment").notNull(),
  version: text("version").notNull(),
  createdAt: text("created_at").notNull(),
});

export const agencySeasons = sqliteTable("agency_seasons", {
  owner: text("owner").notNull(),
  seasonKey: text("season_key").notNull(),
  creditsRemaining: integer("credits_remaining").notNull().default(100),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("agency_seasons_owner_key").on(table.owner, table.seasonKey)]);

export const agencyMissions = sqliteTable("agency_missions", {
  owner: text("owner").notNull(),
  caseId: text("case_id").notNull(),
  councilJson: text("council_json"),
  councilHash: text("council_hash"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("agency_missions_owner_case").on(table.owner, table.caseId)]);

export const agencyJobs = sqliteTable("agency_jobs", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  caseId: text("case_id").notNull(),
  seasonKey: text("season_key").notNull(),
  specialist: text("specialist").notNull(),
  cost: integer("cost").notNull(),
  reportJson: text("report_json").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("agency_jobs_owner_case_role").on(table.owner, table.caseId, table.specialist)]);

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  seq: integer("seq").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("events_owner_seq").on(table.owner, table.seq)]);

export const executionLocks = sqliteTable("execution_locks", {
  owner: text("owner").notNull(),
  portfolioVersion: integer("portfolio_version").notNull(),
  proposalId: text("proposal_id").notNull(),
}, (table) => [uniqueIndex("execution_locks_owner_version").on(table.owner, table.portfolioVersion)]);
