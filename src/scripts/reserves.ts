import { fetchProofOfReserves, backingRatio } from "../lib/ingest/xstocks.js";

const por = await fetchProofOfReserves();
console.log(`proof-of-reserves records: ${por.size}`);

const spcxx = por.get("SPCXx");
if (spcxx) {
  console.log(`\nSPCXx`);
  console.log(`  sharesHeld         ${spcxx.sharesHeld}`);
  console.log(`  circulatingSupply  ${spcxx.circulatingSupply}`);
  console.log(`  custodian          ${spcxx.holdings.map((h) => `${h.provider}:${h.quantity}`).join(", ")}`);
  console.log(`  backing ratio      ${backingRatio(spcxx)?.toFixed(4)}`);
}

let withSupply = 0, under = 0, zero = 0;
const worst: { s: string; r: number }[] = [];
for (const [symbol, rec] of por) {
  const r = backingRatio(rec);
  if (r === null) { zero++; continue; }
  withSupply++;
  if (r < 0.999) { under++; worst.push({ s: symbol, r }); }
}
console.log(`\nassets with circulating supply > 0 : ${withSupply}`);
console.log(`assets with zero circulating supply: ${zero}`);
console.log(`under-collateralised               : ${under}`);
if (worst.length) {
  worst.sort((a, b) => a.r - b.r);
  console.log(`worst: ${worst.slice(0, 10).map((w) => `${w.s} ${w.r.toFixed(4)}`).join(", ")}`);
}
