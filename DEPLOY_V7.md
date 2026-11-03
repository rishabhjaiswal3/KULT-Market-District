# KULT MARKET DISTRICT v7 — Deployment and release acceptance

## Release contents

- `/arena-v7`: new responsive **server-owned, fictional practice Arena** (six episodes).
- `/api/arena-v7`: owner-scoped, mutation-protected JSON API with six ephemeral-to-player missions per UTC week, bounded research wallet, council and settlement.
- `lib/arena-v7-engine.ts`: secure random server-only market paths, SHA-256 snapshot commitment, no hidden future in open API responses, virtual trade and Risk Steward rules.
- `lib/arena-v7-store.ts`: D1 persistence and atomic one-time mission state changes.
- `drizzle/0004_market_arena_v7.sql`: additive tables; does not touch existing v5/v6 records.
- `/arena-v6`: original offline demo, explicitly not secure for ranking; `/` and `/desk` remain operational.

## Mandatory production deployment sequence

1. **Back up the existing D1 database.** Keep the original `.openai/hosting.json` project binding and `DB` D1 binding in the same deployment. Never replace the existing database with an empty one.
2. Install the project dependencies from its lockfile in the hosting build environment. The source expects Node >= 22.13 and pnpm 11.25.0.
3. Apply `drizzle/0004_market_arena_v7.sql` **once**, using the host's tracked migration workflow. If applying manually, use your actual Cloudflare D1 database name/ID and target environment; do not blindly point Wrangler at a production database. The migration is included in `drizzle/meta/_journal.json`.
4. Build the project with its standard Sites/Vinext pipeline. Open `/arena-v7` and verify `/api/arena-v7` returns HTTP 200 with `mode: server_owned_practice`. A 503 usually means the D1 binding or the new tables are missing.
5. With a fresh staging account or guest cookie, start an episode, confirm the response has `visibleBars` (48) but not `futureBars`, `allBars` or `regime`. Verify the commitment appears before decision.
6. Dispatch one report and verify the wallet is debited **once**, even if the button/request is repeated. Convene a council; after more research, stale `councilHash` must be rejected.
7. Confirm a BUY or SELL above the Risk Steward's cap is rejected by the API, not merely by the browser. `HOLD` with 0% allocation must work without buying any research.
8. Settle once and confirm that the response now contains all 60 bars, a hash-consistent commitment, virtual P&L and a counterfactual. Repeating settlement returns the original result without increasing the score.
9. Refresh/reopen with the same signed-in account and confirm the six-episode season, credits and Passport export persist. Confirm another owner cannot access the first owner's episode or research data.
10. Check mobile presentation and browser console for the new React route, verify `/`, `/desk`, `/arena-v6` and the old server daily league still function.

## What was actually tested in this offline execution environment

- **22/22** automated v5/v6/v7 engine tests passed with Node 22.16.
- **1,800** seeded v7 fictional market scenario benchmark completed; detailed numbers in `BENCHMARK_V7.json`.
- All five SQL migrations applied to an in-memory SQLite database; research debit/idempotency and single-settlement conditions verified with SQL.
- New TS and TSX files parsed/transpiled syntactically with TypeScript 5.x.

## Unverified until staging deploy

- No full Next/Vinext production bundle was executed here: `node_modules` and package registry access are unavailable in this runtime.
- No real Cloudflare D1 binding was available for an HTTP end-to-end test. SQL was verified in SQLite, but framework authentication, runtime behavior, deployment migration execution and persistence across real site sessions must be checked on staging.
- No production URL was changed. This ZIP is source to deploy, not proof of successful deployment.

## Product boundaries

- This is **fictional market practice**, not live trading or financial advice.
- The specialists are deterministic research jobs, **not** independent LLM agents or live financial data feeds.
- Every player's episode is separately randomized and therefore **not suitable for a fair public multi-user leaderboard**. Public/prize ranking requires identical blinded cases per cohort, audited generation, comparable budgets, anti-Sybil and independently verified scoring.
- SHA-256 is a server-held commitment, **not** third-party proof of operator honesty or external chain anchoring.
- Signed-in records use the existing Site-scoped ChatGPT identity, **not** a connected production KULT Agent ID. Guest cookies are short-lived and practice-only.
- Agency careers calculate report counts and alignment with hindsight after resolution. They do not assert that an agent learned to predict better.

## Suggested next milestones after v7 stabilizes

1. Real KULT user identity bridge + shared Agent Passport event ingestion (server-to-server, not user-supplied owner ID).
2. Independent agent job queue with bounded tool permissions, receipts, deadlines, timeout/failure states and expert evidence evaluation.
3. Identical, audited shared daily scenarios and independent leaderboard validation.
4. Player retention experiments to determine whether longer research genuinely increases enjoyment.
