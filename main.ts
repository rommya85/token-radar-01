// Token Radar's entrypoint: snapshot in, ranked board + dashboard + dossier out.
//
// Run it from anywhere; every path it reads is resolved from this file's own directory, never
// from the working directory. The model lives in lib/model.ts (radar-6): the snapshot's 758
// protocols are scored by the held-out-selected size curve times the growth and age factors,
// the board is written to board.json, the dashboard's data is written as dashboard/zz-data.js
// (one minified line, so it sorts last in the dossier and is the only file the text cap cuts),
// dashboard/ and screenshots/ are copied through, and dossier.json is written with the
// vendored make.fun library. The run is deterministic: the same snapshot always writes the
// same bytes, so the grader's two runs agree.
//
//   node main.ts [--input <snapshot.json|directory>] [--output <dir>]
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output. The dashboard is
// a static page, no framework and no network: dashboard/index.html, dashboard/app.css and
// dashboard/app.js read zz-data.js beside them, which this program writes from the same board.
// The page recomputes every row's implied value and regenerates every farm plan from the same
// derivation, so what the screenshots show and what board.json carries are one arithmetic.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the dossier's bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read `--name <value>` or `--name=<value>` out of the arguments, or fall back. */
function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

/** Fail with a message on stderr and exit code 2: the run never writes a partial output. */
function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(2);
}

function main(): void {
  const inputArg = flag('input', '/input');
  const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(inputFile)) {
    fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
  }
  const out = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    fail(`the model wrote a board the gate refuses: ${issue}`);
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);

  const dashFiles = copyDir(join(here, 'dashboard'), join(out, 'dashboard'));
  if (!dashFiles.includes('index.html')) {
    fail('dashboard/ holds no index.html: the dashboard is a static page and needs its entry file');
  }
  // The data file is written into the copied dashboard, one minified line, so it sorts last
  // in the dossier's text and is the only file the text cap cuts.
  writeFileSync(join(out, 'dashboard', 'zz-data.js'), dataScript(radar));
  const shots = copyDir(join(here, 'screenshots'), join(out, 'screenshots'));
  if (shots.length < 3) {
    fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
  }
  for (const name of shots) {
    const base = name.split('/').pop()!;
    if (!IMAGE_NAME.test(base)) {
      fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
    }
  }

  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
  );

  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'dashboard')} (${dashFiles.length} files + zz-data.js), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
  );
}

/**
 * Copy one directory tree's regular files into `to`, skipping names that start with a dot,
 * and return the copied paths relative to the tree's root.
 */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const path = join(dir, name);
      const target = join(to, rel, name);
      if (statSync(path).isDirectory()) {
        mkdirSync(target, { recursive: true });
        walk(path, join(rel, name));
      } else if (statSync(path).isFile()) {
        copyFileSync(path, target);
        copied.push(join(rel, name));
      }
    }
  };
  walk(from, '');
  return copied;
}

main();
