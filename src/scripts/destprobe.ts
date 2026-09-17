/**
 * Re-probe every destination Claim would switch *into*, and write the result.
 *
 * The switch that fails is usually not the one you measured. A holder hit
 * TOKEN_NOT_TRADABLE on SOXLx -> SOXL: the source was fine, the destination was
 * dead, and the cache had it right while nothing asked. Destinations age like
 * any other market data, so this re-reads them and drops the ladder of anything
 * that has gone dark, since a ladder measured on a live pool keeps asserting a
 * price nobody will pay.
 *
 *   npx tsx src/scripts/destprobe.ts
 */
import { loadUniverse, byMint } from "../lib/search.js";
import { betterClaims } from "../lib/switch.js";
import { probeTradable, THROTTLE_MS } from "../lib/market/depth.js";
import { readFileSync, writeFileSync } from "node:fs";
const u = loadUniverse();
const dests = new Map<string, string>();
for (const t of u.tokens) {
  const c = byMint(t.mint, u); if (!c) continue;
  for (const o of betterClaims(t.mint, c)) {
    if (!o.executable) dests.set(o.to.token.mint, o.to.token.symbol);
  }
}
const OUT = new URL("../../data/cache/depth.json", import.meta.url);
const cache = JSON.parse(readFileSync(OUT, "utf8")) as {
  generatedAt: string;
  tradable: Record<string, { tradable: boolean; reason: string | null }>;
  ladders: Record<string, unknown>;
};
console.log(`probing ${dests.size} blocked destinations live`);
let changed = 0;
for (const [mint, sym] of dests) {
  const r = await probeTradable(mint);
  const before = cache.tradable[mint]?.tradable;
  cache.tradable[mint] = r;
  if (!r.tradable) delete cache.ladders[mint];
  if (before !== r.tradable) { changed++; console.log(`${sym.padEnd(10)} ${before} -> ${r.tradable} ${r.reason ?? ""}`); }
  await new Promise(r => setTimeout(r, THROTTLE_MS));
}
cache.generatedAt = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(cache, null, 1));
console.log(`wrote cache; ${changed} changed`);
