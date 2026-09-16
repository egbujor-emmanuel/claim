import { scanAddress, summarise } from "../lib/holdings.js";

const target = process.argv[2];
if (!target) { console.error("usage: npm run scan-address -- <address>"); process.exit(1); }

const scan = await scanAddress(target);
console.log(`\n${scan.address}`);
console.log(summarise(scan));
console.log(`(${scan.otherTokenCount} other token accounts ignored)\n`);

for (const h of scan.holdings) {
  console.log(`[${h.rating.grade ?? "-"}] ${h.symbol.padEnd(10)} ${h.uiAmount.toLocaleString("en-US", { maximumFractionDigits: 4 }).padStart(16)}${h.multiplierApplied ? "  (multiplier applied)" : ""}`);
  console.log(`     ${h.rating.headline}`);
  for (const s of h.switches.slice(0, 1)) {
    console.log(`     -> switch to ${s.to.token.symbol} (${s.fromGrade} to ${s.toGrade}): ${s.gains[0]}`);
  }
}
