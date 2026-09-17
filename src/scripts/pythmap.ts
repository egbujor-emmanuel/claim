/**
 * Cache which Pyth feed carries each company's real share price.
 *
 * Feed discovery is an HTTP lookup and the answer never changes, so it is done
 * once here rather than on every page load. Only the equity feeds are kept:
 * Pyth's Solana feeds for the tokens themselves are five days stale, while the
 * equity feeds are seconds old, so the token side of the comparison comes from
 * a live Jupiter quote instead.
 *
 *   npx tsx src/scripts/pythmap.ts
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { loadUniverse } from "../lib/search.js";
import { findFeeds } from "../lib/market/pyth.js";

import { PYTH_FEEDS_PATH as OUT } from "../lib/paths.js";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const map: Record<string, { feedId: string; symbol: string }> = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, "utf8"))
  : {};

const u = loadUniverse();
const symbols = [...new Set(u.tokens.map((t) => t.underlyingSymbol).filter(Boolean))] as string[];
console.log(`[pyth] ${symbols.length} underlying symbols; ${Object.keys(map).length} already mapped`);

let found = 0;
for (const sym of symbols) {
  if (map[sym]) continue;
  try {
    const feeds = await findFeeds(sym);
    const eq =
      feeds.find((f) => f.symbol === `Equity.US.${sym}/USD`) ??
      feeds.find((f) => f.symbol.startsWith("Equity.US.") && f.symbol.includes(`.${sym}/`));
    if (eq) { map[sym] = { feedId: eq.id, symbol: eq.symbol }; found++; }
  } catch { /* leave unmapped; a failed lookup is not an absent feed */ }
  if (found % 20 === 0 && found) writeFileSync(OUT, JSON.stringify(map, null, 1));
  await sleep(120);
}
writeFileSync(OUT, JSON.stringify(map, null, 1));
console.log(`[pyth] mapped ${Object.keys(map).length} equity feeds (+${found} new)`);
