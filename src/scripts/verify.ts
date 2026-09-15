/**
 * Verification harness.
 *
 * Run before moving to the next phase. Checks invariants against the live cache
 * and, where cheap, against the network. Exits non-zero on any failure so it can
 * gate a build.
 *
 *   npm run verify
 */
import { existsSync } from "node:fs";
import { loadUniverse, search, byMint, contested, multiToken } from "../lib/search.js";
import { ISSUERS, issuerForMint } from "../data/issuers.js";
import { fetchMint, effectiveMultiplier, hasMultiplierTrap } from "../lib/onchain/mint.js";
import { daysUntilExpiry, EXPIRY } from "../lib/ingest/manual.js";
import { checkAuthenticity } from "../lib/authenticity.js";
import { rateCompany } from "../lib/rating/index.js";

const SPCX = "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb";
const SPCXX = "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8";
const SPACEX = "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}\n${"-".repeat(title.length)}`);
}

// ---------------------------------------------------------------- phase 1
section("PHASE 1: registry, ingest, on-chain reader");

check("universe cache exists", existsSync(new URL("../../data/cache/universe.json", import.meta.url)));

const u = loadUniverse();
check("cache has tokens", u.tokens.length > 0, `${u.tokens.length}`);
check("cache has companies", u.companies.length > 0, `${u.companies.length}`);
check("on-chain state for every token", Object.keys(u.onchain).length === u.tokens.length,
  `${Object.keys(u.onchain).length}/${u.tokens.length}`);
check("every token has decimals", u.tokens.every((t) => t.decimals !== null));
check("every token maps to a known issuer", u.tokens.every((t) => Boolean(ISSUERS[t.issuerId])));

// Issuer registry integrity: the moat is sourcing, so enforce it.
const unsourced: string[] = [];
for (const issuer of Object.values(ISSUERS)) {
  for (const [field, fact] of Object.entries(issuer)) {
    if (fact && typeof fact === "object" && "value" in fact) {
      const f = fact as { source?: string; verifiedAt?: string };
      if (!f.source?.startsWith("http") || !f.verifiedAt) unsourced.push(`${issuer.id}.${field}`);
    }
  }
}
check("every issuer fact carries a source URL and date", unsourced.length === 0,
  unsourced.length ? unsourced.join(", ") : `${Object.keys(ISSUERS).length} issuers`);

check("mint -> issuer resolution works", issuerForMint(SPCX)?.id === "backpack" &&
  issuerForMint(SPCXX)?.id === "backed" && issuerForMint(SPACEX)?.id === "prestocks");

// ---------------------------------------------------------------- search
section("PHASE 1: search and grouping");

const spacex = search("spacex");
check("search resolves SpaceX", spacex.length > 0);
const sx = spacex[0];
check("SpaceX groups all three tokens", sx?.tokens.length === 3,
  sx?.tokens.map((t) => t.token.symbol).join(", "));
check("SpaceX flagged as contested", sx?.contested === true);
check("grouped by underlying ISIN", sx?.underlyingIsin === "US84615Q1031");
check("three distinct issuers in the group",
  new Set(sx?.tokens.map((t) => t.token.issuerId)).size === 3);
check("byMint resolves to the same company", byMint(SPACEX)?.id === sx?.id);
check("contested() finds SpaceX", contested().some((c) => c.name === "SpaceX"));

// Cross-issuer grouping is the whole thesis. If Apple does not resolve to both
// an xStocks and an Ondo token, the ISIN backfill has regressed.
const apple = search("apple")[0];
check("Apple resolves across issuers", (apple?.tokens.length ?? 0) >= 2,
  apple?.tokens.map((t) => `${t.token.symbol}(${t.token.issuerId})`).join(", "));
check("Apple group mixes xStocks and Ondo",
  new Set(apple?.tokens.map((t) => t.token.issuerId)).size >= 2);
check("many companies carry competing tokens", multiToken().length >= 10,
  `${multiToken().length} multi-token`);
check("SpaceX is structurally contested, Apple is not",
  contested().length >= 1 && contested().every((c) => c.tokens.length > 1),
  `${contested().length} with differing claim structures`);
check("Ondo tokens ingested", u.tokens.some((t) => t.issuerId === "ondo"),
  `${u.tokens.filter((t) => t.issuerId === "ondo").length} Ondo mints`);

// ---------------------------------------------------------------- claims
section("PHASE 1: claim facts that the pitch depends on");

const bySymbol = new Map(sx?.tokens.map((t) => [t.token.symbol, t]) ?? []);
check("SPCX is a custodied entitlement",
  bySymbol.get("SPCX")?.issuer?.structure.value === "custodied_entitlement");
check("SPCXx is securitized exposure",
  bySymbol.get("SPCXx")?.issuer?.structure.value === "securitized_exposure");
check("SPACEX is an SPV interest",
  bySymbol.get("SPACEX")?.issuer?.structure.value === "spv_interest");
check("SPCXx token ISIN differs from the share",
  bySymbol.get("SPCXx")?.token.tokenIsin === "CH1564487366" &&
  bySymbol.get("SPCXx")?.token.underlyingIsin === "US84615Q1031");

check("SPACEX expiry is registered", Boolean(EXPIRY[SPACEX]));
const days = daysUntilExpiry(SPACEX);
check("SPACEX expiry is in the future", days !== null && days > 0, `${days} days`);

check("SPACEX carries a transfer fee",
  (u.onchain[SPACEX]?.transferFee?.basisPoints ?? 0) === 50);
check("SPCX and SPCXx carry no transfer fee",
  !u.onchain[SPCX]?.transferFee && !u.onchain[SPCXX]?.transferFee);
check("SPACEX is single-key controlled",
  u.onchain[SPACEX]?.distinctAuthorities.length === 1);
check("SPACEX has a live multiplier trap", u.onchain[SPACEX]?.multiplierTrap === true);

// ------------------------------------------------------------ authenticity
section("PHASE 1: counterfeit detection");

const realNvdaOn = u.onchain["gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo"];
check("canonical Ondo NVDAon is in the universe", Boolean(realNvdaOn));
if (realNvdaOn) {
  const verdict = checkAuthenticity(realNvdaOn, "ondo");
  check("canonical Ondo mint reads as canonical", verdict.verdict === "canonical",
    verdict.redFlags.join("; ") || "no red flags");
}

// A known impostor: a pump.fun mint named "NVIDIA (Ondo Tokenized)".
const fake = await fetchMint("LNe8SGaLswHwxXshWMSsyGB286dNUJjo8hmUDpepump");
check("impostor mint is readable", fake !== null);
if (fake) {
  const verdict = checkAuthenticity(fake, "ondo");
  check("impostor is rejected as structurally impossible",
    verdict.verdict === "structurally_impossible", verdict.redFlags[0] ?? "");
  check("impostor lacks equity machinery", !fake.pausable && !fake.scaledUiAmount);
}

// ---------------------------------------------------- live network agreement
section("PHASE 1: cache agrees with live chain");

const live = await fetchMint(SPACEX);
check("live RPC read succeeds", live !== null);
if (live) {
  check("live delegate matches cache", live.permanentDelegate === u.onchain[SPACEX]?.permanentDelegate);
  check("live authority count matches cache",
    live.distinctAuthorities.length === u.onchain[SPACEX]?.distinctAuthorities.length);
  check("live multiplier trap still present", hasMultiplierTrap(live),
    `effective ${effectiveMultiplier(live)}`);
}

// ---------------------------------------------------------------- phase 2
section("PHASE 2: rating engine");

const rated = rateCompany(sx!);
const bySym = (s: string) => rated.ratings[
  rated.tokens.find((t) => t.token.symbol === s)?.token.mint ?? ""
];

const spacexRating = bySym("SPACEX");
const spcxRating = bySym("SPCX");
const spcxxRating = bySym("SPCXx");

check("every token in a company gets a rating",
  Object.keys(rated.ratings).length === rated.tokens.length);
check("SPACEX grades worse than SPCX",
  (spacexRating?.grade ?? "A") > (spcxRating?.grade ?? "F"),
  `SPACEX=${spacexRating?.grade} SPCX=${spcxRating?.grade} SPCXx=${spcxxRating?.grade}`);
check("SPACEX is graded F", spacexRating?.grade === "F");
check("every finding carries evidence",
  Object.values(rated.ratings).every((r) => r.findings.every((f) => f.evidence.length > 0)));
check("structure findings carry a source URL",
  Object.values(rated.ratings).every((r) =>
    r.findings.filter((f) => f.source).every((f) => f.source!.startsWith("http"))));
check("SPACEX rating names the expiry",
  spacexRating?.findings.some((f) => /expires in/i.test(f.message)) === true);
check("SPACEX rating names the transfer fee",
  spacexRating?.findings.some((f) => /taxed/i.test(f.message)) === true);
check("SPACEX rating names single-key control",
  spacexRating?.findings.some((f) => /one key controls/i.test(f.message)) === true);
check("SPCX rating recognises portability",
  spcxRating?.findings.some((f) => /brokerage/i.test(f.message)) === true);
check("findings are ordered worst-first",
  Object.values(rated.ratings).every((r) => {
    const rank = { critical: 0, warning: 1, note: 2, good: 3 } as const;
    return r.findings.every((f, i) =>
      i === 0 || rank[r.findings[i - 1]!.severity] <= rank[f.severity]);
  }));

// ---------------------------------------------------------------- summary
const bar = "=".repeat(56);
console.log(`\n${bar}`);
console.log(`passed ${passed}   failed ${failed}`);
if (failed) {
  console.log(`\nFAILURES:`);
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log(bar);
// Set exitCode rather than calling process.exit(): an immediate exit while fetch
// handles are still closing trips a libuv assertion on Windows.
process.exitCode = failed === 0 ? 0 : 1;
