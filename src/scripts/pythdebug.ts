import { priceAccountFor } from "../lib/market/pyth.js";
import { rpc } from "../lib/onchain/rpc.js";
const ids = {
  "Equity.US.AAPL/USD": "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  "Crypto.AAPLX/USD":   "978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675",
  "Crypto.AAPLX/AAPL.RR":"25babb83691a056fd65f879bfd7197eabd840aae741f69c87ccb31e204a979b2",
};
for (const [sym, id] of Object.entries(ids)) {
  const pda = priceAccountFor(id).toBase58();
  const r = await rpc<{ value: { owner: string; data: [string,string] } | null }>(
    "getAccountInfo", [pda, { encoding: "base64" }]);
  console.log(`${sym.padEnd(22)} pda ${pda}`);
  console.log(`   exists=${!!r.value}  owner=${r.value?.owner ?? "-"}  bytes=${r.value ? Buffer.from(r.value.data[0],"base64").length : 0}`);
}
