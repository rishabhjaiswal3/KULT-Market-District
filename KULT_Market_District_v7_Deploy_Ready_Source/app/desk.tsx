"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, BrainCircuit, Check, ChevronRight, CircleHelp, Crosshair, Download, FlaskConical, LockKeyhole, Play, RefreshCw, ShieldCheck, Sparkles, Square, Zap } from "lucide-react";
import World from "./world";
import { backtest, council, decide, equityCents, fill, forecastDirection, forwardScore, gate, observedDirection, scenarioMarket, walkForward, START_CENTS, type Candle, type Mandate, type Portfolio, type Quote, type Strategy } from "../lib/engine";

type Zone = "desk" | "lab" | "mandate" | "passport";
type Proposal = { id: string; action: "buy" | "sell"; source: string; quote_cents: number; size_cents: number; rationale: string; factors_json: string; status: string; created_at: string; expires_at: string };
type Event = { seq: number; kind: string; payload: Record<string, unknown>; hash: string; created_at: string };
type TestResult = ReturnType<typeof backtest>;
type Council = ReturnType<typeof council>;
type Forecast = { id: string; strategy: Strategy; source: "live" | "scenario"; direction: string; quote_cents: number; target_bar_t: number; rationale: string; status: string; observed_cents: number | null; observed_direction: string | null; created_at: string; reviewed_at: string | null };
type State = {
  profile: { alias: string; agent_name: string; tutorial_done: number; mode: string; strategy: Strategy };
  mandate: Mandate; portfolio: Portfolio; proposals: Proposal[];
  fills: { proposal_id: string; action: string; source: string; price_cents: number; gross_cents: number; fee_cents: number; executed_at: string }[];
  research: { result: { trend: TestResult; reversion: TestResult; walkForward?: ReturnType<typeof walkForward>; asOf: string; dataSource: string; dataNotice?: string } } | null;
  events: Event[]; forecasts: Forecast[]; forwardScore: ReturnType<typeof forwardScore>; market: { quote: Quote; candles: Candle[]; notice?: string }; stats: { equityCents: number; pnlCents: number; drawdownBps: number }; execution: string; scenarioNow?: number;
};

const money = (cents: number) => "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const when = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function demo(now = Date.now()): State {
  const market = scenarioMarket(now);
  const portfolio: Portfolio = { cash_cents: START_CENTS, units_micro: 0, cost_cents: 0, realized_cents: 0, peak_cents: START_CENTS, version: 0 };
  return { profile: { alias: "Director 01", agent_name: "Scout", tutorial_done: 0, mode: "human", strategy: "trend" }, mandate: { max_trade_bps: 1000, max_position_bps: 2500, max_drawdown_bps: 1200, killed: 0, version: 0, expires_at: new Date(now + 14 * 86400000).toISOString() }, portfolio, proposals: [], fills: [], research: null, events: [], forecasts: [], forwardScore: forwardScore([]), market: { ...market, candles: market.candles.slice(-72) }, stats: { equityCents: START_CENTS, pnlCents: 0, drawdownBps: 0 }, execution: "paper_only", scenarioNow: now };
}

function Chart({ candles, color = "#d8ff45" }: { candles: Candle[]; color?: string }) {
  const prices = candles.map(c => c.close);
  const min = Math.min(...prices) * .998, max = Math.max(...prices) * 1.002;
  const points = prices.map((n, i) => `${i * 600 / Math.max(1, prices.length - 1)},${120 - (n - min) / (max - min || 1) * 110}`).join(" ");
  return <svg viewBox="0 0 600 130" className="price-chart" aria-label="Recent completed price candles"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop stopColor={color} stopOpacity=".2"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs><path d={`M${points.replaceAll(" ", " L")} L600 130 L0 130Z`} fill="url(#chartFill)" /><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/><line x1="0" x2="600" y1="120" y2="120" stroke="#49606a" strokeDasharray="3 8"/></svg>;
}

function Curve({ curve }: { curve: TestResult["curve"] }) {
  const equity = curve.map(p => p.equity), bench = curve.map(p => p.benchmark);
  const min = Math.min(...equity, ...bench) * .995, max = Math.max(...equity, ...bench) * 1.005;
  const line = (values: number[]) => values.map((n, i) => `${i * 600 / Math.max(1, values.length - 1)},${120 - (n - min) / (max - min || 1) * 110}`).join(" ");
  return <svg viewBox="0 0 600 130" className="curve-chart" role="img" aria-label="Paper strategy equity in lime versus buy and hold benchmark in violet"><line x1="0" x2="600" y1="120" y2="120" stroke="#364c56" strokeDasharray="3 7"/><polyline points={line(bench)} fill="none" stroke="#7957f4" strokeWidth="2"/><polyline points={line(equity)} fill="none" stroke="#dcff50" strokeWidth="2.6"/></svg>;
}

function localAction(state: State, input: Record<string, unknown>): { state: State; message: string } {
  const s: State = structuredClone(state);
  const scenarioNow = s.scenarioNow ?? Date.now();
  const stamp = new Date(scenarioNow).toISOString();
  const record = (kind: string, payload: Record<string, unknown>) => s.events.unshift({ seq: s.events.length + 1, kind, payload, hash: "UNSAVED SCENARIO", created_at: stamp });
  if (input.type === "profile") {
    s.profile = { alias: String(input.alias).slice(0, 24), agent_name: String(input.agentName).slice(0, 20), strategy: input.strategy === "reversion" ? "reversion" : "trend", mode: input.mode === "auto" ? "auto" : "human", tutorial_done: 1 };
    record("profile", { mode: s.profile.mode, strategy: s.profile.strategy }); return { state: s, message: "Scenario profile updated. Sign in to save it." };
  }
  if (input.type === "mandate") {
    s.mandate = { ...s.mandate, max_trade_bps: Number(input.maxTradeBps), max_position_bps: Number(input.maxPositionBps), max_drawdown_bps: Number(input.maxDrawdownBps), expires_at: new Date(Date.now() + Number(input.days) * 86400000).toISOString() };
    record("mandate", { demo: true }); return { state: s, message: "Scenario mandate updated." };
  }
  if (input.type === "kill" || input.type === "rearm") {
    s.mandate.killed = input.type === "kill" ? 1 : 0;
    s.mandate.expires_at = new Date(Date.now() + 7 * 86400000).toISOString();
    if (s.mandate.killed) s.proposals.forEach(p => { if (p.status === "proposed" && p.action === "buy") p.status = "blocked"; });
    record(String(input.type), { killed: !!s.mandate.killed }); return { state: s, message: s.mandate.killed ? "Scenario kill active. Exits still work." : "Scenario mandate rearmed." };
  }
  if (input.type === "research") {
    const candles = scenarioMarket(scenarioNow).candles;
    s.research = { result: { trend: backtest(candles, "trend"), reversion: backtest(candles, "reversion"), walkForward: walkForward(candles), asOf: stamp, dataSource: "scenario", dataNotice: "Fictional candles, for interface exploration only." } };
    record("research", { source: "scenario" }); return { state: s, message: "Scenario trial complete. These results are fictional." };
  }
  if (input.type === "review") {
    const nextNow = scenarioNow + 3600000;
    const market = scenarioMarket(nextNow);
    s.scenarioNow = nextNow;
    s.market = { ...market, candles: market.candles.slice(-72) };
    const completedHour = Math.floor(nextNow / 3600000) * 3600000;
    let count = 0;
    for (const forecast of s.forecasts) {
      if (forecast.status !== "pending" || forecast.target_bar_t >= completedHour) continue;
      const candle = market.candles.find(c => c.t === forecast.target_bar_t);
      if (!candle) continue;
      const observedCents = Math.round(candle.close * 100);
      forecast.observed_cents = observedCents;
      forecast.observed_direction = observedDirection(forecast.quote_cents, observedCents);
      forecast.status = "reviewed"; forecast.reviewed_at = new Date(nextNow).toISOString();
      record("forecast_review", { source: "scenario", forecastId: forecast.id, predicted: forecast.direction, observed: forecast.observed_direction, correct: forecast.direction === forecast.observed_direction });
      count++;
    }
    s.forwardScore = forwardScore(s.forecasts);
    s.stats.equityCents = equityCents(s.portfolio, market.quote); s.stats.pnlCents = s.stats.equityCents - START_CENTS;
    return { state: s, message: `Advanced the fictional clock by one hour. ${count} scenario observation${count === 1 ? "" : "s"} reviewed; nothing was saved.` };
  }
  if (input.type === "close") {
    if (!s.portfolio.units_micro) return { state: s, message: "There is no paper position to close." };
    const p: Proposal = { id: `scenario-close-${scenarioNow}`, action: "sell", source: "scenario", quote_cents: Math.round(s.market.quote.price * 100), size_cents: 0, rationale: "Owner requested a paper close. Exit is allowed after kill.", factors_json: "{}", status: "proposed", created_at: stamp, expires_at: new Date(scenarioNow + 300000).toISOString() };
    s.proposals.unshift(p); record("proposal", { action: "sell", source: "scenario" });
    return { state: s, message: "Scenario close proposal ready for approval." };
  }
  if (input.type === "run") {
    if (s.proposals.some(p => p.status === "proposed" && Date.parse(p.expires_at) > scenarioNow)) return { state: s, message: "Review the open proposal before running again." };
    const decision = decide(s.market.candles, s.profile.strategy, s.portfolio.units_micro > 0);
    const sizeCents = Math.min(Math.floor(s.stats.equityCents * .1), Math.floor(s.stats.equityCents * s.mandate.max_trade_bps / 10000));
    const blocked = decision.action === "hold" ? null : gate(decision.action, s.portfolio, s.mandate, s.market.quote, sizeCents, scenarioNow);
    const qualified = s.research?.result.walkForward?.[s.profile.strategy]?.qualified === true;
    const councilReport = council(s.market.candles, s.profile.strategy, s.portfolio.units_micro > 0, qualified, blocked);
    const targetBarT = Math.floor(scenarioNow / 3600000) * 3600000;
    if (!s.forecasts.some(f => f.target_bar_t === targetBarT && f.strategy === s.profile.strategy)) s.forecasts.unshift({ id: `forecast-${scenarioNow}`, strategy: s.profile.strategy, source: "scenario", direction: forecastDirection(decision.action), quote_cents: Math.round(s.market.quote.price * 100), target_bar_t: targetBarT, rationale: decision.rationale, status: "pending", observed_cents: null, observed_direction: null, created_at: stamp, reviewed_at: null });
    s.forwardScore = forwardScore(s.forecasts);
    if (decision.action === "hold" || blocked) { record(blocked ? "blocked" : "no_trade", { reason: blocked || decision.rationale, council: councilReport, source: "scenario" }); return { state: s, message: blocked || decision.rationale }; }
    const p: Proposal = { id: `scenario-${scenarioNow}-${Math.floor(Math.random() * 1e6)}`, action: decision.action, source: "scenario", quote_cents: Math.round(s.market.quote.price * 100), size_cents: decision.action === "buy" ? sizeCents : 0, rationale: decision.rationale, factors_json: JSON.stringify({ factors: decision.factors, council: councilReport }), status: "proposed", created_at: stamp, expires_at: new Date(scenarioNow + 300000).toISOString() };
    s.proposals.unshift(p); record("proposal", { action: p.action, source: "scenario", council: councilReport });
    if (s.profile.mode === "auto" && councilReport.autoEligible) return localAction(s, { type: "approve", proposalId: p.id });
    return { state: s, message: "Scenario proposal created. Approve or reject it." };
  }
  if (input.type === "approve" || input.type === "reject") {
    const p = s.proposals.find(x => x.id === input.proposalId && x.status === "proposed");
    if (!p) return { state: s, message: "No open proposal." };
    if (input.type === "reject") { p.status = "rejected"; record("rejected", { proposalId: p.id }); return { state: s, message: "Scenario proposal declined." }; }
    const reason = gate(p.action, s.portfolio, s.mandate, s.market.quote, p.size_cents, scenarioNow);
    if (reason) { p.status = "blocked"; record("blocked", { reason }); return { state: s, message: reason }; }
    const result = fill(p.action, s.portfolio, s.market.quote, p.size_cents);
    s.portfolio = result.next; p.status = "filled";
    s.stats.equityCents = equityCents(s.portfolio, s.market.quote); s.stats.pnlCents = s.stats.equityCents - START_CENTS;
    s.fills.unshift({ proposal_id: p.id, action: p.action, source: "scenario", price_cents: result.priceCents, gross_cents: result.grossCents, fee_cents: result.feeCents, executed_at: stamp });
    record("paper_fill", { action: p.action, source: "scenario", feeCents: result.feeCents });
    return { state: s, message: "Scenario paper fill recorded. No real order was placed." };
  }
  return { state: s, message: "Unknown action." };
}

const tutorial = [
  { title: "Welcome to your agent desk", body: "Your persistent agent researches, proposes and remembers. You direct it. Every market action in this beta is a paper simulation.", icon: <Sparkles size={26}/> },
  { title: "Test, then challenge", body: "The lab separates development from a later historical holdout, then doubles costs. The second scout and risk steward challenge every decision.", icon: <FlaskConical size={26}/> },
  { title: "Write the mandate", body: "Set trade size, total exposure, drawdown and expiry. A kill blocks new entries; reducing or closing a paper position stays possible.", icon: <ShieldCheck size={26}/> },
  { title: "Return for the result", body: "Each run logs one next-hour forecast. Review it after that hour closes; live and fictional scores stay separate in your Passport.", icon: <BookOpen size={26}/> },
];

export default function Desk({ signedIn, displayName, signInPath, signOutPath }: { signedIn: boolean; displayName: string | null; signInPath: string; signOutPath: string }) {
  const [state, setState] = useState<State | null>(null);
  const [zone, setZone] = useState<Zone>("desk");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [guide, setGuide] = useState<number | null>(null);
  const [profileForm, setProfileForm] = useState({ alias: "", agentName: "", mode: "human", strategy: "trend" });
  const [limits, setLimits] = useState({ trade: 10, position: 25, drawdown: 12, days: 14 });
  const [trial, setTrial] = useState<"trend" | "reversion">("trend");

  const load = useCallback(async () => {
    if (!signedIn) { setState(demo()); return; }
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      const j = await r.json() as State & { error?: string };
      if (!r.ok) throw new Error(j.error || "Desk unavailable");
      setState(j);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not load the desk."); }
  }, [signedIn]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!state) return; setProfileForm({ alias: state.profile.alias, agentName: state.profile.agent_name, mode: state.profile.mode, strategy: state.profile.strategy }); setLimits({ trade: state.mandate.max_trade_bps / 100, position: state.mandate.max_position_bps / 100, drawdown: state.mandate.max_drawdown_bps / 100, days: Math.max(1, Math.round((Date.parse(state.mandate.expires_at) - Date.now()) / 86400000)) }); }, [state?.profile.alias, state?.profile.agent_name, state?.profile.mode, state?.profile.strategy, state?.mandate.max_trade_bps, state?.mandate.max_position_bps, state?.mandate.max_drawdown_bps, state?.mandate.expires_at]);
  useEffect(() => { if (state && guide === null && !state.profile.tutorial_done && !sessionStorage.getItem("kult-guide-seen")) setGuide(0); }, [state, guide]);

  async function send(input: Record<string, unknown>) {
    if (!state || busy) return;
    setBusy(true); setMessage("");
    try {
      if (!signedIn) { const outcome = localAction(state, input); setState(outcome.state); setMessage(outcome.message); }
      else {
        const r = await fetch("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
        const j = await r.json() as { error?: string; message: string };
        if (!r.ok) throw new Error(j.error || "Request failed");
        setMessage(j.message); await load();
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Request failed"); await load(); }
    finally { setBusy(false); }
  }

  if (!state) return <div className="loading"><div className="brand-icon">K</div><p>OPENING KULT ALPHA DESK</p></div>;
  const { profile, mandate, portfolio, market, stats } = state;
  const proposal = state.proposals.find(p => p.status === "proposed");
  const live = market.quote.source === "live";
  const fresh = !live || Date.now() - Date.parse(market.quote.asOf) <= 90_000;
  const lastTrial = state.research?.result;
  const chosen = lastTrial?.[trial];
  const holdout = lastTrial?.walkForward?.[trial];
  const latestCouncil = state.events.find(e => e.payload.council)?.payload.council as Council | undefined;
  const score = live ? state.forwardScore.live : state.forwardScore.scenario;
  const change = (stats.pnlCents / START_CENTS) * 100;
  const nav: { id: Zone; label: string; icon: React.ReactNode }[] = [
    { id: "desk", label: "The Desk", icon: <Crosshair size={17}/> },
    { id: "lab", label: "Strategy Lab", icon: <FlaskConical size={17}/> },
    { id: "mandate", label: "Mandate", icon: <ShieldCheck size={17}/> },
    { id: "passport", label: "Passport", icon: <BookOpen size={17}/> },
  ];

  return <div className="app-shell">
    <aside className="rail">
      <div className="rail-brand"><span className="brand-icon">K</span><span>KULT<br/><b>WORLD</b></span></div>
      <span className="rail-section">DISTRICTS / 01</span>
      <div className="rail-nav">{nav.map(n => <button key={n.id} className={zone === n.id ? "active" : ""} onClick={() => setZone(n.id)}>{n.icon}<span>{n.label}</span>{zone === n.id && <i/>}</button>)}</div>
      <div className="rail-bottom"><span className="mini-agent">✦</span><div><b>{profile.agent_name}</b><small>{profile.mode === "auto" ? "AUTO PAPER MODE" : "HUMAN DIRECTED"}</small></div></div>
    </aside>

    <div className="main-column">
      <header className="topbar"><div className="breadcrumbs"><a href="/" title="Back to Market District">KULT WORLD</a> <ChevronRight size={12}/> <a href="/">MARKET DISTRICT</a> <ChevronRight size={12}/><b>ALPHA DESK</b></div><div className="top-actions"><span className={`source-pill ${live && fresh ? "live" : "scenario"}`}><span className="pulse-dot"/>{live ? fresh ? "LIVE MARKET DATA · PAPER" : "STALE LIVE QUOTE · PAPER" : "SCENARIO DATA · PAPER"}</span><button className="icon-button" title="Refresh market and desk" onClick={load}><RefreshCw size={16}/></button>{signedIn ? <a className="identity-link" href={signOutPath} target="_top" title="Sign out">{displayName?.split("@")[0] || "Director"}</a> : <a className="identity-link" href={signInPath} target="_top">SIGN IN TO SAVE <ArrowRight size={13}/></a>}</div></header>
      <div className="content">
        <div className="eyebrow">◆ THE AGENT RESEARCH FLOOR · PAPER BETA</div>
        <div className="hero-row"><div><h1>Give your agent a desk.<br/><em>Make it earn your trust.</em></h1><p>Test the idea. Hear the dissent. Set the limits. Return to score the call.</p></div><button className="help-button" onClick={() => setGuide(0)}><CircleHelp size={16}/> How this works</button></div>
        {!signedIn && <div className="demo-banner"><Sparkles size={17}/><span>Exploration mode: actions here are fictional and reset on refresh. Sign in to keep a paper record.</span><a href={signInPath} target="_top">SAVE MY DESK <ArrowRight size={13}/></a></div>}
        {message && <div className="notice" role="status"><span className="pulse-dot"/>{message}<button aria-label="Dismiss" onClick={() => setMessage("")}>×</button></div>}
        <section className="stat-grid">
          <div className="stat-card"><span>PAPER EQUITY</span><strong>{money(stats.equityCents)}</strong><small className={stats.pnlCents >= 0 ? "up" : "down"}>{stats.pnlCents >= 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {percent(change)} from $10,000 start</small></div>
          <div className="stat-card"><span>PAPER CASH</span><strong>{money(portfolio.cash_cents)}</strong><small>Available inside the desk</small></div>
          <div className="stat-card"><span>BTC EXPOSURE</span><strong>{portfolio.units_micro ? (portfolio.units_micro / 1_000_000).toFixed(6) : "0.000000"}</strong><small>BTC · {portfolio.units_micro ? money(Math.round(portfolio.units_micro * market.quote.bid * 100 / 1_000_000)) : "No position"}</small></div>
          <div className="stat-card"><span>MANDATE STATUS</span><strong className={mandate.killed || Date.parse(mandate.expires_at) <= Date.now() ? "red" : "lime"}>{mandate.killed ? "KILLED" : Date.parse(mandate.expires_at) <= Date.now() ? "EXPIRED" : "ARMED"}</strong><small>{mandate.killed || Date.parse(mandate.expires_at) <= Date.now() ? "Entries blocked · exits allowed" : `Expires ${when(mandate.expires_at)}`}</small></div>
        </section>

        <div className="stage-grid"><World active={zone} onSelect={setZone} agentName={profile.agent_name}/><section className="control-panel">
          <div className="panel-head"><div><span className="eyebrow">ACTIVE STATION</span><h2>{zone === "desk" ? "The agent desk" : zone === "lab" ? "Strategy lab" : zone === "mandate" ? "The mandate" : "Agent Passport"}</h2></div><span className="station-number">0{nav.findIndex(n => n.id === zone) + 1}</span></div>
          {zone === "desk" && <div className="panel-body">
            <div className="quote-block"><div><span>BTC / USD</span><strong>{market.quote.price.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}</strong></div><span className={`quote-source ${live && fresh ? "green" : "amber"}`}>{live ? fresh ? "LIVE QUOTE" : "STALE LIVE QUOTE" : "FICTIONAL PRICE"}<small>{when(market.quote.asOf)}</small></span></div>
            <Chart candles={market.candles}/>
            <div className="agent-note"><span className="avatar">✦</span><div><b>{profile.agent_name} / {profile.strategy === "trend" ? "Trend Scout" : "Reversion Scout"}</b><p>“I can recommend an entry, a close, or no action. Your mandate is checked again before every paper fill.”</p></div></div>
            <div className="council"><div className="council-head"><span>THE DECISION COUNCIL</span><small>{latestCouncil ? "LATEST RUN" : "AWAITING FIRST RUN"}</small></div>{latestCouncil ? <div className="council-grid"><div><i className="role-dot lead"/><b>{latestCouncil.lead.role}</b><strong>{latestCouncil.lead.action.toUpperCase()}</strong><p>{latestCouncil.lead.rationale}</p></div><div><i className="role-dot challenge"/><b>{latestCouncil.challenger.role}</b><strong>{latestCouncil.challenger.action.toUpperCase()}</strong><p>{latestCouncil.challenger.rationale}</p></div><div><i className="role-dot steward"/><b>Risk Steward</b><strong>{latestCouncil.steward.verdict.startsWith("Within") ? "CLEAR" : "CAUTION"}</strong><p>{latestCouncil.steward.verdict}</p></div></div> : <p>Run the agent to see the lead idea, a competing rule and the risk verdict. These are transparent rules, not LLM personas.</p>}</div>
            {proposal ? <div className="proposal-card"><div className="proposal-top"><span className={proposal.action === "buy" ? "proposal-buy" : "proposal-sell"}>{proposal.action.toUpperCase()} BTC · PAPER</span><small>Expires {when(proposal.expires_at)}</small></div><p>{proposal.rationale}</p><div className="proposal-meta"><span>REFERENCE {money(proposal.quote_cents)}</span><span>{proposal.action === "buy" ? `SIZE ${money(proposal.size_cents)}` : "CLOSE POSITION"}</span></div><div className="proposal-actions"><button className="primary" disabled={busy} onClick={() => send({ type: "approve", proposalId: proposal.id })}>APPROVE PAPER {proposal.action === "buy" ? "BUY" : "CLOSE"} <ArrowRight size={16}/></button><button className="quiet" disabled={busy} onClick={() => send({ type: "reject", proposalId: proposal.id })}>DECLINE</button></div></div> : <div className="no-proposal"><span className="line-icon"><Activity size={19}/></span><b>No proposal waiting</b><small>Run the agent. A “do nothing” decision is recorded too.</small></div>}
            <button className="primary wide" disabled={busy} onClick={() => send({ type: "run" })}><Play size={16} fill="currentColor"/>{busy ? "AGENT WORKING…" : "RUN AGENT DECISION"}<ArrowRight size={16}/></button>{portfolio.units_micro > 0 && !proposal && <button className="close-button" disabled={busy} onClick={() => send({ type: "close" })}>REQUEST PAPER CLOSE <ArrowRight size={15}/></button>}<p className="tiny-note">{profile.mode === "auto" ? "Auto paper entry needs a fresh qualified holdout, no active opposing signal and a clear mandate. Otherwise, review manually. No background schedule." : "Human mode waits for your approval. No live trade can be placed."}</p>
          </div>}
          {zone === "lab" && <div className="panel-body"><div className="lab-intro"><FlaskConical size={24}/><h3>Test it. Then try to break it.</h3><p>Signals use completed hourly candles; modeled fills occur at the next open, with costs.</p></div><div className="strategy-choice"><button onClick={() => setTrial("trend")} className={trial === "trend" ? "selected" : ""}>↗ Trend Scout</button><button onClick={() => setTrial("reversion")} className={trial === "reversion" ? "selected" : ""}>⌁ Reversion Scout</button></div>{chosen ? <><div className="trial-numbers"><div><span>FULL HISTORY</span><b className={chosen.returnPct >= 0 ? "lime" : "red"}>{percent(chosen.returnPct)}</b></div><div><span>BUY & HOLD</span><b>{percent(chosen.benchmarkPct)}</b></div><div><span>MAX DRAWDOWN</span><b>{chosen.maxDrawdownPct.toFixed(2)}%</b></div></div><Curve curve={chosen.curve}/>{holdout && <div className="evidence-card"><div className="evidence-title"><span>CHRONOLOGICAL HOLDOUT</span><b className={holdout.qualified ? "pass" : "caution"}>{holdout.qualified ? "NARROW SCREEN PASSED" : "HUMAN REVIEW"}</b></div><div className="evidence-numbers"><div><small>DEVELOPMENT</small><strong>{percent(holdout.train.returnPct)}</strong></div><div><small>LATER 30%</small><strong>{percent(holdout.test.returnPct)}</strong></div><div><small>2× COSTS</small><strong>{percent(holdout.stress.returnPct)}</strong></div></div><p>{holdout.reason}</p></div>}<p className="tiny-note">{chosen.entries} entries · {chosen.exits} exits · {lastTrial?.dataSource === "live" ? "Historical market candles; simulated fills" : "Fictional scenario candles and simulated fills"}. The holdout is still historical, not forward performance.</p></> : <div className="trial-empty">No trial has run yet. Test the two rules before judging either one.</div>}<button className="primary wide" disabled={busy} onClick={() => send({ type: "research" })}><FlaskConical size={16}/>{busy ? "TESTING…" : "RUN RESEARCH & COST STRESS"}<ArrowRight size={16}/></button></div>}
          {zone === "mandate" && <div className="panel-body"><div className="mandate-banner"><ShieldCheck size={23}/><div><b>Trade only inside these limits</b><p>Checks run at proposal and again at paper fill.</p></div></div><div className="range-row"><label>MAX PER TRADE <b>{limits.trade}%</b></label><input aria-label="Maximum per trade percent" type="range" min="1" max="20" value={limits.trade} onChange={e => setLimits({ ...limits, trade: +e.target.value, position: Math.max(+e.target.value, limits.position) })}/></div><div className="range-row"><label>MAX TOTAL POSITION <b>{limits.position}%</b></label><input aria-label="Maximum position percent" type="range" min={limits.trade} max="50" value={limits.position} onChange={e => setLimits({ ...limits, position: +e.target.value })}/></div><div className="range-row"><label>MAX PAPER DRAWDOWN <b>{limits.drawdown}%</b></label><input aria-label="Maximum drawdown percent" type="range" min="2" max="30" value={limits.drawdown} onChange={e => setLimits({ ...limits, drawdown: +e.target.value })}/></div><div className="select-row"><label>EXPIRES IN</label><select value={limits.days} onChange={e => setLimits({ ...limits, days: +e.target.value })}><option value="1">1 day</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></div><button className="primary wide" disabled={busy} onClick={() => send({ type: "mandate", maxTradeBps: limits.trade * 100, maxPositionBps: limits.position * 100, maxDrawdownBps: limits.drawdown * 100, days: limits.days })}>SAVE MANDATE <Check size={15}/></button><button className={mandate.killed ? "rearm-button" : "kill-button"} disabled={busy} onClick={() => send({ type: mandate.killed ? "rearm" : "kill" })}>{mandate.killed ? <Zap size={17}/> : <Square size={17}/>} {mandate.killed ? "REARM PAPER DESK" : "KILL NEW ENTRIES"}</button><p className="tiny-note">The kill is enforced by this paper desk. No exchange credentials or live trading authority are connected.</p></div>}
          {zone === "passport" && <div className="panel-body"><div className="passport-card"><div className="passport-symbol">✦</div><div><span>KULT AGENT PASSPORT / BETA</span><h3>{profile.agent_name}</h3><p>Directed by {profile.alias}</p></div></div><div className="field-row"><label>YOUR ALIAS</label><input value={profileForm.alias} maxLength={24} onChange={e => setProfileForm({ ...profileForm, alias: e.target.value })}/></div><div className="field-row"><label>AGENT NAME</label><input value={profileForm.agentName} maxLength={20} onChange={e => setProfileForm({ ...profileForm, agentName: e.target.value })}/></div><div className="select-row"><label>STRATEGY</label><select value={profileForm.strategy} onChange={e => setProfileForm({ ...profileForm, strategy: e.target.value })}><option value="trend">Trend Scout</option><option value="reversion">Reversion Scout</option></select></div><div className="select-row"><label>DECISION MODE</label><select value={profileForm.mode} onChange={e => setProfileForm({ ...profileForm, mode: e.target.value })}><option value="human">Human approval</option><option value="auto">Auto paper fill on agent run</option></select></div><button className="primary wide" disabled={busy} onClick={() => send({ type: "profile", alias: profileForm.alias, agentName: profileForm.agentName, strategy: profileForm.strategy, mode: profileForm.mode })}>SAVE AGENT ID <Check size={15}/></button><p className="tiny-note">This beta uses the Site sign-in identity. KULT’s cross-experience Agent ID needs the host app’s authenticated identity bridge.</p></div>}
        </section></div>

        <section className="lower-grid"><div className="lower-card"><div className="section-head"><div><span className="eyebrow">THE PROOF FEED</span><h2>Every decision leaves a trail.</h2></div><button onClick={() => setZone("passport")}>OPEN PASSPORT <ArrowRight size={13}/></button></div><div className="event-list">{state.events.length ? state.events.slice(0, 5).map((e, i) => <div className="event-item" key={`${e.seq}-${i}`}><span className={`event-icon ${e.kind}`}>{e.kind === "paper_fill" ? <Check size={16}/> : e.kind === "blocked" || e.kind === "kill" ? <LockKeyhole size={16}/> : e.kind === "research" ? <FlaskConical size={16}/> : <BrainCircuit size={16}/>}</span><div><b>{e.kind.replaceAll("_", " ").toUpperCase()}</b><small>{typeof e.payload.reason === "string" ? e.payload.reason : e.kind === "paper_fill" ? "Paper fill recorded with price and cost" : "Agent decision and context saved"}</small></div><time>{when(e.created_at)}</time></div>) : <div className="empty-feed">No events yet. The first trial, hold or proposal will appear here.</div>}</div>{signedIn && <a href="/api/passport" className="export-link"><Download size={15}/> DOWNLOAD MY PASSPORT JSON</a>}{!signedIn && <span className="export-link dim"><Download size={15}/> SIGN IN TO SAVE AND EXPORT</span>}</div><div className="lower-card brief"><div className="section-head"><div><span className="eyebrow">THE RULE OF THE HOUSE</span><h2>Do nothing is a move.</h2></div></div><p>If the quote is stale, the spread widens, the mandate expires or the size breaks a limit, the desk refuses a new paper entry. A killed desk can still close.</p><div className="brief-footer"><div><span className="green-dot"/> SOURCE: {live ? "COINBASE EXCHANGE" : "GENERATED SCENARIO"}</div><div>FEES 0.10% · SLIPPAGE 0.05%</div><div>EXECUTION: PAPER ONLY</div></div></div></section>
        <section className="review-section"><div className="review-copy"><span className="eyebrow">NEXT-HOUR OUTCOME LOOP</span><h2>Return for the call.</h2><p>One forecast per agent and hour. It is scored only against the next completed candle. A hold predicts a move within ±0.25%; live and scenario observations never mix.</p><button className="review-button" disabled={busy} onClick={() => send({ type: "review" })}>{signedIn ? "REVIEW COMPLETED HOURS" : "ADVANCE FICTIONAL HOUR + REVIEW"} <ArrowRight size={15}/></button><small>{signedIn ? "No scheduled agent is running while you are away. Return to review the actual next completed hour." : "Exploration mode advances simulation time. It does not predict or save a real outcome."}</small></div><div className="review-board"><div className="review-metric"><span>{live ? "LIVE-SOURCE PAPER" : "FICTIONAL SCENARIO"}</span><b>{score.reviewed ? `${score.correct} / ${score.reviewed}` : "—"}</b><small>{score.enoughSample ? `${score.ratePct}% match · always-flat baseline ${score.baselinePct}% · actionable ${score.actionableCorrect}/${score.actionable}` : `${score.pending} waiting · sample too small for a performance claim (20 minimum)`}</small></div><div className="review-list">{state.forecasts.filter(f => f.source === (live ? "live" : "scenario")).slice(0, 3).map(f => <div key={f.id}><span>{f.strategy.toUpperCase()} · {f.direction.toUpperCase()}</span><b className={f.status === "reviewed" ? f.direction === f.observed_direction ? "lime" : "red" : "amber"}>{f.status === "reviewed" ? f.direction === f.observed_direction ? "MATCH" : `MISSED · ${f.observed_direction?.toUpperCase()}` : f.status === "unscorable" ? "NO COMPARABLE CANDLE" : "AWAITING CLOSE"}</b><small>{when(f.created_at)}</small></div>)}{!state.forecasts.some(f => f.source === (live ? "live" : "scenario")) && <p>Run the agent to make the first observation.</p>}</div><div className="source-split">LIVE: {state.forwardScore.live.reviewed} REVIEWED <span>◆</span> SCENARIO: {state.forwardScore.scenario.reviewed} REVIEWED</div></div></section>
        <footer className="footer">KULT ALPHA DESK / PRIVATE BETA <span>Research ≠ returns. Paper fills ≠ exchange fills. This record is local to this desk.</span></footer>
      </div>
    </div>
    {guide !== null && <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="guide-title"><div className="guide-card"><div className="guide-top"><span className="eyebrow">WELCOME TO THE MARKET DISTRICT</span><button aria-label="Close tutorial" onClick={() => { setGuide(null); sessionStorage.setItem("kult-guide-seen", "1"); }}>×</button></div><div className="guide-icon">{tutorial[guide].icon}</div><span className="step-count">0{guide + 1} / 04</span><h2 id="guide-title">{tutorial[guide].title}</h2><p>{tutorial[guide].body}</p><div className="guide-steps">{tutorial.map((_, i) => <span key={i} className={i === guide ? "current" : ""}/>)}</div><div className="guide-actions">{guide > 0 && <button className="quiet" onClick={() => setGuide(guide - 1)}>BACK</button>}<button className="primary" onClick={() => { if (guide < 3) setGuide(guide + 1); else { setGuide(null); sessionStorage.setItem("kult-guide-seen", "1"); if (signedIn && !state.profile.tutorial_done) send({ type: "profile", alias: profile.alias, agentName: profile.agent_name, mode: profile.mode, strategy: profile.strategy }); } }}>{guide === 3 ? "ENTER THE DESK" : "NEXT"} <ArrowRight size={16}/></button></div></div></div>}
  </div>;
}
