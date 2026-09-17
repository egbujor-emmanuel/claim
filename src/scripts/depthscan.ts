/**
 * Universe-wide tradability sweep, plus depth ladders for what actually trades.
 *
 * Jupiter's free endpoint is rate limited, so this is slow by design and writes
 * incrementally. Resumable: rerunning skips mints already measured.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { loadUniverse } from "../lib/search.js";
import { probeTradable, measureDepth, THROTTLE_MS, type DepthResult } from "../lib/market/depth.js";

const CACHE_DIR = new URL("../../data/cache/", import.meta.url);
const OUT = new URL("depth.json", CACHE_DIR);

interface DepthCache {
  generatedAt: string;
  tradable: Record<string, { tradable: boolean; reason: string | null }>;
  ladders: Record<string, DepthResult>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

mkdirSync(CACHE_DIR, { recursive: true });
const cache: DepthCache = existsSync(OUT)
  ? (JSON.parse(readFileSync(OUT, "utf8")) as DepthCache)
  : { generatedAt: new Date().toISOString(), tradable: {}, ladders: {} };

const save = () => {
  cache.generatedAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(cache, null, 1));
};

const universe = loadUniverse();
const limit = Number(process.argv[2] ?? universe.tokens.length);
const targets = universe.tokens.slice(0, limit);

console.log(`[depth] sweeping ${targets.length} mints for tradability`);

let done = 0;
let tradableCount = 0;
for (const token of targets) {
  if (cache.tradable[token.mint]) {
    if (cache.tradable[token.mint]!.tradable) tradableCount++;
    done++;
    continue;
  }

  const result = await probeTradable(token.mint);
  // A non-answer is not a verdict. Leaving the mint unrecorded means the next
  // run asks again, which is right; writing false would make a rate limit
  // permanent.
  if (result.tradable !== null) {
    cache.tradable[token.mint] = { tradable: result.tradable, reason: result.reason };
    if (result.tradable) tradableCount++;
  }
  done++;

  if (done % 25 === 0) {
    save();
    console.log(`[depth] ${done}/${targets.length}  tradable so far: ${tradableCount}`);
  }
  await sleep(THROTTLE_MS);
}
save();

// Full ladders only for what trades: a ladder on a dead token is four wasted calls.
const tradableMints = targets.filter((t) => cache.tradable[t.mint]?.tradable);
console.log(`\n[depth] measuring ladders for ${tradableMints.length} tradable mints`);

for (const token of tradableMints) {
  if (cache.ladders[token.mint]) continue;
  const ladder = await measureDepth(token.mint, token.decimals ?? 8);
  cache.ladders[token.mint] = ladder;
  save();
  const worst = ladder.rungs[ladder.rungs.length - 1];
  console.log(
    `[depth] ${token.symbol.padEnd(10)} maxExit ${
      ladder.maxExitUsd ? `$${ladder.maxExitUsd.toLocaleString()}` : "under $1k"
    }   $1M loss ${worst?.lossPct !== null && worst?.lossPct !== undefined ? `${worst.lossPct.toFixed(1)}%` : "no route"}`,
  );
  await sleep(THROTTLE_MS);
}

const bar = "=".repeat(64);
const total = Object.keys(cache.tradable).length;
const live = Object.values(cache.tradable).filter((t) => t.tradable).length;
console.log(`\n${bar}\nEXIT REALITY\n${bar}`);
console.log(`mints probed        ${total}`);
console.log(`tradable            ${live}  (${((live / total) * 100).toFixed(1)}%)`);
console.log(`no market at all    ${total - live}  (${(((total - live) / total) * 100).toFixed(1)}%)`);
console.log(`ladders measured    ${Object.keys(cache.ladders).length}`);
console.log(`\ncache -> data/cache/depth.json\n${bar}`);
