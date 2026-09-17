/**
 * Whole-universe integrity sweep.
 *
 * The gate proves specific claims about specific tokens. This walks every token
 * instead, looking for the failures that only appear at scale: a rating that
 * throws, a finding with no source, a number that renders as NaN, a switch that
 * points nowhere. Anything it prints is a bug.
 */
import { loadUniverse, byMint } from "../lib/search.js";
import { rateToken } from "../lib/rating/index.js";
import { betterClaims } from "../lib/switch.js";

const u = loadUniverse();
const problems: string[] = [];
let rated = 0, graded = 0, switches = 0;

for (const t of u.tokens) {
  const c = byMint(t.mint, u);
  if (!c) { problems.push(`${t.symbol}: no company resolves for this mint`); continue; }
  const held = c.tokens.find((x) => x.token.mint === t.mint);
  if (!held) { problems.push(`${t.symbol}: company does not contain its own token`); continue; }

  let r;
  try { r = rateToken(held); } catch (e) {
    problems.push(`${t.symbol}: rateToken threw — ${e instanceof Error ? e.message : String(e)}`);
    continue;
  }
  rated++;
  if (r.grade) graded++;

  if (!r.headline || /NaN|undefined|null/.test(r.headline))
    problems.push(`${t.symbol}: bad headline "${r.headline}"`);
  for (const f of r.findings) {
    if (!f.message) problems.push(`${t.symbol}: finding with no message`);
    if (/NaN|undefined/.test(f.message + f.evidence))
      problems.push(`${t.symbol}: NaN/undefined in finding — ${f.message.slice(0, 60)}`);
    if (!["critical", "warning", "note", "good", "info"].includes(f.severity))
      problems.push(`${t.symbol}: unknown severity "${f.severity}"`);
  }
  if (r.scoring) {
    if (!Number.isFinite(r.scoring.score)) problems.push(`${t.symbol}: non-finite score`);
    if (r.scoring.reasons.length === 0 && r.scoring.score !== 0)
      problems.push(`${t.symbol}: score ${r.scoring.score} with no reasons`);
  }

  let opts;
  try { opts = betterClaims(t.mint, c); } catch (e) {
    problems.push(`${t.symbol}: betterClaims threw — ${e instanceof Error ? e.message : String(e)}`);
    continue;
  }
  switches += opts.length;
  for (const o of opts) {
    if (o.to.token.mint === t.mint) problems.push(`${t.symbol}: switch points at itself`);
    if (!o.executable && !o.blockedReason) problems.push(`${t.symbol}: blocked with no reason`);
    if (o.executable && o.blockedReason) problems.push(`${t.symbol}: executable yet carries a block reason`);
    if (!o.executable && !o.blockedSide) problems.push(`${t.symbol}: blocked without naming a side`);
    if (o.executable && o.blockedSide) problems.push(`${t.symbol}: executable yet names a blocked side`);
    if (o.blockedSide === "destination" && !(o.blockedReason ?? "").startsWith(o.to.token.symbol))
      problems.push(`${t.symbol}: destination block does not name the destination`);
    if (o.blockedSide === "source" && !(o.blockedReason ?? "").startsWith(t.symbol))
      problems.push(`${t.symbol}: source block does not name the source`);
    if (o.gains.length === 0) problems.push(`${t.symbol}: switch offered with no gain`);
    for (const g of [...o.gains, ...o.tradeoffs])
      if (/NaN|undefined/.test(g)) problems.push(`${t.symbol}: NaN/undefined in switch copy — ${g.slice(0, 60)}`);
  }
}

console.log(`tokens=${u.tokens.length} rated=${rated} graded=${graded} switchOptions=${switches}`);
console.log(problems.length === 0 ? "NO PROBLEMS" : `${problems.length} PROBLEMS:`);
for (const p of problems.slice(0, 40)) console.log("  -", p);
