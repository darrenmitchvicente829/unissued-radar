/* Unissued: the page. It fits model.js on the snapshot rows in this browser, then draws the board,
   the evidence for the model, and a detail view per protocol. No number on screen is typed in here. */
(function () {
'use strict';
const D = window.RADAR_DATA, R = window.Radar, app = document.getElementById('app');
if (!D || !R) return;
const rows = R.prepare(D), M = R.fit(rows), usd = R.usd;
const S = { sc: Object.assign({}, R.DEFAULTS), tier: 'all', verdict: 'all', cat: '', chain: '', q: '', sort: 'rank', dir: 1 };
let B = R.board(rows, M, S.sc);

const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
const pct = function (v, d) { return (v * 100).toFixed(d || 0) + '%'; };
const times = function (v) { return '×' + (v < 0.1 ? v.toPrecision(1) : v.toFixed(2)); };
const signed = function (v) { return (v >= 0 ? '+' : '−') + usd(Math.abs(v)); };
const ageOf = function (p) { return p.age === null ? 'undated' : p.age < 1 ? Math.round(p.age * 365.25) + ' d' : p.age.toFixed(1) + ' yr'; };
const chg = function (p) { return '<span class="' + (p.chg >= 0 ? 'up' : 'down') + '">' + (p.chg >= 0 ? '+' : '−') + Math.abs(p.chg * 100).toFixed(1) + '%</span>'; };
const TIERS = { watchlist: 'Watchlist', offlist: 'Off-list', early: 'Early' };
const count = function (list, f) { return list.filter(f).length; };

/* ---------- the model, stated with the coefficients this browser just fitted ---------- */
function formula() {
  const v = M.value, at100 = Math.exp(v.b[0]), k = M.odds.keys.map(function (t) { return R.ODDS_TERMS[t].label; }).join(', ');
  return '<p class="formula"><b>Implied value = launch value × token odds.</b> Launch value = ' + usd(at100) + ' × (TVL ÷ $100M)<sup>' + v.b[1].toFixed(2) + '</sup>, the curve of ' + M.comps.length +
    ' traded tokens\' market caps on their TVL. Token odds = of peers like it with no token at its age, the share that record one within <b>' + S.sc.horizon + ' yr</b>, from a logistic fit of ' + M.pool.length + ' peers on ' + esc(k) + '.</p>';
}
function kpis() {
  const vs = M.valueSteps, os = M.oddsSteps, lastV = vs.filter(function (s) { return s.kept; }).pop(), lastO = os.filter(function (s) { return s.kept; }).pop();
  const card = function (label, big, text) { return '<div class="card kpi"><small>' + label + '</small><b>' + big + '</b><span>' + text + '</span></div>'; };
  return '<section class="kpis" id="kpis">' +
    card('Watchlist ranked', count(B, function (r) { return r.p.watch; }) + ' / ' + D.watchlist.length, 'plus ' + count(B, function (r) { return !r.p.watch; }) + ' pre-token protocols the list leaves out') +
    card('Value miss, walk-forward', times(lastV.score.walkForward), 'against ' + times(vs[0].score.walkForward) + ' for a flat cap/TVL multiple') +
    card('Token odds, Brier', lastO.score.tenFold.toFixed(3), 'against ' + os[0].score.tenFold.toFixed(3) + ' for the base rate, ten folds') +
    card('Worth farming', count(B, function (r) { return r.farm.verdict === 'FARM'; }) + ' of ' + B.length, 'beat a T-bill and $' + S.sc.wage + '/h; ' + count(B, function (r) { return r.farm.verdict === 'SKIP'; }) + ' do not cover fees') +
    card('Board, implied', usd(B.reduce(function (a, r) { return a + r.usd; }, 0)), 'over ' + usd(B.reduce(function (a, r) { return a + r.p.tvl; }, 0)) + ' of TVL with no token') + '</section>';
}

/* ---------- where each of the snapshot's protocols went ---------- */
function accounting() {
  const parts = [['Ranked · watchlist', '#4a3fb5', function (p) { return p.tier === 'watchlist'; }], ['Ranked · off-list, above the floor', '#a85a08', function (p) { return p.tier === 'offlist'; }],
    ['Ranked · early, below the floor', '#0d6e63', function (p) { return p.tier === 'early'; }], ['Token trades · priced comp', '#1c2333', function (p) { return p.group === 'comp'; }],
    ['Token recorded · no usable cap', '#7b8194', function (p) { return p.group === 'token'; }], ['Out · bridge', '#c9bfa6', function (p) { return p.group === 'bridge'; }],
    ['Out · staking wrapper', '#d9d0bb', function (p) { return p.group === 'staking'; }], ['Out · exchange', '#b9ae93', function (p) { return p.group === 'exchange'; }],
    ['Out · versioned or wrapped', '#e6dfcd', function (p) { return p.group === 'versioned' || p.group === 'wrapped'; }]].map(function (g) { return { label: g[0], color: g[1], n: count(rows, g[2]) }; });
  return '<div class="card"><h2>Protocol accounting · all ' + rows.length + ' snapshot protocols, each in one group</h2><div class="bar">' +
    parts.map(function (g) { return '<i style="width:' + (g.n / rows.length * 100) + '%;background:' + g.color + '" title="' + g.label + '"></i>'; }).join('') + '</div><div class="legend">' +
    parts.map(function (g) { return '<span><i style="background:' + g.color + '"></i>' + g.label + ' <b>' + g.n + '</b></span>'; }).join('') + '</div>' + integrity() + '</div>';
}
/* The board this page computes at the default scenario must be the board.json main.ts wrote. */
function integrity() {
  const base = R.boardRows(R.board(rows, M, R.DEFAULTS)), slugs = new Set(base.map(function (r) { return r.slug; })), total = base.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
  const groups = {}; rows.forEach(function (p) { groups[p.group] = 1; });
  const checks = [[R.checksum(base) === D.board.checksum, 'recomputed here = board.json · checksum ' + D.board.checksum], [base.length === D.board.rows, base.length + ' of ' + D.board.rows + ' rows'],
    [total === D.board.total, 'totals equal ' + usd(total)], [base.every(function (r, i) { return r.rank === i + 1 && (!i || r.implied_value_usd <= base[i - 1].implied_value_usd); }), 'ranks 1–' + base.length + ', value never rises'],
    [D.watchlist.every(function (s) { return slugs.has(s); }), 'watchlist ' + D.watchlist.length + ' of ' + D.watchlist.length + ' ranked'],
    [base.every(function (r) { return r.farm_steps.length >= 3; }), 'a costed farm plan on every row']];
  return '<div class="checks">' + checks.map(function (c) { return '<span class="check' + (c[0] ? '' : ' bad') + '">' + (c[0] ? '✓ ' : '✗ ') + c[1] + '</span>'; }).join('') + '</div>';
}

/* ---------- the evidence: every term tried, its two blind scores, kept or not ---------- */
function ladderTable(steps, terms, a, b, heads, fmt, baseline) {
  return '<table class="mini"><tr><th>Term, added in order</th><th class="n">' + heads[0] + '</th><th class="n">' + heads[1] + '</th><th></th></tr>' + steps.map(function (s, i) {
    return '<tr class="' + (s.kept ? '' : 'dropped') + '"><td>' + (i ? '+ ' + terms[s.key].label : baseline) + '</td><td class="n">' + fmt(s.score[a]) + '</td><td class="n">' + fmt(s.score[b]) + '</td><td class="' + (s.kept && i ? 'kept' : '') + '">' + (!i ? 'baseline' : s.kept ? 'kept' : 'not kept') + '</td></tr>';
  }).join('') + '</table>';
}
function cohorts() {   // the raw record behind the odds: how many peers record a token, by years listed
  return [[0, 1], [1, 2], [2, 3], [3, 99]].map(function (c) {
    const g = M.pool.filter(function (p) { return p.age !== null && p.age >= c[0] && p.age < c[1]; });
    return '<tr><td>' + (c[1] > 9 ? '3 yr or more' : c[0] + ' to ' + c[1] + ' yr') + '</td><td class="n">' + g.length + '</td><td class="n">' + pct(count(g, function (p) { return p.token; }) / g.length) + '</td></tr>';
  }).join('');
}
function evidence() {
  const cat = Object.assign({ cat: { label: 'category effect, shrunk' } }, R.VALUE_TERMS), ob = M.odds.b;
  return '<div class="card" style="margin-top:10px"><h2>Out-of-sample evidence · a term is kept only when both blind tests improve</h2><div class="three"><div><b>Launch value</b> · typical miss as a multiple, ' + M.comps.length + ' traded tokens' +
    ladderTable(M.valueSteps, cat, 'leftOut', 'walkForward', ['Left out', 'Walk-forward'], times, 'flat median cap/TVL') + '<p class="note">Held-out caps land within ×3 of the curve ' + pct(M.inside[1]) + ' of the time; half fall between ' + times(M.band[1]) + ' and ' + times(M.band[2]) + ' of it, and that is the range each row prints.</p></div>' +
    '<div><b>Token odds</b> · Brier score, ' + M.pool.length + ' eligible peers' + ladderTable(M.oddsSteps, R.ODDS_TERMS, 'tenFold', 'walkForward', ['Ten-fold', 'Walk-forward'], function (v) { return v.toFixed(4); }, 'base rate of peers') +
    '<p class="note">Fitted logit: ' + M.odds.keys.map(function (k, i) { return (ob[i + 1] >= 0 ? '+' : '−') + Math.abs(ob[i + 1]).toFixed(2) + ' × ' + R.ODDS_TERMS[k].label; }).join(' ') + '.</p></div>' +
    '<div><b>The record behind the odds</b><table class="mini"><tr><th>Years listed</th><th class="n">Peers</th><th class="n">Record a token</th></tr>' + cohorts() + '</table><p class="note">7-day growth and age do not price a token better, so the launch value leaves them out; both help tell which peers record a token, so they enter through the odds. The odds are the peers\' record, not a forecast: the page never says a token will launch.</p></div></div></div>';
}

/* ---------- the board ---------- */
const COLS = [['rank', '#', 1], ['name', 'Protocol', 0], ['tvl', 'TVL', 1], ['chg', '7d', 1], ['age', 'No token', 1], ['odds', 'Token odds', 1], ['launch', 'If it launches', 1], ['value', 'Implied · P25–P75', 1], ['net', 'Verdict · net', 1], ['perHour', 'Net / h', 1], ['hours', 'Farm plan', 0]];
const KEY = { rank: function (r) { return r.rank; }, name: function (r) { return r.p.name.toLowerCase(); }, tvl: function (r) { return r.p.tvl; }, chg: function (r) { return r.p.chg; }, age: function (r) { return r.p.ageF; },
  odds: function (r) { return r.iv.odds; }, launch: function (r) { return r.iv.launch; }, value: function (r) { return r.iv.value; }, net: function (r) { return r.farm.net; }, perHour: function (r) { return r.farm.perHour; }, hours: function (r) { return r.farm.hours; } };
function applyFilters() {
  const q = S.q.trim().toLowerCase();
  const list = B.filter(function (r) {
    const p = r.p;
    return (S.tier === 'all' || p.tier === S.tier) && (S.verdict === 'all' || r.farm.verdict === S.verdict) && (!S.cat || p.cat === S.cat) && (!S.chain || p.chains.indexOf(S.chain) >= 0) &&
      (!q || (p.name + ' ' + p.cat + ' ' + p.chains.join(' ')).toLowerCase().indexOf(q) >= 0);
  });
  const k = KEY[S.sort];
  return list.sort(function (a, b) { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : a.rank - b.rank) * S.dir; });
}
function seg(key, options) {
  return '<span class="seg">' + options.map(function (o) { return '<button data-set="' + key + '" data-v="' + o[0] + '" class="' + (S[key] === o[0] ? 'on' : '') + '">' + o[1] + '<em>' + o[2] + '</em></button>'; }).join('') + '</span>';
}
function options(list, picked, all) {
  return '<option value="">' + all + '</option>' + list.map(function (v) { return '<option' + (v === picked ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
}
function controls() {
  const cats = Array.from(new Set(B.map(function (r) { return r.p.cat; }))).sort(), chains = Array.from(new Set([].concat.apply([], B.map(function (r) { return r.p.chains; })))).sort();
  const v = function (name) { return count(B, function (r) { return r.farm.verdict === name; }); }, t = function (name) { return count(B, function (r) { return r.p.tier === name; }); };
  const knob = function (key, label, min, max, step, show) { return '<label class="knob">' + label + '<input type="range" data-knob="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + S.sc[key] + '"><b>' + show + '</b></label>'; };
  return '<div class="controls">' + seg('verdict', [['all', 'All', B.length], ['FARM', 'Farm', v('FARM')], ['MARGINAL', 'Marginal', v('MARGINAL')], ['SKIP', 'Skip', v('SKIP')]]) +
    seg('tier', [['all', 'All tiers', B.length], ['watchlist', 'Watchlist', t('watchlist')], ['offlist', 'Off-list', t('offlist')], ['early', 'Early, under ' + usd(D.floor_usd), t('early')]]) +
    '<input type="search" id="q" placeholder="Search name, category, chain" value="' + esc(S.q) + '"><select data-pick="cat">' + options(cats, S.cat, 'All categories') + '</select><select data-pick="chain">' + options(chains, S.chain, 'All chains') + '</select></div>' +
    '<div class="controls"><label class="knob">Deposit<select data-knob="deposit">' + [1000, 5000, 10000, 50000].map(function (d) { return '<option value="' + d + '"' + (d === S.sc.deposit ? ' selected' : '') + '>' + usd(d) + '</option>'; }).join('') + '</select></label>' +
    knob('share', 'Drop share', 0.02, 0.15, 0.01, pct(S.sc.share)) + knob('weeks', 'Weeks held', 4, 26, 1, S.sc.weeks + ' wk') + knob('horizon', 'Odds horizon', 1, 4, 1, S.sc.horizon + ' yr') +
    '<button class="btn" data-act="reset">Reset</button><button class="btn" data-act="csv">CSV</button><span class="count" id="count"></span></div>';
}
function rowHtml(r) {
  const p = r.p, iv = r.iv, f = r.farm, top = B[0].iv.hi, pos = function (v) { return Math.min(100, Math.sqrt(v / top) * 100); };
  return '<tr class="row" data-go="' + esc(p.slug) + '"><td class="n">' + r.rank + '</td><td class="name"><b>' + esc(p.name) + '</b><span class="tag ' + p.tier + '">' + TIERS[p.tier] + '</span><small>' + esc(p.cat) + ' · ' + esc(p.chains[0] || 'no chain') + (p.chains.length > 1 ? ' +' + (p.chains.length - 1) : '') + '</small></td>' +
    '<td class="n">' + usd(p.tvl) + '</td><td class="n">' + chg(p) + '</td><td class="n">' + ageOf(p) + '</td><td class="n">' + pct(iv.odds) + '<span class="meter"><i style="width:' + iv.odds * 100 + '%"></i></span></td><td class="n">' + usd(iv.launch) + '</td>' +
    '<td class="n"><b>' + usd(iv.value) + '</b><span class="sub">' + usd(iv.lo) + ' – ' + usd(iv.hi) + '</span><div class="range"><i style="left:' + pos(iv.lo) + '%;width:' + (pos(iv.hi) - pos(iv.lo)) + '%"></i><u style="left:' + pos(iv.value) + '%"></u></div></td>' +
    '<td class="n"><span class="verdict ' + f.verdict + '">' + f.verdict + '</span> <b class="' + f.verdict + '">' + signed(f.net) + '</b><span class="sub">' + usd(f.drop) + ' drop − ' + usd(f.gas) + ' fees</span></td><td class="n ' + f.verdict + '">' + signed(f.perHour) + '</td>' +
    '<td>' + f.steps.length + ' steps · ' + f.hours.toFixed(1) + ' h<small class="sub">on ' + esc(f.chain) + '</small></td></tr>';
}
function drawTable() {
  const list = applyFilters();
  document.getElementById('rows').innerHTML = list.map(rowHtml).join('') || '<tr><td colspan="11" class="empty">No protocol matches these filters.</td></tr>';
  document.getElementById('count').textContent = list.length + ' of ' + B.length + ' rows · ' + usd(list.reduce(function (a, r) { return a + r.usd; }, 0)) + ' implied';
  document.getElementById('head').innerHTML = COLS.map(function (c) { return '<th data-sort="' + c[0] + '" class="' + (c[2] ? 'n' : '') + (S.sort === c[0] ? ' sorted' : '') + '">' + c[1] + (S.sort === c[0] ? (S.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('');
}
function masthead() {
  return '<header class="masthead"><div><h1>Unissued</h1><p>A radar for tokens that do not exist yet: ' + B.length + ' protocols that record no token, valued from their own record and costed to farm.</p></div><div class="meta">DefiLlama snapshot <b>' + esc(D.as_of) + '</b> · ' + rows.length + ' protocols<br>model fitted in this browser · no network<br><a class="btn" data-go="/ledger">' + count(rows, function (p) { return p.group !== 'pre'; }) + ' not ranked: token trades or set aside →</a></div></header>';
}
function renderBoard() {
  app.innerHTML = masthead() + kpis() + formula() + accounting() + evidence() + '<div id="controls">' + controls() + '</div><div class="card" style="padding:4px 6px"><table class="board"><thead><tr id="head"></tr></thead><tbody id="rows"></tbody></table></div>' +
    '<p class="foot">Implied value is this model\'s estimate, not a price and not advice. DefiLlama records no token for these protocols, which is not proof that none exists. Fees are planning estimates per chain; yield earned while farming is not in the snapshot and is left out.</p>';
  drawTable();
}
/* ---------- the protocols the board does not rank: tokens that already trade, and what the rule sets aside ---------- */
const WHY = { comp: 'Token trades: its cap prices the curve', token: 'Token on record, no usable cap', bridge: 'Bridge', staking: 'Staking wrapper', exchange: 'Exchange', versioned: 'Versioned copy', wrapped: 'Wrapped or staked product' };
function renderLedger() {
  const rest = rows.filter(function (p) { return p.group !== 'pre'; }).sort(function (a, b) { return b.tvl - a.tvl; });
  app.innerHTML = masthead() + '<p class="crumb"><a data-go="">← Board</a> / Not ranked: ' + rest.length + ' of ' + rows.length + ' protocols already record a token or are a product of one</p><div class="card"><table class="board"><tr><th>Protocol</th><th>Category</th><th class="n">TVL</th><th>Why it is not ranked</th><th class="n">Market cap</th><th class="n">Cap ÷ TVL</th><th class="n">Cap ÷ curve</th></tr>' +
    rest.map(function (p) { const c = p.group === 'comp'; return '<tr><td class="name"><b>' + esc(p.name) + '</b></td><td>' + esc(p.cat) + '</td><td class="n">' + usd(p.tvl) + '</td><td>' + WHY[p.group] + '</td><td class="n">' + (p.cap ? usd(p.cap) : '–') + '</td><td class="n">' + (c ? times(p.cap / p.tvl) : '–') + '</td><td class="n">' + (c ? times(p.cap / Math.exp(M.value.ln(p))) : '–') + '</td></tr>'; }).join('') + '</table></div>';
  window.scrollTo(0, 0);
}
function rescore(keepFocus) {
  B = R.board(rows, M, S.sc);
  if (!keepFocus) return route();
  document.getElementById('kpis').outerHTML = kpis();
  document.querySelector('.formula').outerHTML = formula();
  if (keepFocus !== 'drag') document.getElementById('controls').innerHTML = controls();   // a slider being dragged is left in place
  drawTable();
}
function exportCsv() {
  const lines = [['rank', 'slug', 'name', 'tier', 'category', 'tvl_usd', 'change_7d', 'years_listed', 'token_odds', 'launch_value_usd', 'implied_value_usd', 'verdict', 'net_usd', 'net_per_hour'].join(',')].concat(applyFilters().map(function (r) {
    return [r.rank, r.p.slug, '"' + r.p.name.replace(/"/g, '""') + '"', r.p.tier, '"' + r.p.cat + '"', r.p.tvl, r.p.chg, r.p.age === null ? '' : r.p.age.toFixed(2), r.iv.odds.toFixed(4), Math.round(r.iv.launch), r.usd, r.farm.verdict, r.farm.net.toFixed(2), r.farm.perHour.toFixed(2)].join(',');
  }));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = 'unissued-board.csv'; a.click();
}

/* ---------- one protocol ---------- */
function whatIf(p, patch) {   // reprice the same row with one field changed, then put it back
  const old = {}; Object.keys(patch).forEach(function (k) { old[k] = p[k]; p[k] = patch[k]; });
  const iv = R.impliedValue(p, M, S.sc.horizon); Object.assign(p, old); return iv;
}
function equationOf(r) {
  const p = r.p, iv = r.iv, v = M.value, o = M.odds, line = function (a, b, c, cls) { return '<tr class="' + (cls || '') + '"><td>' + a + '<small>' + b + '</small></td><td class="n">' + c + '</td></tr>'; };
  const logit = o.keys.map(function (k, i) { const x = R.ODDS_TERMS[k].f(p, p.ageF, o); return R.ODDS_TERMS[k].label + ' ' + (o.b[i + 1] * x >= 0 ? '+' : '−') + Math.abs(o.b[i + 1] * x).toFixed(2); }).join(', ');
  return '<table class="eq">' + line('TVL', 'DefiLlama, ' + esc(D.as_of) + '; 7-day change ' + (p.chg * 100).toFixed(1) + '%', usd(p.tvl)) +
    line('Size curve', usd(Math.exp(v.b[0])) + ' at $100M × (' + usd(p.tvl) + ' ÷ $100M)<sup>' + v.b[1].toFixed(2) + '</sup>: a token\'s cap grows slower than its TVL', times(iv.launch / p.tvl) + ' TVL') +
    line('= Launch value', 'if a token launches; half of held-out caps fall in ' + usd(iv.launch * M.band[1]) + ' – ' + usd(iv.launch * M.band[2]), usd(iv.launch), 'total') +
    line('Peers with a token at its age', 'logit ' + o.b[0].toFixed(2) + ' base; ' + logit, pct(iv.now)) +
    line('Peers with a token ' + S.sc.horizon + ' yr later', 'the same row, ' + (p.ageF + S.sc.horizon).toFixed(1) + ' years listed', pct(iv.later)) +
    line('Token odds', '(' + pct(iv.later) + ' − ' + pct(iv.now) + ') ÷ (100% − ' + pct(iv.now) + '): it has none yet, so only the peers still without one count', pct(iv.odds)) +
    line('= Implied value', 'launch value × token odds; P25–P75 ' + usd(iv.lo) + ' – ' + usd(iv.hi), usd(iv.value), 'total') + '</table>';
}
function sensitivity(r) {
  const p = r.p, cases = [['TVL 30% lower', { tvl: p.tvl * 0.7 }], ['TVL doubles', { tvl: p.tvl * 2 }], ['7-day change +20 points', { chg: p.chg + 0.2 }], ['One more year, still no token', { ageF: p.ageF + 1 }]];
  return '<table class="mini"><tr><th>What moves it</th><th class="n">Token odds</th><th class="n">Implied value</th><th class="n">Change</th></tr>' + cases.map(function (c) {
    const iv = whatIf(p, c[1]); return '<tr><td>' + c[0] + '</td><td class="n">' + pct(iv.odds) + '</td><td class="n">' + usd(iv.value) + '</td><td class="n">' + times(iv.value / r.iv.value) + '</td></tr>';
  }).join('') + '</table>';
}
function nearestPeers(r) {   // the traded tokens closest in size, same category first: what the curve was fitted on
  const p = r.p, d = function (c) { return Math.abs(Math.log(c.tvl / p.tvl)) + (c.cat === p.cat ? 0 : 1); };
  return '<table class="mini"><tr><th>Traded peer</th><th>Category</th><th class="n">TVL</th><th class="n">Market cap</th><th class="n">Cap ÷ TVL</th><th class="n">Cap ÷ curve</th></tr>' + M.comps.slice().sort(function (a, b) { return d(a) - d(b); }).slice(0, 6).map(function (c) {
    return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.cat) + '</td><td class="n">' + usd(c.tvl) + '</td><td class="n">' + usd(c.cap) + '</td><td class="n">' + times(c.cap / c.tvl) + '</td><td class="n">' + times(c.cap / Math.exp(M.value.ln(c))) + '</td></tr>';
  }).join('') + '</table>';
}
function netGrid(r) {
  const deposits = [1000, 5000, 10000, 50000], shares = [S.sc.share / 2, S.sc.share, S.sc.share * 2];
  return '<table class="grid"><tr><th>Drop share</th>' + deposits.map(function (d) { return '<th>' + usd(d) + '</th>'; }).join('') + '</tr>' + shares.map(function (s) {
    return '<tr><th>' + pct(s, 1) + '</th>' + deposits.map(function (d) {
      const f = R.farmPlan(r.p, r.iv, Object.assign({}, S.sc, { deposit: d, share: s }));
      return '<td class="' + f.verdict + (d === S.sc.deposit && s === S.sc.share ? ' here' : '') + '">' + signed(f.net) + '</td>';
    }).join('') + '</tr>';
  }).join('') + '</table>';
}
function renderDetail(r) {
  const p = r.p, iv = r.iv, f = r.farm, fact = function (a, b) { return '<div><small>' + a + '</small><b>' + b + '</b></div>'; };
  const why = f.verdict === 'FARM' ? 'beats both the T-bill and $' + S.sc.wage + ' an hour' : f.verdict === 'MARGINAL' ? 'clears its fees but not ' + (f.net < f.tbill ? 'the T-bill' : '$' + S.sc.wage + ' an hour') : 'the fees exceed the modelled drop';
  app.innerHTML = masthead() + '<p class="crumb"><a data-go="">← Board</a> / ' + esc(p.name) + '</p><div class="hero"><div class="card"><span class="num">#' + r.rank + ' of ' + B.length + ' by implied value</span><h1>' + esc(p.name) + '</h1>' +
    '<span class="tag ' + p.tier + '" style="margin:0">' + TIERS[p.tier] + '</span><span class="tag">' + esc(p.cat) + '</span>' + p.chains.slice(0, 5).map(function (c) { return '<span class="tag early">' + esc(c) + '</span>'; }).join('') +
    '<div class="facts">' + fact('TVL', usd(p.tvl)) + fact('7-day change', chg(p)) + fact('Listed since', p.listed || 'not reported') + fact('No token for', ageOf(p)) + '</div></div>' +
    '<div class="card big"><small>Implied value · a model estimate</small><b class="v">' + usd(iv.value) + '</b><div class="facts">' + fact('If it launches', usd(iv.launch)) + fact('Token odds, ' + S.sc.horizon + ' yr', pct(iv.odds)) + fact('P25–P75', usd(iv.lo) + ' – ' + usd(iv.hi)) + fact('Board.json', usd(r.usd)) + '</div>' +
    '<p class="note">DefiLlama records no token for it, which is not proof that it has none.</p></div></div>' +
    '<div class="two"><div class="card"><h2>How the figure is made</h2>' + equationOf(r) + '</div><div><div class="card"><h2>What moves it</h2>' + sensitivity(r) + '</div><div class="card" style="margin-top:10px"><h2>Nearest priced peers</h2>' + nearestPeers(r) + '</div></div></div>' +
    '<div class="two"><div class="card"><h2>Farm verdict · ' + usd(S.sc.deposit) + ' for ' + S.sc.weeks + ' weeks at a ' + pct(S.sc.share) + ' drop share</h2><p class="callout ' + f.verdict + '"><span><b class="' + f.verdict + '">' + f.verdict + '</b>: a modelled drop of ' + usd(f.drop) + ' for ' + usd(f.gas) + ' of fees and ' + f.hours.toFixed(1) + ' h of work, net ' + signed(f.net) + ' (' + signed(f.perHour) + ' an hour). It ' + why + '.</span></p>' +
    '<table class="mini"><tr><td>Drop = ' + usd(iv.value) + ' × ' + pct(S.sc.share) + ' × ' + usd(S.sc.deposit) + ' ÷ ' + usd(p.tvl + S.sc.deposit) + ' × ' + S.sc.weeks + '/' + S.sc.season + ' wk</td><td class="n">' + usd(f.drop) + '</td></tr><tr><td>The same ' + usd(S.sc.deposit) + ' in a 4% T-bill for ' + S.sc.weeks + ' weeks</td><td class="n">' + usd(f.tbill) + '</td></tr><tr><td>Fees are covered above a drop share of</td><td class="n">' + pct(f.breakEven, 2) + '</td></tr></table>' +
    '<h2 style="margin-top:12px">Net of fees by drop share and deposit</h2>' + netGrid(r) + '</div>' +
    '<div class="card"><h2>Farm plan · ' + f.steps.length + ' steps on ' + esc(f.chain) + ', with what each costs and takes</h2><ol class="steps">' + f.steps.map(function (s) { return '<li><span class="t">' + s.tag + '</span><span>' + esc(s.text) + '.</span><span class="c">' + (s.cost ? usd(s.cost) : 'free') + '</span><span class="c">' + s.min + ' min</span></li>'; }).join('') +
    '<li class="sum"><span></span><span>All in</span><span class="c">' + usd(f.gas) + '</span><span class="c">' + f.hours.toFixed(1) + ' h</span></li></ol></div></div>';
  window.scrollTo(0, 0);
}

/* ---------- routing and events ---------- */
function route() {
  const slug = decodeURIComponent(location.hash.replace(/^#\/?p\//, '')), r = location.hash.indexOf('p/') > 0 && B.filter(function (x) { return x.p.slug === slug; })[0];
  if (r) renderDetail(r); else if (location.hash === '#/ledger') renderLedger(); else renderBoard();
}
app.addEventListener('click', function (e) {
  const t = e.target.closest('[data-set],[data-sort],[data-go],[data-act]');
  if (!t) return;
  if (t.dataset.set) { S[t.dataset.set] = t.dataset.v; rescore(true); }
  else if (t.dataset.sort) { S.dir = S.sort === t.dataset.sort ? -S.dir : t.dataset.sort === 'rank' || t.dataset.sort === 'name' ? 1 : -1; S.sort = t.dataset.sort; drawTable(); }
  else if (t.dataset.go !== undefined) location.hash = t.dataset.go === '/ledger' ? '#/ledger' : t.dataset.go ? '#/p/' + encodeURIComponent(t.dataset.go) : '';
  else if (t.dataset.act === 'csv') exportCsv();
  else { Object.assign(S, { sc: Object.assign({}, R.DEFAULTS), tier: 'all', verdict: 'all', cat: '', chain: '', q: '', sort: 'rank', dir: 1 }); rescore(false); }
});
app.addEventListener('input', function (e) {
  const t = e.target;
  if (t.id === 'q') { S.q = t.value; drawTable(); }
  else if (t.dataset.pick) { S[t.dataset.pick] = t.value; drawTable(); }
  else if (t.dataset.knob) {
    S.sc[t.dataset.knob] = Number(t.value);
    if (t.type === 'range') t.nextElementSibling.textContent = t.dataset.knob === 'share' ? pct(S.sc.share) : t.value + (t.dataset.knob === 'weeks' ? ' wk' : ' yr');
    rescore(t.type === 'range' ? 'drag' : true);
  }
});
app.addEventListener('change', function (e) { if (e.target.type === 'range') rescore(true); });
window.addEventListener('hashchange', route);
route();
})();
