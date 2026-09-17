/**
 * Prove the transaction Claim builds would actually execute.
 *
 * Signing and landing it costs money, so the honest test short of that is
 * simulateTransaction: the validator runs the instructions against current
 * mainnet state and reports what would happen, without a signature and without
 * spending anything. A transaction that simulates clean is one the wallet can
 * sign; a transaction that fails here would have failed on chain.
 */
import { scanAddress } from "../lib/holdings.js";
import { quoteSwitch, buildSwitchTransaction, preflight } from "../lib/switch.js";
import { rpc } from "../lib/onchain/rpc.js";

const WALLET = process.argv[2] ?? "4PZySiky6z5J5Zb469TeRxNwGVT6cbWsBoeCd6qAScbR";
const scan = await scanAddress(WALLET);

const live = scan.holdings.flatMap((h) =>
  h.switches.filter((s) => s.executable).map((s) => ({ h, s })),
);
console.log(`wallet ${WALLET}`);
console.log(`positions ${scan.totalHoldings}, routable switches ${live.length}\n`);
if (!live.length) { console.log("no routable switch in this wallet"); process.exit(0); }

for (const { h, s } of live.slice(0, 3)) {
  const to = s.to.token.mint;
  console.log(`--- ${h.symbol} -> ${s.to.token.symbol} (${s.fromGrade} -> ${s.toGrade}) ---`);

  const pf = await preflight(to);
  console.log(`  preflight: ${pf.ok ? "ok" : "BLOCKED " + pf.blockers.join(" | ")}`);
  if (!pf.ok) continue;

  // A tenth of the holding, floored to raw units.
  const dec = h.token.token.decimals ?? 8;
  const raw = BigInt(Math.floor(h.uiAmount * 0.1 * 10 ** dec));
  if (raw <= 0n) { console.log("  position too small to quote"); continue; }

  const q = await quoteSwitch(h.mint, to, raw.toString());
  if ("error" in q) { console.log(`  quote FAILED: ${q.error}`); continue; }
  console.log(`  quote: in ${raw} -> out ${q.outAmountRaw}, impact ${q.priceImpactPct}%, ${q.hops} hop(s)`);

  const tx = await buildSwitchTransaction(q, WALLET);
  if ("error" in tx) { console.log(`  build FAILED: ${tx.error}`); continue; }
  console.log(`  built: ${tx.swapTransaction.length} b64 chars`);

  const sim = await rpc<{ value: { err: unknown; logs: string[] | null; unitsConsumed?: number } }>(
    "simulateTransaction",
    [tx.swapTransaction, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "processed" }],
  );
  const err = sim.value.err;
  console.log(`  SIMULATION: ${err ? "FAILED " + JSON.stringify(err) : "OK"}  units ${sim.value.unitsConsumed ?? "?"}`);
  if (err && sim.value.logs) for (const l of sim.value.logs.slice(-6)) console.log(`     ${l}`);
  console.log();
}
