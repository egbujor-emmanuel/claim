/**
 * Measure the counterfeit surface for tokenized equities.
 *
 * Reports only deliberate impersonation. Unrelated tokens that happen to share
 * a ticker are counted separately and excluded from the headline, because
 * calling "Kooncoin" a counterfeit Coca-Cola token would be wrong.
 */
import { findImpostors } from "../lib/ingest/ondo.js";

const reports = await findImpostors();
const bar = "=".repeat(66);

console.log(`\n${bar}`);
console.log(`COUNTERFEIT SURFACE: mints claiming an Ondo tokenized-equity ticker`);
console.log(bar);

let impersonations = 0;
let collisions = 0;
const affected: string[] = [];

for (const r of reports) {
  const real = r.impostors.filter((i) => i.kind === "impersonation");
  collisions += r.impostors.length - real.length;
  if (real.length === 0) continue;

  impersonations += real.length;
  affected.push(r.ticker);

  console.log(`\n${r.ticker}`);
  console.log(`   canonical    ${r.canonical ?? "NOT FOUND"}`);
  for (const i of real) {
    const flag = /pump$|bonk$/.test(i.mint) ? "   [launchpad mint]" : "";
    console.log(`   impersonator ${i.mint}  "${i.name}"${flag}`);
  }
}

console.log(`\n${bar}`);
console.log(`tickers with impersonators   ${affected.length}  (${affected.join(", ")})`);
console.log(`impersonating mints          ${impersonations}`);
console.log(`unrelated ticker collisions  ${collisions}  (excluded: not counterfeits)`);
console.log(bar);
console.log(
  `\nEvery impersonating mint above fails the structural test: none carry the\n` +
    `pause control, scaled-UI multiplier and mint authority a real tokenized\n` +
    `equity needs. That is checkable by anyone against the same public RPC.\n`,
);
