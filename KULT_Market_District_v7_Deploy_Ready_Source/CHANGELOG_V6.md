# Market District v6 — Build changes and boundaries

## Game-first practice mode

| Feature | Completed in standalone Arena | Production status |
|---|---|---|
| Six distinct fictional episodes | ✓ | Standalone local practice; not server daily ranked |
| Four research specialist reports | ✓ | Deterministic rule-based, not autonomous LLM agents |
| Capped research credits | ✓ | LocalStorage only for V6 Arena; original v5 D1 budget unchanged |
| Council vote and traceable disagreement | ✓ | Standalone rule logic; server v5 engine also improved |
| Risk Steward 0/10/20% caps | ✓ | Local for Arena; D1 server rechecks separately in original v5 |
| Virtual trade and hindsight counterfactual | ✓ | Local demonstration outcome; no deposits or fills |
| Specialist XP and Agency HQ | ✓ | Local cosmetic progression, not global verified Passport |
| Local season ranking | ✓ | Solo practice only, not real opponents |
| Export JSON agency history | ✓ | Local untrusted JSON, not tamper-proof proof |
| Responsive desktop/mobile UI | ✓ | Chromium checks completed at 1440px and 390px |
| New balanced daily scenario generator | ✓ | Source available, not deployed or D1 integration-tested |
| Production KULT Agent ID | Not built | Requires host integration |
| Real agent orchestration jobs | Not built | Require service runtime and evaluation |
| Real online multiplayer ranking | Not built | Requires server-owner records, identity and anti-cheat |

## Critical next engineering milestones

1. Move v6 missions and research-credit spending into D1 owner-scoped server APIs. Do not trust localStorage for prizes.
2. Benchmark every specialist net of costs on a frozen, held-out set across scenario regimes. Reject research if it doesn't add value and avoid artificially forcing trades.
3. Add structured asynchronous agent job orchestration with receipts, evidence, override logs, budget caps and timeouts. Numerical risk and execution must stay deterministic.
4. Connect signed-in KULT Agent ID and one shared verified Agent Passport. Replay locally earned practice achievements only as unranked/cosmetic records.
5. Introduce secure online seasons only after randomized hidden-outcome commitments, audits, anti-Sybil measures and independent player tests.

## Safety and representation

This is a fictional strategy game. It is not an investment adviser, exchange, real-money trading system or verified market-data provider. Agents in the demo are rule-based characters; no AI model calls occur. The live hosting URL supplied by the user has not been modified or redeployed by this ZIP.
