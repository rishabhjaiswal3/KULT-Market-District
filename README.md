# KULT Market District v7 — Server-Sealed Arena Build

**Start here:** [`DEPLOY_V7.md`](./DEPLOY_V7.md) and [`CHANGELOG_V7.md`](./CHANGELOG_V7.md).

This release adds **`/arena-v7`** and **`/api/arena-v7`** to the existing Sites/Vinext source. It preserves v5's server-owned daily agency league, v6's static offline demo and the Alpha Desk under `/desk`.

V7 runs six new server-private fictional missions, generates an immutable price path per user/week on the server, makes available only the 48 observed bars before commitment, and reveals the hidden 12 bars only after a one-time decision. D1 stores research costs, reports, council, decision receipts, outcomes, and a private practice Passport. There is no real trade execution, no LLM model orchestration, and no public ranked multiplayer in this release.

**Required migration:** `drizzle/0004_market_arena_v7.sql`, preserving existing DB and project bindings. **Deployment not executed in this offline environment.** See `DEPLOY_V7.md` for staging acceptance criteria and precise boundaries.

## Local engine verification

```bash
node --experimental-strip-types --test tests/engine.test.mjs tests/market.test.mjs tests/agency.test.mjs tests/v6-guardrails.test.mjs tests/v7-server-simulation.test.mjs
node --experimental-strip-types tests/v7-agency-benchmark.mjs
```

---

# KULT MARKET DISTRICT — V6 Playable Upgrade

This build **extends**, rather than replaces, the original v5 server-owned agency simulation.

## What's new in v6

- `/arena-v6`: fully playable, dependency-free **fictional practice simulator** with six designed episodes: The 5-Minute Crash, False Crown, Quiet Accumulation, Circuit Breaker, Weekend Squeeze and Zero-Edge Day.
- `public/market-arena-v6.html`: standalone game including an illustrated isometric office, interactive charts, four research specialists, a Director Council, a mandatory Risk Steward, BUY/SELL/HOLD authorization, 10/20% virtual sizing, post-trade counterfactuals, research spending, local XP/careers, solo season scores and JSON Passport export.
- **No server or production identity is required for the new offline Arena.** It uses localStorage, which is deliberately *not* suitable for prizes or public ranked leagues. It has deterministic demonstration scenarios and rule-based characters, **not actual LLM or autonomous trading agents**.
- The existing `/` server-backed v5 Market District and `/desk` remain available. A prominent v6 access banner has been added to `/`.
- Future new UTC daily cases from `lib/market-cases.ts` now use **eight direction-symmetric fictional regimes**, with evolving volume patterns and an explicit high-volatility class. Original v5 frozen database records remain untouched.
- `lib/agency-engine.ts` replaces the tiny, unfair per-one-bar 30bps Quant holdout with disjoint four-bar, costed holdouts; council votes discount HOLD abstentions and stop giving the Quant a two-vote veto.

## Play immediately

Open `KULT_Market_District_v6_Playable_Preview.html` in Chrome, Firefox or Edge; no installation required. This is the exact standalone copy of `public/market-arena-v6.html`. The source project serves the same experience at `/arena-v6` once deployed with its normal Sites/Vinext framework.

## What is demonstrably working

- The original **14 Node engine tests** still pass.
- Browser checks executed research dispatch, council disagreement, virtual trade settlement, career progression, score view and Passport export, plus a 390px mobile layout check, a hard risk veto, local-profile reloading and JSON export.
- The frozen daily generator and council were exercised over 1,600 fresh fictional daily cases. This is a distributional **sanity check**, not evidence of real forecasting power, balanced competitive incentives or production readiness.

## What is not built yet

- The standalone Arena does **not** use your Cloudflare D1 backend or share season budgets, scores or Agent Passport with the original `/` gameplay. It is a playable prototype, not a production migration.
- A true independent LLM-powered agent orchestration runtime, persistent KULT Agent ID bridge, anti-Sybil system, secure server-owned Arena mission results, online seasons, and multiplayer opponents have **not** been implemented.
- No hosted browser/deployment/authenticated DB verification was possible in this runtime; dependencies are not supplied in the ZIP and the npm registry is blocked in this environment.
- The v6 council is less HOLD-biased than v5, but all-agent research has not demonstrated superior mean net performance after research credits. Further model selection and strategy-evaluation work is required before real competition.

## Node engine tests

```bash
node --experimental-strip-types --test tests/engine.test.mjs tests/market.test.mjs tests/agency.test.mjs tests/v6-guardrails.test.mjs
node --experimental-strip-types tests/v6-distribution.mjs
node --experimental-strip-types tests/v6-cost-bench.mjs
```

## Framework deployment

Use the same Node 22.13+, Sites/Vinext and Cloudflare D1 deployment and migration workflow documented in v5. Do not replace existing stored snapshots or skip legacy migrations. The static V6 practice view needs no additional tables.

For production-grade 9.5/10 goals, connect Arena missions to signed-in account-scoped D1 records, migrate local practice only with explicit validation (never ranked points), implement independent outcome commits, genuinely differentiated agent tasks with measured counterfactual value, secure ranked score computation, and real browser/API integration tests.

---

## V5 source and original server-owned mission documentation

# KULT Market District — agency mission beta (v5)

A chain-independent finance game inside KULT World. Players direct a team through a short **fictional** market mission: receive a brief, spend limited research credits on specialist jobs, convene the evidence council, authorize a virtual allocation within a hard risk cap, then review the hidden path, costs, team record and result. The earlier Alpha Desk remains at `/desk` as an advanced paper research area; its book is separate from the Agency League.

## Playable flow

1. `/` opens the six-room isometric district with a three-step guide. On small screens, the quick desk opens first and the map is optional. Three replays work without an account; guest results persist for seven days in a secure HttpOnly cookie and practice records can be claimed at sign-in.
2. Four specialists perform **deterministic, distinct** jobs using 48 pre-cutoff fictional bars: Trend Scout (5 credits), Volume Reader (12), Quant Researcher (18), Scenario Investigator (12). Reports include source cutoff, method, numeric evidence, caveat, cost, timestamp and status. Volume is simulated bar volume, not a live order book; the scenario brief is not real news. No LLM or remote agent runtime is claimed.
3. The council weights the dispatched reports and records dissent. The Risk Steward independently caps virtual exposure at 0%, 10% or 20% from pre-cutoff volatility. The Execution Agent estimates 30 bps round-trip cost. These rules are server-owned and cannot be overridden. The player may agree, disagree, resize or HOLD; an advisory override is recorded without an arbitrary score penalty.
4. The server locks one decision per case. The virtual book starts at $10,000. Size is $1,000 or $2,000 for a directional choice; HOLD stays in cash. The result compares all choices at the selected allocation, the Brier calibration score, specialist records and a shareable challenge.
5. A signed-in visitor may dispatch to a daily ranked case. Every UTC week starts with 100 research credits. The same daily case, UTC cutoff, virtual capital and credit prices apply to everyone. The week league scores resolved missions as **equity − 25% max drawdown − $0.20 per credit spent on scored cases**. No purchased ranked advantage. Career records show jobs, report accuracy and influence derived from resolved outcomes.
6. Market Replay, Agency League, Risk Office, Research Desk, Results Wall and Agency Office are connected through the map and fast nav. Agent Passport JSON exports research jobs, council and choice, spending, receipts, outcome and the separate Alpha Desk record.

## Fairness and proof boundary

- Starting with `daily-2026-11-02` UTC, the server creates a random 60-bar daily path once, stores it in D1 and displays a SHA-256 commitment before the decision. The future 12 bars and hidden regime are withheld until the UTC deadline. The server checks the stored snapshot hash on every read. `GET /api/market/reveal?caseId=daily-YYYY-MM-DD` publishes the full frozen path after cutoff. Earlier daily cases preserve the v1 deterministic path so already locked receipts do not change.
- After a result, **Verify Frozen Snapshot & Receipt** recomputes the full-path, council and decision hashes in the visitor's browser. It is an internal consistency check. The operator controls code and database; this is **not** an externally anchored proof of fair generation or protection against operator tampering. A private beta also has no independent anti-Sybil verification or measured human retention yet.
- Specialists use pre-cutoff bars only. The Quant report has a small fixed one-step historical sample, not a validated profitable strategy. The Risk Steward's server gate checks authority again when inserting the locked decision. Research credits are debited atomically with unique job records. One account can submit only one daily decision per case; guests must sign in before joining a ranked mission.
- Replay outcomes and price paths are fictional. There are no deposits, wallets, trading keys, real-money fills, blockchain transactions, AI API calls or autonomous scheduled trading in this build.

## Routes and local verification

- `GET /api/healthz` — host health.
- `GET /api/market` — visitor state, cases, budget, reports, council, decisions, league and careers.
- `POST /api/market` — `{ "type":"job", "caseId":"breakout-bait", "specialist":"trend" }`, then `{ "type":"council", "caseId":"breakout-bait" }`, then `{ "type":"decide", "caseId":"breakout-bait", "choice":"HOLD", "confidence":50, "allocationBps":0, "councilHash":"..." }`.
- `GET /api/market/reveal?caseId=daily-YYYY-MM-DD` — complete daily path after lock, 423 before.
- `GET /api/market/passport` — signed-in owner-scoped JSON export.
- `/desk`, `/api/state`, `/api/action`, `/api/passport` — separate Alpha Desk paper research.

Requires Node 22.13+ and the Sites Vinext runtime. From the repo checkout, run `npm run install:ci`, then `node /root/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs`. On a fresh local database apply `drizzle/0000_lovely_bill_hollister.sql`, `0001_chemical_wolfsbane.sql`, `0002_naive_justin_hammer.sql` and `0003_new_infant_terrible.sql` once, in order, using Wrangler D1. Then use `sites-preview start <absolute-checkout>`. Tests: `node --test tests/engine.test.mjs tests/market.test.mjs tests/agency.test.mjs`; typecheck: `./node_modules/.bin/tsc --noEmit`. Hosted deployment applies tracked migrations.

## KULT integration

The private Site uses Site-scoped Sign in with ChatGPT, **not** production KULT Agent ID. KULT Browser must authenticate the player, map its stable Agent ID to a server-owned account key, authorize every route and attach the market record to the shared Passport. Never accept an owner ID from browser input. Future LLM delegation could replace report generation after evaluation; numerical scoring, budget debit, risk gate and final authority must remain deterministic server operations. Real market data requires independently frozen and licensed/authorized inputs. Real trading would be a separate security, custody and legal project.
