import { findFeeds, classifyFeeds, readPrices } from "../lib/market/pyth.js";
for (const q of ["AAPLX", "AAPL", "TSLAX"]) {
  const feeds = await findFeeds(q);
  console.log(`\n"${q}" -> ${feeds.length} feed(s)`);
  for (const f of feeds.slice(0, 6)) console.log(`   ${f.symbol}  ${f.id.slice(0, 16)}…`);
}
const feeds = await findFeeds("AAPL");
const set = classifyFeeds(feeds, "AAPLx", "AAPL");
console.log("\nclassified:", JSON.stringify(set, null, 1).slice(0, 400));
const ids = [set.underlying?.id, set.token?.id, set.ratio?.id].filter(Boolean) as string[];
if (ids.length) {
  const prices = await readPrices(ids);
  console.log("\nprices read from chain:");
  for (const [id, p] of prices) console.log(`   ${id.slice(0,16)}…  ${p.price}  ±${p.confidence}  age ${p.ageSeconds}s`);
}
