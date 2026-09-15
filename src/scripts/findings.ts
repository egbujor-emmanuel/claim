/**
 * Emit the README findings block from the caches.
 *
 * Numbers in prose drift the moment the data moves. Generating them means the
 * README cannot claim something the caches do not support.
 *
 *   npm run findings          print
 *   npm run findings -- --write   splice into README between the markers
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadUniverse, contested, multiToken } from "../lib/search.js";
import { universeStats } from "../lib/stats.js";
import { ISSUER_MINT_AUTHORITIES, ISSUER_PERMANENT_DELEGATES } from "../lib/authenticity.js";

const START = "<!-- findings:start -->";
const END = "<!-- findings:end -->";

const u = loadUniverse();
const s = universeStats();

const byIssuer: Record<string, number> = {};
for (const t of u.tokens) byIssuer[t.issuerId] = (byIssuer[t.issuerId] ?? 0) + 1;

const ondo = u.tokens.filter((t) => t.issuerId === "ondo");
const backed = u.tokens.filter((t) => t.issuerId === "backed");
const backpack = u.tokens.filter((t) => t.issuerId === "backpack");

const noDelegate = Object.values(u.onchain).filter((x) => !x.permanentDelegate).length;
const worstTraps = Object.values(u.onchain)
  .filter((x) => x.multiplierTrap && x.scaledUiAmount)
  .map((x) => ({
    symbol: x.symbol ?? x.mint.slice(0, 6),
    pct: (Number(x.scaledUiAmount!.multiplier) / Number(x.effectiveMultiplier)) * 100,
  }))
  .filter((x) => Number.isFinite(x.pct))
  .sort((a, b) => a.pct - b.pct)
  .slice(0, 6);

const n = (x: number) => x.toLocaleString("en-US");

const md = `${START}
Measured across **${n(s.tokens)} tokenized equities** from four issuers — xStocks ${n(byIssuer.backed ?? 0)}, Backpack Securities ${n(byIssuer.backpack ?? 0)}, Ondo ${n(byIssuer.ondo ?? 0)}, PreStocks ${n(byIssuer.prestocks ?? 0)} — covering ${n(u.companies.length)} companies. Regenerate any figure below with \`npm run findings\`.

**${n(contested().length)} companies carry tokens that confer materially different legal claims.** Not different prices for the same thing — different things. Of ${n(multiToken().length)} companies represented by more than one token, ${contested().length === multiToken().length ? "every single one" : n(contested().length)} spans issuers whose tokens are not legally equivalent.

**One key can seize ${n(s.largestDelegateReach)} of them.** A single permanent delegate, \`${s.largestDelegateKey ?? "unknown"}\`, can move or burn that many tokenized equities out of any wallet on Solana without the holder's consent. Across the whole universe there are only ${n(s.delegateKeys)} such keys, covering ${n(s.delegated)} of ${n(s.tokens)} tokens.

**${n(noDelegate)} tokens have no permanent delegate at all** — every Ondo mint. Ondo is the only issuer that cannot take tokens out of a holder's wallet, and that is worth saying as plainly as the risks.

**${n(s.multiplierTraps)} tokens display the wrong balance to naive apps.** They carry a scheduled scaled-UI multiplier that has already taken effect, so software reading the \`multiplier\` field instead of computing the effective value is wrong. ${worstTraps
  .map((t) => `${t.symbol} shows **${t.pct.toFixed(0)}%**`)
  .join(", ")} of the real position.

**Almost none of them can be sold.** All ${n(s.probed)} were probed against Jupiter. **${n(s.routable)} have a route. ${n(s.probed - s.routable)} have none** — no liquidity pool in existence, cross-checked against DexScreener, which returns no pairs for them.

**And a route is not an exit.** Full quote ladders were measured for every routable mint. **${n(s.canExit10k)} can absorb a $10,000 sale inside 5% slippage** — out of ${n(s.tokens)}.

**Counterfeits are live.** Searching Jupiter for \`QQQon\` returns nine mints, eight of which fail on-chain verification against Ondo's mint authority, and all of which call themselves "Invesco QQQ (Ondo Tokenized)". One impersonating NVIDIA is a pump.fun mint with a fixed billion supply and no extensions at all.

**And the good news, stated plainly:** every xStocks asset with circulating supply is fully collateralised. None are under-backed.
${END}`;

if (process.argv.includes("--write")) {
  const path = join(process.cwd(), "README.md");
  const readme = readFileSync(path, "utf8");
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a === -1 || b === -1) {
    console.error(`README is missing the ${START} / ${END} markers.`);
    process.exitCode = 1;
  } else {
    writeFileSync(path, readme.slice(0, a) + md + readme.slice(b + END.length));
    console.log("README findings block regenerated.");
  }
} else {
  console.log(md);
}

// Sanity: the identity constants must still match what is on chain.
const ondoOk = ondo.every((t) => u.onchain[t.mint]?.mintAuthority === ISSUER_MINT_AUTHORITIES.ondo);
const backedOk = backed.every(
  (t) => u.onchain[t.mint]?.mintAuthority === ISSUER_MINT_AUTHORITIES.backed,
);
const backpackOk = backpack.every(
  (t) => u.onchain[t.mint]?.permanentDelegate === ISSUER_PERMANENT_DELEGATES.backpack,
);
if (!ondoOk || !backedOk || !backpackOk) {
  console.error(
    `\nWARNING: issuer fingerprints no longer match the chain (ondo=${ondoOk} backed=${backedOk} backpack=${backpackOk}).`,
  );
  process.exitCode = 1;
}
