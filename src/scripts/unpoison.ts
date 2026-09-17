/**
 * Purge verdicts that were really transport failures, and ask again.
 *
 * probeTradable used to collapse every kind of "no" into tradable:false, so a
 * dropped socket or a rate limit became a permanent finding that this token has
 * no market anywhere. It put 165 mints in that state, including TSLAx, SPYx and
 * NFLXx -- tokens with obvious, deep liquidity -- and the switch logic then
 * refused to route into any of them.
 *
 *   npx tsx src/scripts/unpoison.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadUniverse } from "../lib/search.js";
import { probeTradable, THROTTLE_MS } from "../lib/market/depth.js";

const OUT = new URL("../../data/cache/depth.json", import.meta.url);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cache = JSON.parse(readFileSync(OUT, "utf8")) as {
  generatedAt: string;
  tradable: Record<string, { tradable: boolean; reason: string | null }>;
  ladders: Record<string, unknown>;
};
const u = loadUniverse();
const sym = (m: string) => u.tokens.find((t) => t.mint === m)?.symbol ?? m.slice(0, 6);

const TRANSPORT = /fetch failed|HTTP 5|HTTP 429|Rate limit|timeout|abort|unreachable|ECONN|socket|not valid JSON/i;
const suspect = Object.entries(cache.tradable)
  .filter(([, v]) => v.tradable === false && TRANSPORT.test(v.reason ?? ""))
  .map(([m]) => m);

console.log(`[unpoison] re-asking ${suspect.length} mints whose "no market" was a failed request`);
let revived = 0, confirmed = 0, stillDown = 0;
for (const mint of suspect) {
  const r = await probeTradable(mint);
  if (r.tradable === null) { stillDown++; await sleep(THROTTLE_MS); continue; }
  cache.tradable[mint] = { tradable: r.tradable, reason: r.reason };
  if (r.tradable) { revived++; console.log(`[unpoison] ${sym(mint).padEnd(10)} has a market after all`); }
  else confirmed++;
  await sleep(THROTTLE_MS);
}
cache.generatedAt = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(cache, null, 1));
console.log(`[unpoison] revived ${revived}, genuinely dead ${confirmed}, still unreachable ${stillDown}`);
