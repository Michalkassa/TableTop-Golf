# Simulations

Reinforcement-learning balance tests for Tabletop Golf on a fixed 18-hole course. They use the real rules engine (`../prototype/engine.js`) and the same economy as the web game (coins, coin tokens, the 6-card pro shop, jokers and tickets).

```
node simulations/run.js          # full run, all CPU cores (a few minutes)
node simulations/run.js --quick  # small smoke run (seconds)
```

Outputs:
- `REPORT.md`: the balancing report (tables, charts, notes). It is regenerated on every run.
- `results/results.json`: raw aggregated numbers.
- `results/run.log`: console log of the last full run.

What runs:
1. **Q-learning shot agent.** Learns club, Driver power, aim and SAFE/RISKY putting from millions of holes. Workers train in parallel and their Q-tables are merged each round.
2. **Evolved shopper.** A cross-entropy-method search for the best pro-shop buying weights, scored on full 18-hole games.
3. **Tournament.** Thousands of 4-player tables mixing 8 hand-written shop archetypes and the evolved shopper, plus head-to-head games against the game's CPU shopping and a benchmark of the engine's expert planning bot.
4. **Joker A/B tests and a tier table.** Each joker is tested with identical dice, with and without it. Each tier is tested with the whole bag at that tier.

Files: `lib.js` (course, game loop, agent, strategies), `run.js` (orchestration and workers), `report.js` (writes REPORT.md).
