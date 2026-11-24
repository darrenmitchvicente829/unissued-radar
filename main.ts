// Unissued: a radar for tokens that do not exist yet (make.fun token-radar-01, Node 22, standard library only).
//
// The model lives in dashboard/model.js and is run twice. Here it reads the sealed snapshot, fits itself on
// the snapshot's own figures, and writes the ranked board to /output/board.json. The page then runs the
// same file on the same rows (written beside it as /output/data.js) and shows what it gets, with the
// checksum of this board so a reader can see that both runs agree.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json or its directory>

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

interface Protocol {
  slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; change_7d: number | null;
  mcap_usd: number | null; listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
interface Snapshot { as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[] }
interface BoardRow { slug: string; name: string; rank: number; implied_value_usd: number; farm_steps: string[] }

const here = fileURLToPath(new URL('.', import.meta.url));
const Radar = createRequire(import.meta.url)('./dashboard/model.js');

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1]! : fallback;
}
function fail(why: string): never {
  process.stderr.write(`unissued: ${why}\n`);
  process.exit(1);
}

const input = arg('input', '/input');
const file = input.endsWith('.json') ? input : join(input, 'snapshot.json');
if (!existsSync(file)) fail(`no snapshot at ${file}`);
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snapshot = JSON.parse(readFileSync(file, 'utf8')) as Snapshot;

// The page's data: the snapshot's own ten fields per protocol, as compact rows. Nothing is added to them.
const data = {
  as_of: snapshot.as_of,
  source: snapshot.source,
  floor_usd: snapshot.floor_usd,
  watchlist: snapshot.watchlist,
  rows: snapshot.protocols.map((p) => [p.slug, p.name, p.category, p.chains, p.tvl_usd, p.change_7d, p.mcap_usd, p.listed_at, p.gecko_id !== null || p.symbol !== null ? 1 : 0]),
};

const rows = Radar.prepare(data);
const model = Radar.fit(rows);
const board: BoardRow[] = Radar.boardRows(Radar.board(rows, model, Radar.DEFAULTS));

// The gate's own shape, checked before anything is written, so a bad board never leaves this program.
const known = new Set(snapshot.protocols.map((p) => p.slug));
const onBoard = new Set(board.map((r) => r.slug));
if (board.length < 100 || board.length > 4000) fail(`the board holds ${board.length} rows, outside 100 to 4,000`);
for (const slug of snapshot.watchlist) if (!onBoard.has(slug)) fail(`the watchlist's ${slug} is not on the board`);
board.forEach((r, i) => {
  if (!known.has(r.slug)) fail(`${r.slug} is not one of the snapshot's protocols`);
  if (r.rank !== i + 1) fail(`rank ${r.rank} sits at position ${i + 1}`);
  if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd < 1) fail(`${r.slug} has no positive whole implied value`);
  if (i > 0 && r.implied_value_usd > board[i - 1]!.implied_value_usd) fail(`implied value rises at rank ${r.rank}`);
  if (r.farm_steps.length < 3 || r.farm_steps.length > 12) fail(`${r.slug} has ${r.farm_steps.length} farm steps`);
  for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) fail(`${r.slug} has a farm step of ${s.trim().length} characters`);
});
if (board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) fail('every implied value is the same');

const checksum: string = Radar.checksum(board);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ model: 'unissued-1', as_of: snapshot.as_of, checksum, rows: board })}\n`);
writeFileSync(join(out, 'data.js'), `window.RADAR_DATA = ${JSON.stringify({ ...data, board: { rows: board.length, checksum, total: board.reduce((a, r) => a + r.implied_value_usd, 0) } })};\n`);

/** Copy one directory's regular files, skipping names that start with a dot. */
function copyFiles(from: string, to: string): number {
  mkdirSync(to, { recursive: true });
  let n = 0;
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.') || !statSync(join(from, name)).isFile()) continue;
    copyFileSync(join(from, name), join(to, name));
    n += 1;
  }
  return n;
}
copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots < 3) fail(`screenshots/ holds ${shots} images, 3 are needed`);

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: 65_536 }));
process.stdout.write(`unissued: ${snapshot.protocols.length} protocols read, ${board.length} pre-token rows ranked, watchlist ${snapshot.watchlist.length} of ${snapshot.watchlist.length} covered, checksum ${checksum}\n`);
