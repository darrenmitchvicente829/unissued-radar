/* Unissued: the model. One file, run twice: main.ts runs it to write board.json, the page runs it
   again on the same snapshot rows and shows what it gets. Nothing here names a protocol: every number
   is fitted on the snapshot (TVL, 7-day change, listing date, category, chains, market cap). */
(function (root) {
'use strict';
const OUT = { Bridge: 'bridge', 'Canonical Bridge': 'bridge', 'Liquid Staking': 'staking', 'Liquid Restaking': 'staking', 'Restaked BTC': 'staking', CEX: 'exchange' };
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/, WRAPPED = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;
const DAY = 864e5, YEAR = 365.25;
/* The scenario a reader can change on the page: dollars deposited, the share of the token dropped to
   farmers, weeks held (of a 26-week points season), and the odds horizon in years. */
const DEFAULTS = { deposit: 10000, share: 0.07, weeks: 26, horizon: 2, season: 26, tbill: 0.04, wage: 25 };

/* ---------- 1. every snapshot protocol goes in exactly one group ---------- */
const kindOf = function (p) { return OUT[p.cat] || (VERSIONED.test(p.name) ? 'versioned' : WRAPPED.test(p.name) ? 'wrapped' : EXCHANGE.test(p.name) ? 'exchange' : ''); };
function groupOf(p) {
  const kind = kindOf(p);   // a bridge, a staking wrapper, an exchange or a versioned copy is nobody's future token
  if (p.token) return !kind && p.cap > 0 ? 'comp' : 'token';   // comp: its token trades at a recorded cap
  return kind || 'pre';                                        // pre: records no token, not a product of one
}
function prepare(data) {
  const asOf = Date.parse(data.as_of), watch = new Set(data.watchlist);
  const rows = data.rows.map(function (r) {
    const p = { slug: r[0], name: r[1], cat: r[2] || 'Uncategorised', chains: r[3], tvl: r[4], chg: (r[5] || 0) / 100, cap: r[6] || 0,
      listed: r[7], token: !!r[8], watch: watch.has(r[0]) };
    p.age = p.listed ? (asOf - Date.parse(p.listed)) / DAY / YEAR : null;
    p.group = groupOf(p);
    p.tier = p.group !== 'pre' ? '' : p.watch ? 'watchlist' : p.tvl >= data.floor_usd ? 'offlist' : 'early';
    return p;
  });
  const oldest = Math.max.apply(null, rows.map(function (p) { return p.age || 0; }));
  rows.forEach(function (p) { p.undated = p.age === null ? 1 : 0; p.ageF = p.age === null ? oldest : p.age; });
  return rows;   // a protocol with no listing date predates DefiLlama's dates: it sits with the oldest cohort
}

/* ---------- 2. small numerics ---------- */
function solve(A, b) {
  const n = b.length, M = A.map(function (r, i) { return r.concat(b[i]); });
  for (let c = 0; c < n; c++) {
    let best = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[best][c])) best = r;
    const t = M[c]; M[c] = M[best]; M[best] = t;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map(function (r, i) { return r[n] / r[i]; });
}
function normal(X, y, w, lam) {   // weighted least squares with a ridge on every term but the intercept
  const k = X[0].length, A = [], b = [];
  for (let i = 0; i < k; i++) { A.push(new Array(k).fill(0)); b.push(0); A[i][i] = i ? lam : 0; }
  X.forEach(function (x, r) { const wr = w ? w[r] : 1; for (let i = 0; i < k; i++) { b[i] += wr * x[i] * y[r]; for (let j = 0; j < k; j++) A[i][j] += wr * x[i] * x[j]; } });
  return solve(A, b);
}
const dot = function (x, b) { let s = 0; for (let i = 0; i < b.length; i++) s += x[i] * b[i]; return s; };
function quantile(a, q) { const s = a.slice().sort(function (x, y) { return x - y; }), i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); }
const sigmoid = function (z) { return 1 / (1 + Math.exp(-z)); };

/* ---------- 3. value if a token launches: ln(cap) of the 'comp' rows on their own snapshot fields ---------- */
const VALUE_TERMS = {
  size: { label: 'size curve, ln TVL', f: function (p) { return Math.log(p.tvl / 1e8); } },
  growth: { label: '7-day TVL change', f: function (p) { return p.chg; } },
  age: { label: 'years listed, ln', f: function (p) { return Math.log(1 + p.ageF); } },
  chains: { label: 'chain count, ln', f: function (p) { return Math.log(Math.max(1, p.chains.length)); } },
};
const CAT_RIDGE = 8;   // a category's effect is its mean residual, shrunk by 8 pseudo-rows toward none
function fitValue(train, keys) {   // keys: [] is the flat median multiple; 'cat' adds the shrunk category effect
  const terms = keys.filter(function (k) { return k !== 'cat'; }), m = { keys: keys, cat: {} };
  const x = function (p) { return [1].concat(terms.map(function (k) { return VALUE_TERMS[k].f(p); })); };
  if (terms.length) m.b = normal(train.map(x), train.map(function (p) { return Math.log(p.cap); }), null, 1e-6);
  else m.flat = quantile(train.map(function (p) { return Math.log(p.cap / p.tvl); }), 0.5);
  m.base = function (p) { return terms.length ? dot(x(p), m.b) : Math.log(p.tvl) + m.flat; };
  if (keys.indexOf('cat') >= 0) {
    const sum = {}, n = {};
    train.forEach(function (p) { sum[p.cat] = (sum[p.cat] || 0) + Math.log(p.cap) - m.base(p); n[p.cat] = (n[p.cat] || 0) + 1; });
    Object.keys(sum).forEach(function (c) { m.cat[c] = sum[c] / (n[c] + CAT_RIDGE); });
  }
  m.ln = function (p) { return m.base(p) + (m.cat[p.cat] || 0); };
  return m;
}
const byAge = function (a, b) { return b.ageF - a.ageF || (a.slug < b.slug ? -1 : 1); };   // oldest first
/* Two blind tests. leftOut: each row priced by a fit that never saw it. walkForward: each of the newest
   40% priced by a fit on the rows listed before it. The score is the typical miss as a multiple. */
function valueMiss(comps, keys) {
  const err = function (m, p) { return Math.log(p.cap) - m.ln(p); };
  const loo = comps.map(function (p, i) { return err(fitValue(comps.filter(function (_, j) { return j !== i; }), keys), p); });
  const s = comps.slice().sort(byAge), wf = [];
  for (let i = Math.floor(s.length * 0.6); i < s.length; i++) wf.push(err(fitValue(s.slice(0, i), keys), s[i]));
  return { leftOut: Math.exp(quantile(loo.map(Math.abs), 0.5)), walkForward: Math.exp(quantile(wf.map(Math.abs), 0.5)), resid: loo };
}
/* Add one term at a time; a term stays only if the miss falls in both blind tests. */
function ladder(candidates, start, score, a, b) {
  let keys = start.slice(), best = score(keys);
  const steps = [{ key: 'baseline', keys: keys, score: best, kept: true }];
  candidates.forEach(function (k) {
    const s = score(keys.concat(k)), kept = s[a] < best[a] && s[b] < best[b];
    steps.push({ key: k, score: s, kept: kept });
    if (kept) { keys = keys.concat(k); best = s; }
  });
  return { keys: keys, steps: steps, best: best };
}

/* ---------- 4. token odds: which protocols of the eligible pool record a token, by a logistic fit ---------- */
const ODDS_TERMS = {
  age: { label: 'years listed, ln', f: function (p, age) { return Math.log(1 + age); } },
  undated: { label: 'no listing date', f: function (p) { return p.undated; } },
  cat: { label: 'category token share, shrunk', f: function (p, age, m) { return m.share(p); } },
  size: { label: 'size, ln TVL', f: function (p) { return Math.log(p.tvl / 1e8); } },
  growth: { label: '7-day TVL change', f: function (p) { return p.chg; } },
  chains: { label: 'chain count, ln', f: function (p) { return Math.log(Math.max(1, p.chains.length)); } },
};
function fitOdds(train, keys) {
  const m = { keys: keys }, tok = {}, n = {}, base = train.filter(function (p) { return p.token; }).length / train.length;
  train.forEach(function (p) { n[p.cat] = (n[p.cat] || 0) + 1; tok[p.cat] = (tok[p.cat] || 0) + (p.token ? 1 : 0); });
  const seen = new Set(train);
  m.share = function (p) {   // the category's token share without the row itself, 8 pseudo-rows at the base rate
    const self = seen.has(p) ? 1 : 0, s = (CAT_RIDGE * base + (tok[p.cat] || 0) - (self && p.token ? 1 : 0)) / (CAT_RIDGE + (n[p.cat] || 0) - self);
    return Math.log(s / (1 - s));
  };
  const x = function (p, age) { return [1].concat(keys.map(function (k) { return ODDS_TERMS[k].f(p, age === undefined ? p.ageF : age, m); })); };
  const X = train.map(function (p) { return x(p); }), y = train.map(function (p) { return p.token ? 1 : 0; });
  let b = new Array(keys.length + 1).fill(0);
  for (let it = 0; it < 30; it++) {   // iteratively reweighted least squares, ridge 0.01
    const pr = X.map(function (r) { return sigmoid(dot(r, b)); }), w = pr.map(function (q) { return Math.max(1e-6, q * (1 - q)); });
    b = normal(X, X.map(function (r, i) { return dot(r, b) + (y[i] - pr[i]) / w[i]; }), w, 0.01);
  }
  m.b = b;
  m.p = function (p, age) { return sigmoid(dot(x(p, age), b)); };
  return m;
}
function oddsMiss(pool, keys) {   // Brier score, lower is better: ten folds, and newest 40% from the oldest 60%
  const s = pool.slice().sort(byAge), brier = function (m, rows) { let e = 0; rows.forEach(function (p) { e += Math.pow((p.token ? 1 : 0) - m.p(p), 2); }); return e / rows.length; };
  let folds = 0;
  for (let f = 0; f < 10; f++) folds += brier(fitOdds(s.filter(function (_, i) { return i % 10 !== f; }), keys), s.filter(function (_, i) { return i % 10 === f; })) / 10;
  const cut = Math.floor(s.length * 0.6);
  return { tenFold: folds, walkForward: brier(fitOdds(s.slice(0, cut), keys), s.slice(cut)) };
}

/* ---------- 5. fit everything, then price one protocol ---------- */
function fit(rows) {
  const comps = rows.filter(function (p) { return p.group === 'comp'; });
  const pool = rows.filter(function (p) { return p.group === 'comp' || p.group === 'pre' || (p.group === 'token' && !kindOf(p)); });
  const v = ladder(['size', 'cat', 'growth', 'age', 'chains'], [], function (k) { return valueMiss(comps, k); }, 'leftOut', 'walkForward');
  const o = ladder(['age', 'undated', 'cat', 'size', 'growth', 'chains'], [], function (k) { return oddsMiss(pool, k); }, 'tenFold', 'walkForward');
  const M = { comps: comps, pool: pool, valueSteps: v.steps, oddsSteps: o.steps, value: fitValue(comps, v.keys), odds: fitOdds(pool, o.keys) };
  const r = v.best.resid;   // each comp's held-out error, ln(real cap / model)
  M.band = [0.1, 0.25, 0.75, 0.9].map(function (q) { return Math.exp(quantile(r, q)); });   // held-out cap / model
  M.inside = [r.filter(function (e) { return e >= Math.log(M.band[1]) && e <= Math.log(M.band[2]); }).length / r.length, r.filter(function (e) { return Math.abs(e) <= Math.log(3); }).length / r.length];
  return M;
}
/* impliedValue = launch value x token odds. launch: the comps' fitted curve at this row's own fields.
   odds: of peers like it that record no token at its age, the share that record one within `horizon`
   more years: (P(age + h) - P(age)) / (1 - P(age)). A cross-section of peers, not a forecast. */
function impliedValue(p, M, horizon) {
  const launch = Math.exp(M.value.ln(p)), now = M.odds.p(p), later = M.odds.p(p, p.ageF + horizon);
  const odds = Math.min(0.99, Math.max(0.01, (later - now) / (1 - now)));
  return { launch: launch, now: now, later: later, odds: odds, value: launch * odds, lo: launch * odds * M.band[1], hi: launch * odds * M.band[2] };
}

/* ---------- 6. the farm plan: steps with a cost and a time each, then the verdict ---------- */
const FEES = { Ethereum: 2.5, Bitcoin: 1.5, Tron: 1.2, Cardano: 0.2, Binance: 0.08, Arbitrum: 0.05, Avalanche: 0.05, Linea: 0.05, TON: 0.05, Scroll: 0.04, Base: 0.03, Optimism: 0.03, Starknet: 0.03, Mantle: 0.02, Berachain: 0.02, Unichain: 0.02, Ink: 0.02, Polygon: 0.01, Monad: 0.01, Plasma: 0.01, Sonic: 0.01, Sui: 0.01, 'Hyperliquid L1': 0.01, Near: 0.01, Solana: 0.005, Aptos: 0.005, Stellar: 0.001, Ripple: 0.001 };
const ARCHETYPE = { 'Risk Curators': 'vault', 'Onchain Capital Allocator': 'vault', Yield: 'vault', 'Yield Aggregator': 'vault', 'Liquidity Manager': 'vault', 'Basis Trading': 'vault', Farm: 'vault', Indexes: 'vault',
  Lending: 'lend', CDP: 'lend', 'Leveraged Farming': 'lend', 'Uncollateralized Lending': 'lend', Dexs: 'dex', Derivatives: 'perp', Options: 'perp', 'Prediction Market': 'perp', RWA: 'rwa', Chain: 'stake', 'Staking Pool': 'stake', Restaking: 'stake' };
const CORE = {   // [main action, second action, what to watch]
  vault: ['Deposit {D} into its largest curated vault on {chain}: approve, then deposit; test with $100 first', 'Hold the vault receipt token in the wallet and do not loop it: points schemes pay on held balance per week', 'the vault curator pauses withdrawals or the share price drops'],
  lend: ['Supply {D} of the stablecoin with the deepest market on {chain}: approve, then supply', 'Borrow 20% of the supplied value and keep the health factor above 2.0: borrowers are counted apart from suppliers', 'the health factor falls under 1.6 or utilisation passes 95%'],
  dex: ['Add {D} as liquidity to its deepest stable pair on {chain}: approve both tokens, then add', 'Swap $500 through its own router each week: volume is counted apart from liquidity', 'the pool drifts out of range or loses its peg'],
  perp: ['Deposit {D} of margin on {chain} and open one hedged 1x position: approve, deposit, open', 'Trade $2,000 of volume each week at 1x and close flat: traders are counted by volume, makers by depth', 'funding turns against the position for 3 days running'],
  rwa: ['Pass its identity check, then subscribe {D} to the tokenised asset on {chain}: approve, then mint', 'Hold the asset token and do not lend it out: it earns its yield only while it sits in the checked wallet', 'the price leaves net asset value by 0.5% or redemptions queue'],
  stake: ['Delegate or stake {D} with it on {chain}: approve, then stake; note the unbonding time first', 'Vote or claim once a month from the same wallet: activity is counted apart from balance', 'the unbonding queue grows past 14 days'],
  use: ['Put {D} through its main product on {chain}: approve, then deposit; test with $100 first', 'Use its second feature once so the wallet shows more than a single deposit', 'the team pauses the product or announces a snapshot'],
};
const usd = function (v) { const a = Math.abs(v), s = a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e5 ? (a / 1e3).toFixed(0) + 'K' : a >= 1e3 ? String(Math.round(a)).replace(/\B(?=(\d{3})+$)/g, ',') : a >= 100 ? a.toFixed(0) : a.toFixed(2); return (v < 0 ? '-$' : '$') + s; };
function farmPlan(p, iv, sc) {
  const chain = p.chains.slice().sort(function (a, b) { return (FEES[a] === undefined ? 0.05 : FEES[a]) - (FEES[b] === undefined ? 0.05 : FEES[b]) || (a < b ? -1 : 1); })[0] || 'its own chain';
  const fee = FEES[chain] === undefined ? 0.05 : FEES[chain], kind = ARCHETYPE[p.cat] || 'use', core = CORE[kind], D = usd(sc.deposit), w = sc.weeks;
  const txt = function (s) { return s.replace('{D}', D).replace('{chain}', chain); };
  const floorTvl = p.tvl * 0.7, trade = kind === 'perp' ? 2000 * w * 0.0005 : kind === 'dex' ? 500 * w * 0.0005 : 0;
  const steps = [
    ['Wallet', 'Make a fresh wallet used only for ' + p.name + ' and withdraw gas for ' + chain + ' to it from an exchange', 1, 10],
    ['Verify', 'Open ' + p.name + ' from its DefiLlama page (slug ' + p.slug + '), check the contract addresses against its docs, bookmark the app', 0, 10],
    ['Fund', 'Withdraw ' + D + ' of stablecoin straight to ' + chain + ' from an exchange that supports it, or bridge once from Ethereum', 1 + fee, 15],
    ['Enter', txt(core[0]) + '. That is ' + (sc.deposit / (p.tvl + sc.deposit) * 100).toFixed(4) + '% of its ' + usd(p.tvl) + ' TVL', 2 * fee, 15],
    ['Deepen', txt(core[1]), 2 * fee + trade, 10 + (trade ? 10 * w : 0)],
    ['Weekly', 'Once a week for ' + w + ' weeks, touch the position (top up, claim or vote) and log its TVL: ' + (p.age === null ? 'no listing date is recorded' : 'listed ' + (p.age * 12).toFixed(0) + ' months') + ' with no token on record', w * fee, 5 * w],
    ['Exit', 'Leave early if TVL prints under ' + usd(floorTvl) + ' (30% below today), if ' + core[2] + ', or once a token is on record: claim only from a link ' + p.name + ' itself publishes', 2 * fee + 1, 15],
    ['Ledger', 'Keep date, hash, amount and dollar value of every transaction: a claim may ask for the history, and a drop is income on the day it lands', 0, 15],
  ].map(function (s) { return { tag: s[0], text: s[1], cost: s[2], min: s[3] }; });
  const gas = steps.reduce(function (a, s) { return a + s.cost; }, 0), hours = steps.reduce(function (a, s) { return a + s.min; }, 0) / 60;
  /* The drop: implied value x the share dropped x this deposit's share of TVL x the part of the season held.
     FARM beats both benchmarks (the same dollars in a 4% T-bill, and $25 an hour); MARGINAL only clears its
     fees; SKIP does not. Yield earned in the venue meanwhile is not in the snapshot and is left out. */
  const tbill = sc.deposit * sc.tbill * w / 52, perDollar = sc.share * Math.min(1, w / sc.season) / (p.tvl + sc.deposit);
  const drop = iv.value * perDollar * sc.deposit, net = drop - gas, perHour = net / hours;
  return { chain: chain, kind: kind, steps: steps, gas: gas, hours: hours, tbill: tbill, drop: drop, net: net, perHour: perHour,
    verdict: net >= tbill && perHour >= sc.wage ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP', breakEven: gas / (drop / sc.share) };
}
const stepLine = function (s) { return s.tag + ': ' + s.text + '. Cost ' + (s.cost ? usd(s.cost) : 'nothing') + ', ' + s.min + ' min.'; };

/* ---------- 7. the board: every pre-token row priced, ranked by implied value ---------- */
function board(rows, M, sc) {
  const out = rows.filter(function (p) { return p.group === 'pre'; }).map(function (p) {
    const iv = impliedValue(p, M, sc.horizon);
    return { p: p, iv: iv, usd: Math.max(1, Math.round(iv.value)), farm: farmPlan(p, iv, sc) };
  });
  out.sort(function (a, b) { return b.usd - a.usd || (a.p.slug < b.p.slug ? -1 : 1); });
  out.forEach(function (r, i) { r.rank = i + 1; });
  return out;
}
const boardRows = function (b) { return b.map(function (r) { return { slug: r.p.slug, name: r.p.name, rank: r.rank, implied_value_usd: r.usd, farm_steps: r.farm.steps.map(stepLine) }; }); };
function checksum(rows) {   // FNV-1a over what board.json states, so the page can prove it recomputed the same board
  let h = 2166136261; const s = rows.map(function (r) { return r.slug + r.rank + r.implied_value_usd + r.farm_steps.join(''); }).join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
const Radar = { DEFAULTS: DEFAULTS, VALUE_TERMS: VALUE_TERMS, ODDS_TERMS: ODDS_TERMS, FEES: FEES, prepare: prepare, groupOf: groupOf, fit: fit, fitValue: fitValue,
  impliedValue: impliedValue, farmPlan: farmPlan, board: board, boardRows: boardRows, checksum: checksum, stepLine: stepLine, usd: usd, quantile: quantile };
if (typeof module === 'object' && module.exports) module.exports = Radar; else root.Radar = Radar;
})(typeof globalThis === 'object' ? globalThis : this);
