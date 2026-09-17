/**
 * Find wallets that demonstrate the whole product, not just the scan.
 *
 * The useful demo wallet is not the biggest one. It is one holding a position
 * whose switch can actually be routed, because that is the only path that
 * reaches a connected wallet and a built transaction. Wallets full of illiquid
 * xStocks show the diagnosis and stop there.
 *
 *   npx tsx src/scripts/findwallets.ts
 */
import { rpc } from "../lib/onchain/rpc.js";
import { loadUniverse, byMint } from "../lib/search.js";
import { betterClaims } from "../lib/switch.js";
import { scanAddress, summarise } from "../lib/holdings.js";

const u = loadUniverse();

// Only mints whose switch is routable today; holders of those are the ones who
// can see the full flow end to end.
const live: { mint: string; symbol: string }[] = [];
for (const t of u.tokens) {
  const c = byMint(t.mint, u);
  if (!c) continue;
  if (betterClaims(t.mint, c).some((o) => o.executable)) live.push({ mint: t.mint, symbol: t.symbol });
}
console.log(`[find] ${live.length} mints have a routable switch: ${live.map((l) => l.symbol).join(", ")}\n`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const seen = new Set<string>();
const candidates: string[] = [];
for (const { mint, symbol } of live) {
  try {
    await sleep(2500);
    const res = await rpc<{ value: { address: string; uiAmount: number | null }[] }>(
      "getTokenLargestAccounts",
      [mint],
    );
    for (const acc of res.value.slice(0, 6)) {
      await sleep(1200);
      const owner = await rpc<{ value: { data: { parsed?: { info?: { owner?: string } } } } | null }>(
        "getAccountInfo",
        [acc.address, { encoding: "jsonParsed" }],
      );
      const holder = owner.value?.data?.parsed?.info?.owner;
      if (holder && !seen.has(holder)) { seen.add(holder); candidates.push(holder); }
    }
    console.log(`[find] ${symbol}: ${res.value.length} large accounts`);
  } catch (e) {
    console.log(`[find] ${symbol}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log(`\n[find] scanning ${candidates.length} candidate holders\n`);
const results: { addr: string; holdings: number; exec: number; blocked: number; crit: number; summary: string }[] = [];
for (const addr of candidates) {
  try {
    const s = await scanAddress(addr);
    let exec = 0, blocked = 0;
    for (const h of s.holdings) for (const sw of h.switches) (sw.executable ? exec++ : blocked++);
    const crit = s.holdings.filter((h) => h.rating.findings.some((f) => f.severity === "critical")).length;
    if (s.holdings.length > 0) results.push({ addr, holdings: s.totalHoldings, exec, blocked, crit, summary: summarise(s) });
  } catch { /* an address that will not scan is not a demo */ }
}

results.sort((a, b) => (b.exec - a.exec) || (b.holdings - a.holdings));
console.log("=".repeat(76));
for (const r of results.slice(0, 15)) {
  console.log(`${r.addr}`);
  console.log(`   positions ${r.holdings}  routable switches ${r.exec}  blocked ${r.blocked}  critical ${r.crit}`);
}
