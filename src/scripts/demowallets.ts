/**
 * Find real wallets worth showing.
 *
 * A single-position pool address proves the scan works but makes a thin
 * demonstration. What lands is a wallet holding several tokenized equities at
 * once, where some are weaker claims than an alternative sitting next to them —
 * because that is the situation Claim exists for and the one nobody can see
 * today.
 *
 * Needs a dedicated RPC: getTokenLargestAccounts is refused outright by the
 * public endpoint.
 *
 *   npm run demo-wallets
 */
import { rpc } from "../lib/onchain/rpc.js";
import { loadUniverse } from "../lib/search.js";
import { scanAddress, summarise } from "../lib/holdings.js";

const universe = loadUniverse();

/**
 * Sample across issuers rather than down one catalogue. A wallet that holds two
 * xStocks is less interesting than one holding an xStock and a PreStock,
 * because only the second has competing claims to compare.
 */
function sampleMints(perIssuer = 6): { mint: string; symbol: string; issuerId: string }[] {
  const byIssuer = new Map<string, typeof universe.tokens>();
  for (const t of universe.tokens) {
    byIssuer.set(t.issuerId, [...(byIssuer.get(t.issuerId) ?? []), t]);
  }

  const out: { mint: string; symbol: string; issuerId: string }[] = [];
  for (const [issuerId, tokens] of byIssuer) {
    // Prefer tokens that belong to a company with more than one representation.
    const contested = tokens.filter((t) => {
      const company = universe.companies.find((c) =>
        c.tokens.some((x) => x.mint === t.mint),
      );
      return (company?.tokens.length ?? 0) > 1;
    });
    const pool = contested.length > 0 ? contested : tokens;
    for (const t of pool.slice(0, perIssuer)) {
      out.push({ mint: t.mint, symbol: t.symbol, issuerId });
    }
  }
  return out;
}

interface LargestAccount {
  address: string;
  uiAmountString: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mints = sampleMints();
console.log(`[demo] probing ${mints.length} mints across ${new Set(mints.map((m) => m.issuerId)).size} issuers\n`);

/** wallet -> the token symbols it holds */
const wallets = new Map<string, Set<string>>();

for (const m of mints) {
  let accounts: LargestAccount[] = [];
  try {
    const res = await rpc<{ value: LargestAccount[] }>("getTokenLargestAccounts", [m.mint]);
    accounts = (res.value ?? []).slice(0, 12);
  } catch (e) {
    console.log(`  ${m.symbol}: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    continue;
  }
  if (accounts.length === 0) continue;

  // Token accounts are not wallets. Resolve each to its owner in one batch.
  try {
    const infos = await rpc<{ value: ({ data: { parsed: { info: { owner?: string } } } } | null)[] }>(
      "getMultipleAccounts",
      [accounts.map((a) => a.address), { encoding: "jsonParsed" }],
    );
    for (const account of infos.value) {
      const owner = account?.data?.parsed?.info?.owner;
      if (!owner) continue;
      wallets.set(owner, (wallets.get(owner) ?? new Set()).add(m.symbol));
    }
  } catch {
    // one failed resolution should not abort the sweep
  }

  process.stdout.write(`  ${m.symbol} `);
  await sleep(120);
}

console.log(`\n\n[demo] ${wallets.size} distinct wallets seen`);

const multi = [...wallets.entries()]
  .filter(([, syms]) => syms.size > 1)
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 12);

console.log(`[demo] ${multi.length} hold more than one tokenized equity\n`);

interface Candidate {
  address: string;
  positions: number;
  critical: number;
  switchable: number;
  summary: string;
  symbols: string[];
}

const candidates: Candidate[] = [];
for (const [address] of multi) {
  try {
    const scan = await scanAddress(address);
    if (scan.holdings.length < 2) continue;
    candidates.push({
      address,
      positions: scan.holdings.length,
      critical: scan.criticalCount,
      switchable: scan.switchableCount,
      summary: summarise(scan),
      symbols: scan.holdings.map((h) => `${h.symbol}[${h.rating.grade ?? "-"}]`),
    });
  } catch {
    continue;
  }
  await sleep(150);
}

// Ranked by how much there is to say: switchable positions first, then
// criticals, then breadth.
candidates.sort(
  (a, b) => b.switchable - a.switchable || b.critical - a.critical || b.positions - a.positions,
);

console.log("=".repeat(72));
console.log("DEMO CANDIDATES");
console.log("=".repeat(72));
for (const c of candidates.slice(0, 8)) {
  console.log(`\n${c.address}`);
  console.log(`  ${c.summary}`);
  console.log(`  ${c.symbols.join("  ")}`);
}
if (candidates.length === 0) {
  console.log("\nNone found. Widen perIssuer or the accounts-per-mint slice.");
}
console.log(`\n${"=".repeat(72)}`);
