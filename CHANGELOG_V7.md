# V7 Change Log — From local v6 Arena to server-sealed practice

| V6 end-to-end problem | V7 implemented improvement | Remaining limitation |
|---|---|---|
| Six mission future outcomes inspectable in browser source | Six newly generated scenario snapshots are private to D1 until settlement; client only receives 48 pre-cutoff bars plus SHA-256 commitment | Operator can control its own DB; not externally audited |
| Fixed episodes are learnable and easy to beat with hindsight | Fresh, randomized episode per owner/UTC week, with symmetric directional model and non-deterministic outcomes | Not identical scenarios across players; do not prize-rank |
| Full council was net negative in prior benchmark | Council prioritizes usable pre-cutoff flow evidence with risk veto; all-four average improved to positive in a 1,800-case fictional test | Selective Flow Reader still outperforms expensive full team; gameplay tuning needed |
| Risk-veto mission forced paid research | HOLD at 0% is free; never requires research; Risk Steward always computed server-side | Risk/no-trade gameplay needs richer positive learning feedback |
| Local-only XP, budgets and Passport | Private Arena stores credits, specialist reports, council and outcomes in owner-scoped D1 and exports a practice Passport | No production KULT ID, ranked multiplayer, or portable proof |
| Replays allow repeated rewards | One session per owner, episode and UTC week; one settled result; research deduplication and atomic debit | Guest identity can be reset and is never eligible for ranked rewards |
| UI looked like a dashboard | New mission-first, responsive Agency Arena with illustrated operations floor, report cards, Risk Steward, result analysis and career history | Needs live-browser staging visual QA |

No live trades, wallets, token issuance, agent model API calls or actual public contests were added.
