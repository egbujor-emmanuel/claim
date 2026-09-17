/**
 * Re-probe tradability for the mints that actually gate a switch.
 *
 * The universe sweep is resumable by design and skips anything already
 * measured, which is right for a cold build and wrong for a cache that has
 * aged: SOXLx was recorded as routable on 15 Sep and Jupiter refuses it now.
 * Only the mints Claim would offer a switch *out of* decide whether a holder
 * is sent down a dead end, so those are the ones worth paying the rate limit
 * to re-read.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadUniverse, byMint } from "../lib/search.js";
import { betterClaims } from "../lib/switch.js";
import { probeTradable, THROTTLE_MS } from "../lib/market/depth.js";

const OUT = new URL("../../data/cache/depth.json", import.meta.url);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cache = JSON.parse(readFileSync(OUT, "utf8")) as {
  generatedAt: string;
  tradable: Record<string, { tradable: boolean; reason: string | null }>;
  ladders: Record<string, unknown>;
};

const u = loadUniverse();
const sources = new Set<string>();
for (const t of u.tokens) {
  const c = byMint(t.mint, u);
  if (c && betterClaims(t.mint, c).length > 0) sources.add(t.mint);
}

console.log(`[refresh] re-probing ${sources.size} switch sources`);
let flipped = 0;
for (const mint of sources) {
  const before = cache.tradable[mint]?.tradable;
  const result = await probeTradable(mint);
  cache.tradable[mint] = result;
  const sym = u.tokens.find((t) => t.mint === mint)?.symbol ?? mint.slice(0, 6);
  if (before !== result.tradable) {
    flipped++;
    // A ladder measured when the pool was alive is worse than no ladder once
    // the route is gone: it would keep asserting a price nobody will pay.
    if (!result.tradable) delete cache.ladders[mint];
    console.log(`[refresh] ${sym.padEnd(10)} ${before} -> ${result.tradable}  ${result.reason ?? ""}`);
  }
  await sleep(THROTTLE_MS);
}

cache.generatedAt = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(cache, null, 1));
console.log(`[refresh] done. ${flipped} changed.`);
