/**
 * Scan the addresses that are not wallets.
 *
 * A mint, a program id and an address holding nothing all reach scanAddress,
 * and each one has crashed a parser at some point. None of them should throw;
 * all of them should return an honest empty answer.
 *
 *   npx tsx src/scripts/scanedge.ts
 */
import { scanAddress } from "../lib/holdings.js";
const cases: [string, string][] = [
  ["reported wallet", "2Cq2RNFFxxPXL7teNQAji1beA2vFbBDYW5BGPBFvoN9m"],
  ["empty/new wallet", "11111111111111111111111111111112"],
  ["a token mint, not a wallet", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"],
  ["token program id", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"],
];
for (const [label, addr] of cases) {
  const t0 = Date.now();
  try {
    const s = await scanAddress(addr);
    let exec = 0;
    for (const h of s.holdings) for (const sw of h.switches) if (sw.executable) exec++;
    console.log(`${label.padEnd(28)} ok  holdings=${s.holdings.length} other=${s.otherTokenCount} omitted=${s.omittedCount} exec=${exec} ${Date.now()-t0}ms`);
  } catch (e) {
    console.log(`${label.padEnd(28)} THREW ${e instanceof Error ? e.message : String(e)}`);
  }
}
