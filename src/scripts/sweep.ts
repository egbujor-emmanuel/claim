/**
 * Audit every switch Claim would offer, and whether it can actually be taken.
 *
 * Run after any depth sweep. The number that matters is the blocked count: it
 * is how many positions look switchable and are not, which is the failure mode
 * this project exists to catch rather than commit.
 *
 *   npx tsx src/scripts/sweep.ts
 */
import { loadUniverse, byMint } from "../lib/search.js";
import { betterClaims } from "../lib/switch.js";

const u = loadUniverse();
let off = 0, on = 0;
const blocked: string[] = [];
const seen = new Set<string>();

for (const t of u.tokens) {
  const c = byMint(t.mint, u);
  if (!c || seen.has(t.mint)) continue;
  seen.add(t.mint);
  for (const o of betterClaims(t.mint, c)) {
    if (o.executable) on++;
    else { off++; blocked.push(`${t.symbol} -> ${o.to.token.symbol}: ${(o.blockedReason ?? "").slice(0, 90)}`); }
  }
}
console.log("executable:", on, "blocked:", off);
for (const b of blocked.slice(0, 20)) console.log(b);
