import type { Bar, Choice } from "./market-cases";

export const SPECIALISTS = [
  { id: "trend", name: "Trend Scout", task: "Map momentum and breakouts", cost: 5, station: "Trading Floor" },
  { id: "flow", name: "Volume Reader", task: "Test participation and traps", cost: 12, station: "Research Desk" },
  { id: "quant", name: "Quant Researcher", task: "Run a small pre-cutoff holdout", cost: 18, station: "Research Desk" },
  { id: "scenario", name: "Scenario Investigator", task: "Challenge the market narrative", cost: 12, station: "Risk Office" },
] as const;
export type Specialist = typeof SPECIALISTS[number]["id"];
export type Report = { specialist: Specialist; recommendation: Choice; evidence: string; metric: number; caveat: string; method: string; sourceCutoff: number };
export type Job = { specialist: Specialist; cost: number; report: Report; createdAt: string };
export type Council = { recommendation: Choice; votes: { specialist: string; action: Choice; evidence: string }[]; risk: { maxAllocationBps: number; reason: string; observedRangePct: number }; execution: { costAt10PctCents: number; costAt20PctCents: number; stressPct: number }; dissent: string; reportCount: number };
const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
const ret = (a: number, b: number) => a / b - 1;
const round = (n: number) => Math.round(n * 100) / 100;

export function specialistReport(id: Specialist, bars: Bar[], brief: string): Report {
  if (bars.length < 32) throw new Error("Insufficient pre-cutoff data");
  const last = bars.at(-1)!.close, prior = bars.at(-7)!.close;
  const six = ret(last, prior);
  const recommendation: Choice = six > .002 ? "BUY" : six < -.002 ? "SELL" : "HOLD";
  if (id === "trend") return { specialist: id, recommendation, evidence: `Six-bar return ${pct(six)}; close ${last.toFixed(2)} versus ${prior.toFixed(2)}.`, metric: round(six * 100), caveat: "Trend can fail at the next bar; this is a fictional path.", method: "Six completed bars; 0.20% decision threshold", sourceCutoff: bars.length };
  if (id === "flow") {
    const recent = bars.slice(-8).reduce((n, b) => n + b.volume, 0) / 8;
    const previous = bars.slice(-16, -8).reduce((n, b) => n + b.volume, 0) / 8;
    const participation = ret(recent, previous);
    const divergent = Math.abs(six) > .003 && participation < -.08;
    return { specialist: id, recommendation: divergent ? "HOLD" : participation > .08 ? recommendation : "HOLD", evidence: `Recent bar volume ${Math.round(recent)} versus ${Math.round(previous)} earlier (${pct(participation)}). ${divergent ? "Price moved while volume weakened: possible trap." : "Volume is bar data, not an order book."}`, metric: round(participation * 100), caveat: "No live order-flow or liquidity depth is available.", method: "Last eight completed bars versus prior eight", sourceCutoff: bars.length };
  }
  if (id === "quant") {
    let trendNet = 0, fadeNet = 0, observations = 0;
    for (let i = 26; i < bars.length - 1; i++) {
      const signal = ret(bars[i].close, bars[i - 4].close) > 0 ? 1 : -1;
      const next = ret(bars[i + 1].close, bars[i].close);
      trendNet += signal * next - .003;
      fadeNet += -signal * next - .003;
      observations++;
    }
    const best = Math.max(trendNet, fadeNet);
    return { specialist: id, recommendation: best <= 0 ? "HOLD" : trendNet >= fadeNet ? recommendation : recommendation === "BUY" ? "SELL" : recommendation === "SELL" ? "BUY" : "HOLD", evidence: `${observations} one-step, pre-cutoff holdout observations. Trend ${pct(trendNet)} cumulative after modeled turnover; fade ${pct(fadeNet)}.`, metric: round(best * 100), caveat: "Tiny single-path sample, no parameter tuning and no proven edge.", method: "Fixed four-bar sign, next-bar return, 30 bps each hypothetical turn", sourceCutoff: bars.length };
  }
  const recentRange = bars.slice(-6).reduce((sum, b) => sum + (b.high - b.low) / b.open, 0) / 6;
  return { specialist: id, recommendation: recentRange > .009 ? "HOLD" : recommendation, evidence: `Mission brief: ${brief} Recent six-bar high/low range averages ${(recentRange * 100).toFixed(2)}%.`, metric: round(recentRange * 100), caveat: "Scenario context only. No external news or prediction-market data is being verified.", method: "Brief and six completed bar ranges", sourceCutoff: bars.length };
}

export function riskGate(bars: Bar[]) {
  const recent = bars.slice(-12);
  const avgRange = recent.reduce((sum, b) => sum + (b.high - b.low) / b.open, 0) / recent.length;
  const latestMove = Math.abs(ret(bars.at(-1)!.close, bars.at(-2)!.close));
  const maxAllocationBps = avgRange > .025 || latestMove > .03 ? 0 : avgRange > .011 || latestMove > .012 ? 1000 : 2000;
  return { maxAllocationBps, observedRangePct: round(avgRange * 100), reason: maxAllocationBps === 0 ? "Stress veto: observed range or latest move exceeds the hard limit." : maxAllocationBps === 1000 ? "Elevated pre-cutoff range limits exposure to 10% of virtual capital." : "Pre-cutoff volatility permits up to 20% virtual exposure." };
}

export function conveneCouncil(jobs: Job[], bars: Bar[]): Council {
  const risk = riskGate(bars);
  const votes = jobs.map(j => ({ specialist: SPECIALISTS.find(s => s.id === j.specialist)!.name, action: j.report.recommendation, evidence: j.report.evidence }));
  const counts: Record<Choice, number> = { BUY: 0, SELL: 0, HOLD: 0 };
  for (const j of jobs) counts[j.report.recommendation] += j.specialist === "quant" ? 2 : 1;
  const sorted = (["BUY", "SELL", "HOLD"] as Choice[]).sort((a, b) => counts[b] - counts[a] || (a === "HOLD" ? -1 : b === "HOLD" ? 1 : a.localeCompare(b)));
  const recommendation = sorted[0];
  const dissent = votes.find(v => v.action !== recommendation)?.evidence || "No dispatched specialist opposed the leading call; missing reports remain unknown.";
  return { recommendation, votes, risk, execution: { costAt10PctCents: 300, costAt20PctCents: 600, stressPct: risk.observedRangePct }, dissent, reportCount: jobs.length };
}

export function outcomeAtAllocation(move: number, allocationBps: number): Record<Choice, number> {
  const sizeCents = Math.round(1_000_000 * allocationBps / 10_000);
  const cost = Math.round(sizeCents * .003);
  return { BUY: Math.round(sizeCents * move) - cost, SELL: Math.round(-sizeCents * move) - cost, HOLD: 0 };
}

export function seasonKey(now: number) {
  const date = new Date(now);
  const day = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day)).toISOString().slice(0, 10);
}
