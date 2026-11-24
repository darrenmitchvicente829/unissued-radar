# Unissued

A radar for tokens that do not exist yet: an entry for make.fun's
[Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty.

[![make.fun bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/darrenmitchvicente829/unissued-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/darrenmitchvicente829/unissued-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

It reads the sealed DefiLlama snapshot, finds the protocols that record no token and are not a
wrapped, staked or bridged product of one, and ranks them by an implied value:

    implied value = launch value x token odds

- **Launch value** is a size curve, ln(market cap) on ln(TVL), fitted on the snapshot's traded tokens.
- **Token odds** come from a logistic fit of which eligible protocols record a token, on years listed,
  category, size and 7-day TVL change: of peers like it with no token at its age, the share that record
  one within the horizon.
- Every candidate term is tested blind twice (left out, and walk-forward by listing date) and kept only
  when both tests improve. Nothing in the model names a protocol.
- Each row carries a farm plan of eight steps with a cost and a time each, and a verdict (farm,
  marginal, skip) against two benchmarks: a 4% T-bill on the same dollars, and $25 an hour.

## Run it

Node 22.18 or later, standard library only:

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json

Then open `out/dashboard/index.html`. The page fits the same `dashboard/model.js` in the browser on the
same rows and shows a checksum proving its board is the `board.json` that `main.ts` wrote.

## Layout

- `main.ts`: reads the snapshot, runs the model, checks the gate's shape, writes `/output`.
- `dashboard/model.js`: grouping, both fits, the blind tests, the implied value and the farm plan.
- `dashboard/ui.js`, `style.css`, `index.html`: the board, the evidence, the detail view, filters.
- `vendor/makefun-board.ts`: make.fun's dossier library, unchanged.

Implied value is a model estimate, not a price and not advice.

Built for [make.fun](https://make.fun/bounty/token-radar-01). MIT licensed.
