/**
 * What the wallet is actually being asked to approve.
 *
 * A warning screen is worth understanding rather than explaining away: either
 * the transaction does something alarming, or the warning is about the domain.
 * This decodes every program the transaction invokes so the answer is evidence.
 */
import { VersionedTransaction, PublicKey } from "@solana/web3.js";
import { quoteSwitch, buildSwitchTransaction } from "../lib/switch.js";
import { loadUniverse } from "../lib/search.js";

const KNOWN: Record<string, string> = {
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Jupiter Aggregator v6",
  "JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo": "Jupiter v4",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": "SPL Token",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb": "Token-2022",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL": "Associated Token Account",
  "11111111111111111111111111111111": "System Program",
  "ComputeBudget111111111111111111111111111111": "Compute Budget",
};

const u = loadUniverse();
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const to = u.tokens.find((t) => t.symbol === "ABTx")!.mint;
const WALLET = "4PZySiky6z5J5Zb469TeRxNwGVT6cbWsBoeCd6qAScbR";

const q = await quoteSwitch(USDC, to, "3000000");
if ("error" in q) { console.log("quote failed:", q.error); process.exit(1); }
const built = await buildSwitchTransaction(q, WALLET);
if ("error" in built) { console.log("build failed:", built.error); process.exit(1); }

const tx = VersionedTransaction.deserialize(Buffer.from(built.swapTransaction, "base64"));
const keys = tx.message.staticAccountKeys.map((k: PublicKey) => k.toBase58());

console.log(`instructions: ${tx.message.compiledInstructions.length}`);
console.log(`signers required: ${tx.message.header.numRequiredSignatures}`);
console.log(`signatures present: ${tx.signatures.filter((s) => s.some((b) => b !== 0)).length}`);
console.log(`fee payer: ${keys[0]}  (our wallet: ${keys[0] === WALLET})`);
console.log("\nprograms invoked:");
const seen = new Set<string>();
for (const ix of tx.message.compiledInstructions) {
  const pid = keys[ix.programIdIndex];
  if (!pid || seen.has(pid)) continue;
  seen.add(pid);
  console.log(`  ${KNOWN[pid] ?? "UNRECOGNISED"}  ${pid}`);
}
console.log("\naddress lookup tables:", tx.message.addressTableLookups.length);
