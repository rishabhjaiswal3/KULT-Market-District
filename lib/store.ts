import { env } from "cloudflare:workers";
import { backtest, council, decide, equityCents, fill, forecastDirection, forwardScore, gate, getMarket, observedDirection, scenarioMarket, walkForward, START_CENTS, type Mandate, type Portfolio } from "./engine";

type Row = Record<string, unknown>;
const db = () => { if (!env.DB) throw new Error("D1 is not configured"); return env.DB; };
const nowIso = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const json = (x: unknown) => JSON.stringify(x);

export class DeskError extends Error { constructor(message: string, public status = 400) { super(message); } }

async function digest(s: string) {
  const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(data), b => b.toString(16).padStart(2, "0")).join("");
}

export async function init(owner: string) {
  const expiry = new Date(Date.now() + 14 * 86400000).toISOString();
  await db().batch([
    db().prepare("INSERT OR IGNORE INTO profiles (owner, alias, agent_name, tutorial_done, mode, strategy, created_at) VALUES (?, ?, 'Scout', 0, 'human', 'trend', ?)").bind(owner, `Director ${owner.slice(-4).toUpperCase()}`, nowIso()),
    db().prepare("INSERT OR IGNORE INTO mandates (owner, max_trade_bps, max_position_bps, max_drawdown_bps, expires_at, killed, version) VALUES (?, 1000, 2500, 1200, ?, 0, 0)").bind(owner, expiry),
    db().prepare("INSERT OR IGNORE INTO portfolios (owner, cash_cents, units_micro, cost_cents, realized_cents, peak_cents, version) VALUES (?, ?, 0, 0, 0, ?, 0)").bind(owner, START_CENTS, START_CENTS),
  ]);
}

async function one<T extends Row>(sql: string, ...args: unknown[]): Promise<T> {
  const row = await db().prepare(sql).bind(...args).first<T>();
  if (!row) throw new DeskError("Record not found", 404);
  return row;
}

async function eventStatement(owner: string, kind: string, payload: unknown) {
  const prev = await db().prepare("SELECT seq, hash FROM events WHERE owner = ? ORDER BY seq DESC LIMIT 1").bind(owner).first<{ seq: number; hash: string }>();
  const seq = (prev?.seq ?? 0) + 1;
  const prevHash = prev?.hash ?? "GENESIS";
  const createdAt = nowIso();
  const body = json(payload);
  const hash = await digest(`${owner}|${seq}|${kind}|${createdAt}|${prevHash}|${body}`);
  return db().prepare("INSERT INTO events (id, owner, seq, kind, payload, prev_hash, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id(), owner, seq, kind, body, prevHash, hash, createdAt);
}

async function append(owner: string, kind: string, payload: unknown, statements: D1PreparedStatement[]) {
  try { await db().batch([...statements, await eventStatement(owner, kind, payload)]); }
  catch { throw new DeskError("State changed while this request was running. Refresh and retry.", 409); }
}

export async function view(owner: string) {
  await init(owner);
  const [profile, mandate, portfolio, proposals, fills, research, events, forecasts, market] = await Promise.all([
    one<Row>("SELECT * FROM profiles WHERE owner = ?", owner),
    one<Row>("SELECT * FROM mandates WHERE owner = ?", owner),
    one<Portfolio & Row>("SELECT * FROM portfolios WHERE owner = ?", owner),
    db().prepare("SELECT * FROM proposals WHERE owner = ? ORDER BY created_at DESC LIMIT 12").bind(owner).all(),
    db().prepare("SELECT * FROM fills WHERE owner = ? ORDER BY executed_at DESC LIMIT 25").bind(owner).all(),
    db().prepare("SELECT * FROM research WHERE owner = ? ORDER BY created_at DESC LIMIT 1").bind(owner).first<Row>(),
    db().prepare("SELECT seq, kind, payload, prev_hash, hash, created_at FROM events WHERE owner = ? ORDER BY seq DESC LIMIT 30").bind(owner).all(),
    db().prepare("SELECT id, strategy, source, direction, quote_cents, target_bar_t, rationale, status, observed_cents, observed_direction, created_at, reviewed_at FROM forecasts WHERE owner = ? ORDER BY created_at DESC LIMIT 500").bind(owner).all<{ source: string; status: string; direction: string; observed_direction: string | null }>(),
    getMarket(),
  ]);
  const equity = equityCents(portfolio, market.quote);
  return {
    profile, mandate, portfolio, proposals: proposals.results, fills: fills.results,
    research: research ? { ...research, result: JSON.parse(String(research.result_json)) } : null,
    events: events.results.map(e => ({ ...e, payload: JSON.parse(String(e.payload)) })),
    forecasts: forecasts.results.slice(0, 12), forwardScore: forwardScore(forecasts.results),
    market: { quote: market.quote, notice: market.notice, candles: market.candles.slice(-72) },
    stats: { equityCents: equity, pnlCents: equity - START_CENTS, drawdownBps: Math.round(Math.max(0, (portfolio.peak_cents - equity) / portfolio.peak_cents) * 10000) },
    execution: "paper_only",
  };
}

export async function passport(owner: string) {
  await init(owner);
  const rows = await db().prepare("SELECT seq, kind, payload, prev_hash, hash, created_at FROM events WHERE owner = ? ORDER BY seq ASC").bind(owner).all<Row>();
  let prev = "GENESIS", valid = true;
  for (const e of rows.results) {
    const expected = await digest(`${owner}|${e.seq}|${e.kind}|${e.created_at}|${e.prev_hash}|${e.payload}`);
    if (e.prev_hash !== prev || expected !== e.hash) valid = false;
    prev = String(e.hash);
  }
  const profile = await one<Row>("SELECT alias, agent_name, mode, strategy FROM profiles WHERE owner = ?", owner);
  const forecasts = await db().prepare("SELECT strategy, source, direction, quote_cents, target_bar_t, status, observed_cents, observed_direction, created_at, reviewed_at FROM forecasts WHERE owner=? ORDER BY created_at ASC LIMIT 2000").bind(owner).all<{ source: string; status: string; direction: string; observed_direction: string | null }>();
  return { schema: "kult.agent-desk.passport.v2", identityScope: "site_user_only", agent: profile, execution: "paper_only", verification: rows.results.length ? (valid ? "chain_valid" : "chain_failed") : "no_events_to_verify", verified: rows.results.length > 0 && valid, eventCount: rows.results.length, head: prev, forwardScore: forwardScore(forecasts.results), forecasts: forecasts.results, events: rows.results.map(e => ({ ...e, payload: JSON.parse(String(e.payload)) })) };
}

function textField(value: unknown, max: number) { return typeof value === "string" ? value.trim().replace(/[<>]/g, "").slice(0, max) : ""; }

export async function action(owner: string, input: Record<string, unknown>) {
  await init(owner);
  const type = input.type;
  if (type === "profile") {
    const alias = textField(input.alias, 24), agentName = textField(input.agentName, 20);
    const mode = input.mode === "auto" ? "auto" : "human";
    const strategy = input.strategy === "reversion" ? "reversion" : "trend";
    if (alias.length < 3 || agentName.length < 2) throw new DeskError("Choose an alias and an agent name.");
    await append(owner, "profile", { alias, agentName, mode, strategy }, [db().prepare("UPDATE profiles SET alias=?, agent_name=?, mode=?, strategy=?, tutorial_done=1 WHERE owner=?").bind(alias, agentName, mode, strategy, owner)]);
    return { message: "Agent Passport updated." };
  }
  if (type === "mandate") {
    const trade = Number(input.maxTradeBps), position = Number(input.maxPositionBps), drawdown = Number(input.maxDrawdownBps);
    const days = Number(input.days);
    if (![trade, position, drawdown, days].every(Number.isInteger) || trade < 100 || trade > 2000 || position < trade || position > 5000 || drawdown < 200 || drawdown > 3000 || days < 1 || days > 30) throw new DeskError("Mandate limits are outside the allowed range.");
    const expiry = new Date(Date.now() + days * 86400000).toISOString();
    const old = await one<Mandate & Row>("SELECT * FROM mandates WHERE owner=?", owner);
    await append(owner, "mandate", { trade, position, drawdown, expiry, killed: Boolean(old.killed) }, [db().prepare("UPDATE mandates SET max_trade_bps=?, max_position_bps=?, max_drawdown_bps=?, expires_at=?, version=version+1 WHERE owner=? AND version=?").bind(trade, position, drawdown, expiry, owner, old.version)]);
    return { message: "Mandate committed to the paper desk." };
  }
  if (type === "kill" || type === "rearm") {
    const killed = type === "kill" ? 1 : 0;
    const expiry = new Date(Date.now() + 7 * 86400000).toISOString();
    const statements = [db().prepare("UPDATE mandates SET killed=?, expires_at=?, version=version+1 WHERE owner=?").bind(killed, expiry, owner)];
    if (killed) statements.push(db().prepare("UPDATE proposals SET status='blocked' WHERE owner=? AND action='buy' AND status='proposed'").bind(owner));
    await append(owner, type, { killed: Boolean(killed), note: "Sell/close remains possible in the paper engine." }, statements);
    return { message: killed ? "Kill active. New paper entries are blocked." : "Paper mandate rearmed for seven days." };
  }
  if (type === "research") {
    const market = await getMarket();
    const result = { trend: backtest(market.candles, "trend"), reversion: backtest(market.candles, "reversion"), walkForward: walkForward(market.candles), asOf: nowIso(), dataSource: market.quote.source, dataNotice: market.notice || null };
    const researchId = id();
    await append(owner, "research", { researchId, source: market.quote.source, trendReturnPct: result.trend.returnPct, reversionReturnPct: result.reversion.returnPct }, [db().prepare("INSERT INTO research (id, owner, strategy, source, result_json, created_at) VALUES (?, ?, 'comparison', ?, ?, ?)").bind(researchId, owner, market.quote.source, json(result), nowIso())]);
    return { message: market.quote.source === "live" ? "Historical paper comparison complete." : "Scenario comparison complete. No live data was available." };
  }
  if (type === "review") {
    const pending = await db().prepare("SELECT id, source, direction, quote_cents, target_bar_t FROM forecasts WHERE owner=? AND status='pending' ORDER BY target_bar_t ASC LIMIT 20").bind(owner).all<{ id: string; source: string; direction: string; quote_cents: number; target_bar_t: number }>();
    if (!pending.results.length) return { message: "No forward observations are waiting. Run the agent to record one." };
    const liveMarket = await getMarket();
    const scenario = scenarioMarket();
    const currentHour = Math.floor(Date.now() / 3600000) * 3600000;
    let reviewed = 0, unscorable = 0;
    for (const forecast of pending.results) {
      if (forecast.target_bar_t >= currentHour) continue;
      const candles = forecast.source === "scenario" ? scenario.candles : liveMarket.quote.source === "live" ? liveMarket.candles : [];
      const completed = candles.find(c => c.t === forecast.target_bar_t);
      if (!completed) {
        if (Date.now() - forecast.target_bar_t > 14 * 86400000) {
          await append(owner, "forecast_unscorable", { forecastId: forecast.id, source: forecast.source, reason: "No matching completed candle was available within the retained source window." }, [
            db().prepare("INSERT INTO review_locks (forecast_id, owner) VALUES (?, ?)").bind(forecast.id, owner),
            db().prepare("UPDATE forecasts SET status='unscorable', reviewed_at=? WHERE id=? AND owner=? AND status='pending'").bind(nowIso(), forecast.id, owner),
          ]);
          unscorable++;
        }
        continue;
      }
      const observedCents = Math.round(completed.close * 100);
      const observed = observedDirection(forecast.quote_cents, observedCents);
      const reviewedAt = nowIso();
      await append(owner, "forecast_review", { forecastId: forecast.id, source: forecast.source, predicted: forecast.direction, observed, correct: observed === forecast.direction, observedCents, barT: forecast.target_bar_t }, [
        db().prepare("INSERT INTO review_locks (forecast_id, owner) VALUES (?, ?)").bind(forecast.id, owner),
        db().prepare("UPDATE forecasts SET status='reviewed', observed_cents=?, observed_direction=?, reviewed_at=? WHERE id=? AND owner=? AND status='pending'").bind(observedCents, observed, reviewedAt, forecast.id, owner),
      ]);
      reviewed++;
    }
    return { message: reviewed || unscorable ? `Reviewed ${reviewed} completed-hour observation${reviewed === 1 ? "" : "s"}; ${unscorable} became unscorable. Accuracy is descriptive, not trading profit.` : "No matching completed hour is available yet. Live-source observations wait for live candles." };
  }
  if (type === "close") {
    const p = await one<Portfolio & Row>("SELECT * FROM portfolios WHERE owner=?", owner);
    if (!p.units_micro) throw new DeskError("There is no paper position to close.");
    const market = await getMarket();
    const proposalId = id(), createdAt = nowIso(), expiresAt = new Date(Date.now() + 5 * 60000).toISOString();
    await append(owner, "proposal", { proposalId, action: "sell", source: market.quote.source, rationale: "Owner requested a paper close. Exit is allowed after kill." }, [db().prepare("INSERT INTO proposals (id, owner, strategy, action, source, quote_cents, size_cents, rationale, factors_json, status, created_at, expires_at) VALUES (?, ?, 'owner_exit', 'sell', ?, ?, 0, ?, '{}', 'proposed', ?, ?)").bind(proposalId, owner, market.quote.source, Math.round(market.quote.price * 100), "Owner requested a paper close. Exit is allowed after kill.", createdAt, expiresAt)]);
    return { message: "Paper close proposal ready for approval." };
  }
  if (type === "run") {
    const profile = await one<Row>("SELECT strategy, mode FROM profiles WHERE owner=?", owner);
    const p = await one<Portfolio & Row>("SELECT * FROM portfolios WHERE owner=?", owner);
    const m = await one<Mandate & Row>("SELECT * FROM mandates WHERE owner=?", owner);
    const market = await getMarket();
    const strategy = profile.strategy === "reversion" ? "reversion" : "trend";
    if (market.quote.source === "live" && Date.now() - Date.parse(market.quote.asOf) > 90_000) throw new DeskError("Quote is stale. No decision or forecast recorded.", 409);
    const open = await db().prepare("SELECT id FROM proposals WHERE owner=? AND status='proposed' AND expires_at>? ORDER BY created_at DESC LIMIT 1").bind(owner, nowIso()).first();
    if (open) throw new DeskError("Review or decline the open proposal before running again.", 409);
    const decision = decide(market.candles, strategy, p.units_micro > 0);
    const sizeCents = decision.action === "buy" ? Math.min(Math.floor(equityCents(p, market.quote) * .1), Math.floor(equityCents(p, market.quote) * m.max_trade_bps / 10000)) : 0;
    const researchRow = await db().prepare("SELECT result_json, created_at, source FROM research WHERE owner=? ORDER BY created_at DESC LIMIT 1").bind(owner).first<{ result_json: string; created_at: string; source: string }>();
    let evidenceQualified = false;
    if (researchRow && researchRow.source === market.quote.source && Date.now() - Date.parse(researchRow.created_at) < 24 * 3600000) {
      try { evidenceQualified = JSON.parse(researchRow.result_json).walkForward?.[strategy]?.qualified === true; } catch { /* older or malformed research cannot qualify */ }
    }
    const pastFills = decision.action === "buy" ? await db().prepare("SELECT payload, created_at FROM events WHERE owner=? AND kind='paper_fill' ORDER BY seq DESC LIMIT 30").bind(owner).all<{ payload: string; created_at: string }>() : null;
    const exits = pastFills?.results.map(row => ({ ...JSON.parse(row.payload), at: row.created_at })).filter(x => x.action === "sell").slice(0, 2) || [];
    const cooldown = exits.length === 2 && exits.every(x => Number(x.realizedDeltaCents) < 0) && Date.now() - Date.parse(exits[0].at) < 12 * 3600000;
    const blocked = decision.action === "hold" ? null : cooldown && decision.action === "buy" ? "Agent memory: two losing exits. New entries pause for 12 hours." : gate(decision.action, p, m, market.quote, sizeCents);
    const councilReport = council(market.candles, strategy, p.units_micro > 0, evidenceQualified, blocked);
    const targetBarT = Math.floor(Date.now() / 3600000) * 3600000;
    const existing = await db().prepare("SELECT id FROM forecasts WHERE owner=? AND strategy=? AND source=? AND target_bar_t=?").bind(owner, strategy, market.quote.source, targetBarT).first();
    const forecast = existing ? [] : [db().prepare("INSERT OR IGNORE INTO forecasts (id, owner, strategy, source, direction, quote_cents, target_bar_t, rationale, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)").bind(id(), owner, strategy, market.quote.source, forecastDirection(decision.action), Math.round(market.quote.price * 100), targetBarT, decision.rationale, nowIso())];
    if (decision.action === "hold" || blocked) {
      await append(owner, blocked ? "blocked" : "no_trade", { action: decision.action, reason: blocked || decision.rationale, factors: decision.factors, council: councilReport, source: market.quote.source, targetBarT }, forecast);
      return { message: blocked || decision.rationale };
    }
    const proposalId = id(), createdAt = nowIso(), expiresAt = new Date(Date.now() + 5 * 60000).toISOString();
    await append(owner, "proposal", { proposalId, action: decision.action, source: market.quote.source, strategy, rationale: decision.rationale, factors: decision.factors, council: councilReport, targetBarT }, [...forecast, db().prepare("INSERT INTO proposals (id, owner, strategy, action, source, quote_cents, size_cents, rationale, factors_json, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)").bind(proposalId, owner, strategy, decision.action, market.quote.source, Math.round(market.quote.price * 100), sizeCents, decision.rationale, json({ factors: decision.factors, council: councilReport }), createdAt, expiresAt)]);
    if (profile.mode === "auto" && councilReport.autoEligible) {
      try { await execute(owner, proposalId); return { message: "Agent proposal passed the mandate and filled in the paper book." }; }
      catch (err) { return { message: `Agent proposal saved. Auto fill paused: ${err instanceof Error ? err.message : "refresh required"}` }; }
    }
    return { message: profile.mode === "auto" ? "Council requires human review: an opposing signal or no fresh qualified holdout. Paper proposal saved." : "Agent proposal ready for your approval. The council's dissent is visible." };
  }
  if (type === "approve") return execute(owner, textField(input.proposalId, 64));
  if (type === "reject") {
    const proposalId = textField(input.proposalId, 64);
    const proposal = await one<Row>("SELECT status FROM proposals WHERE id=? AND owner=?", proposalId, owner);
    if (proposal.status !== "proposed") throw new DeskError("This proposal is no longer open.", 409);
    await append(owner, "rejected", { proposalId }, [db().prepare("UPDATE proposals SET status='rejected' WHERE id=? AND owner=? AND status='proposed'").bind(proposalId, owner)]);
    return { message: "Proposal declined and recorded in the Passport." };
  }
  throw new DeskError("Unknown action.");
}

async function execute(owner: string, proposalId: string) {
  const proposal = await one<Row>("SELECT * FROM proposals WHERE id=? AND owner=?", proposalId, owner);
  if (proposal.status !== "proposed") throw new DeskError("This proposal is no longer open.", 409);
  if (Date.parse(String(proposal.expires_at)) <= Date.now()) throw new DeskError("Proposal expired. Run the agent again.", 409);
  const [p, m, market] = await Promise.all([
    one<Portfolio & Row>("SELECT * FROM portfolios WHERE owner=?", owner),
    one<Mandate & Row>("SELECT * FROM mandates WHERE owner=?", owner),
    getMarket(),
  ]);
  if (market.quote.source !== proposal.source) throw new DeskError("Data source changed. Run the agent again.", 409);
  if (Math.abs(market.quote.price * 100 / Number(proposal.quote_cents) - 1) > .01) throw new DeskError("Quote moved more than 1%. Run the agent again.", 409);
  const direction = proposal.action === "sell" ? "sell" : "buy";
  const reason = gate(direction, p, m, market.quote, Number(proposal.size_cents));
  if (reason) {
    await append(owner, "blocked", { proposalId, reason }, [db().prepare("UPDATE proposals SET status='blocked' WHERE id=? AND owner=? AND status='proposed'").bind(proposalId, owner)]);
    throw new DeskError(reason, 409);
  }
  const outcome = fill(direction, p, market.quote, Number(proposal.size_cents));
  const executedAt = nowIso();
  const statements = [
    db().prepare("INSERT INTO execution_locks (owner, portfolio_version, proposal_id) VALUES (?, ?, ?)").bind(owner, p.version, proposalId),
    db().prepare("UPDATE portfolios SET cash_cents=?, units_micro=?, cost_cents=?, realized_cents=?, peak_cents=?, version=? WHERE owner=? AND version=?").bind(outcome.next.cash_cents, outcome.next.units_micro, outcome.next.cost_cents, outcome.next.realized_cents, outcome.next.peak_cents, outcome.next.version, owner, p.version),
    db().prepare("UPDATE proposals SET status='filled' WHERE id=? AND owner=? AND status='proposed'").bind(proposalId, owner),
    db().prepare("INSERT INTO fills (proposal_id, owner, action, source, price_cents, units_micro, gross_cents, fee_cents, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(proposalId, owner, direction, market.quote.source, outcome.priceCents, outcome.unitsMicro, outcome.grossCents, outcome.feeCents, executedAt),
  ];
  await append(owner, "paper_fill", { proposalId, action: direction, source: market.quote.source, priceCents: outcome.priceCents, unitsMicro: outcome.unitsMicro, feeCents: outcome.feeCents, realizedDeltaCents: direction === "sell" ? outcome.next.realized_cents - p.realized_cents : null }, statements);
  return { message: `${direction === "buy" ? "Buy" : "Close"} filled in the ${market.quote.source === "live" ? "live-quote" : "scenario"} paper book.` };
}
