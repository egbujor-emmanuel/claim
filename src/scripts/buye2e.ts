/**
 * Prove a purchase would execute, not just quote.
 *
 * Same standard as the switch path: build the real transaction and have a
 * validator run it against mainnet state. Nothing is signed and nothing spent.
 */
import { quoteSwitch, buildSwitchTransaction, preflight } from "../lib/switch.js";
import { buyableCompanies } from "../lib/buy.js";
import { rpc } from "../lib/onchain/rpc.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WALLET = process.argv[2] ?? "4PZySiky6z5J5Zb469TeRxNwGVT6cbWsBoeCd6qAScbR";

const targets = buyableCompanies();
const picks = [
  targets.find((t) => t.company.name.startsWith("Apple")),
  targets.find((t) => t.company.name.startsWith("Alphabet")),
  targets.find((t) => !t.compromised),
].filter(Boolean);

console.log(`buying as ${WALLET}, $1.00 USDC each\n`);
for (const t of picks) {
  const to = t!.reachable!.token.token.mint;
  const sym = t!.reachable!.token.token.symbol;
  console.log(`--- ${t!.company.name} -> ${sym} (${t!.reachable!.grade})${t!.compromised ? "  [compromise]" : ""} ---`);

  const pf = await preflight(to);
  if (!pf.ok) { console.log(`  preflight BLOCKED: ${pf.blockers.join(" | ")}`); continue; }

  const q = await quoteSwitch(USDC, to, "1000000"); // $1.00
  if ("error" in q) { console.log(`  quote FAILED: ${q.error}`); continue; }
  console.log(`  quote: $1.00 -> ${q.outAmountRaw} raw ${sym}, impact ${q.priceImpactPct}%, ${q.hops} hop(s)`);

  const tx = await buildSwitchTransaction(q, WALLET);
  if ("error" in tx) { console.log(`  build FAILED: ${tx.error}`); continue; }

  const sim = await rpc<{ value: { err: unknown; unitsConsumed?: number } }>("simulateTransaction", [
    tx.swapTransaction,
    { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "processed" },
  ]);
  console.log(`  SIMULATION: ${sim.value.err ? "FAILED " + JSON.stringify(sim.value.err) : "OK"}  units ${sim.value.unitsConsumed ?? "?"}\n`);
}
