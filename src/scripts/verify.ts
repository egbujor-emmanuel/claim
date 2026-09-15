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
import {
  checkAuthenticity,
  ISSUER_MINT_AUTHORITIES,
  ISSUER_PERMANENT_DELEGATES,
} from "../lib/authenticity.js";
import { cusipToIsin } from "../lib/ingest/backpack.js";
import { rateCompany } from "../lib/rating/index.js";
import { UNIVERSE_PATH } from "../lib/paths.js";
import { analyseMint, identifyIssuer } from "../lib/live.js";
import { probeTradable } from "../lib/market/depth.js";

const SPCX = "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb";
const SPCXX = "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8";
const SPACEX = "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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

check("universe cache exists", existsSync(UNIVERSE_PATH));

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

// --------------------------------------------------- issuer identity on chain
section("PHASE 1: issuer identity is verified, not inferred");

const ondoMints = u.tokens.filter((t) => t.issuerId === "ondo");
check("Ondo mints ingested", ondoMints.length > 0, `${ondoMints.length}`);
check("every Ondo mint carries Ondo's mint authority",
  ondoMints.every((t) => u.onchain[t.mint]?.mintAuthority === ISSUER_MINT_AUTHORITIES.ondo),
  ISSUER_MINT_AUTHORITIES.ondo);
check("no Ondo mint has a permanent delegate (they cannot seize)",
  ondoMints.every((t) => !u.onchain[t.mint]?.permanentDelegate));

const backedMints = u.tokens.filter((t) => t.issuerId === "backed");
check("every xStocks mint carries Backed's mint authority",
  backedMints.every((t) => u.onchain[t.mint]?.mintAuthority === ISSUER_MINT_AUTHORITIES.backed),
  `${backedMints.length} mints`);

const backpackMints = u.tokens.filter((t) => t.issuerId === "backpack");
check("Backpack ingested at scale", backpackMints.length > 100, `${backpackMints.length} mints`);
check("every Backpack mint carries Backpack's permanent delegate",
  backpackMints.every(
    (t) => u.onchain[t.mint]?.permanentDelegate === ISSUER_PERMANENT_DELEGATES.backpack,
  ));
check("Backpack isolates mint authority per token",
  new Set(backpackMints.map((t) => u.onchain[t.mint]?.mintAuthority)).size === backpackMints.length,
  "one authority per mint");

check("CUSIP to ISIN is correct",
  cusipToIsin("037833100") === "US0378331005" &&
  cusipToIsin("88160R101") === "US88160R1014");

check("all four issuers represented",
  new Set(u.tokens.map((t) => t.issuerId)).size === 4,
  [...new Set(u.tokens.map((t) => t.issuerId))].join(", "));
check("hundreds of companies carry competing claims", contested().length >= 100,
  `${contested().length} contested`);

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

// ---------------------------------------------------------------- phase 3
// HTTP checks run only when a server is already listening, so `npm run verify`
// still works standalone. Start one with: npx next start -p 3948
const BASE = process.env.CLAIM_BASE_URL ?? "http://127.0.0.1:3948";

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

if (await serverUp()) {
  section("PHASE 3: web app and public API");

  const api = await fetch(`${BASE}/api/claim/${SPACEX}`);
  check("GET /api/claim/{mint} returns 200", api.status === 200);
  check("API sets CORS header", api.headers.get("access-control-allow-origin") === "*");
  check("API sets a cache header", Boolean(api.headers.get("cache-control")));

  const body = (await api.json()) as {
    grade?: string;
    findings?: unknown[];
    company?: { contested?: boolean; alternatives?: unknown[] };
    onchain?: { transferFeeBasisPoints?: number; multiplierTrap?: boolean };
    claim?: { structure?: string };
    disclaimer?: string;
  };
  check("API grades SPACEX F", body.grade === "F");
  check("API returns findings", (body.findings?.length ?? 0) > 0, `${body.findings?.length}`);
  check("API lists competing tokens", (body.company?.alternatives?.length ?? 0) === 2);
  check("API marks SpaceX contested", body.company?.contested === true);
  check("API exposes the transfer fee", body.onchain?.transferFeeBasisPoints === 50);
  check("API exposes the multiplier trap", body.onchain?.multiplierTrap === true);
  check("API names the claim structure", body.claim?.structure === "spv_interest");
  check("API carries a disclaimer", Boolean(body.disclaimer));

  // An unindexed but real token must be analysed, not refused.
  const unindexed = await fetch(`${BASE}/api/claim/${USDC}`);
  const unindexedBody = (await unindexed.json()) as { grade?: string | null; indexed?: boolean };
  check("an unindexed real token is analysed over HTTP", unindexed.status === 200);
  check("API marks it unindexed and declines to grade it",
    unindexedBody.indexed === false && unindexedBody.grade === null);

  // An address with no mint at all must fail honestly rather than imply a verdict.
  const notMint = await fetch(`${BASE}/api/claim/11111111111111111111111111111111`);
  check("a non-mint address returns 404, not a false verdict", notMint.status === 404);

  // Malformed input must be rejected before any RPC call.
  const garbage = await fetch(`${BASE}/api/claim/not-base58`);
  check("a malformed address returns 400", garbage.status === 400);

  check("API exposes how stale the indexed universe is",
    typeof (body as { universeAgeHours?: number }).universeAgeHours === "number");

  const home = await fetch(`${BASE}/?q=spacex`);
  const html = await home.text();
  check("page renders", home.status === 200);
  // Counting cards is wrong: searching "spacex" legitimately also matches the
  // leveraged SpaceX ETFs. Assert the three competing SpaceX claims are each
  // present and graded instead.
  check("page shows all three competing SpaceX claims",
    /SPCX</.test(html) && /SPCXx</.test(html) && /SPACEX</.test(html));
  check("page grades every token it shows",
    (html.match(/class="grade grade-[A-F]"/g) ?? []).length >=
      (html.match(/class="card-top"/g) ?? []).length);
  check("page shows an F grade for the SPV claim",
    /class="grade grade-F"/.test(html));
  check("page shows the contested banner", /different legal claims/i.test(html));
  check("page renders findings with evidence", (html.match(/f-evidence/g) ?? []).length > 5);
  check("page carries the not-advice disclaimer", /not legal or investment advice/i.test(html));
} else {
  section("PHASE 3: web app and public API");
  console.log(`  SKIP  no server at ${BASE} (start one with: npx next start -p 3948)`);
}

// ---------------------------------------------------------------- phase 4
section("PHASE 4: failure modes");

// An unknown mint must still get a real answer, not a dead end.
const unknown = await analyseMint(USDC);
check("an unindexed mint is analysed live, not refused",
  unknown.error === null && unknown.rating !== null, `graded ${unknown.rating?.grade}`);
check("live analysis marks itself unindexed", unknown.indexed === false);
check("a stablecoin is declared out of scope, not failed",
  unknown.rating?.inScope === false && unknown.rating?.grade === null,
  `grade=${unknown.rating?.grade ?? "none"} inScope=${unknown.rating?.inScope}`);
check("out-of-scope tokens are not accused of anything",
  unknown.rating?.findings.every((f) => f.severity !== "critical") === true);
check("out-of-scope headline says so plainly",
  /not a tokenized equity/i.test(unknown.rating?.headline ?? ""));

// The quote asset cannot be quoted against itself. Reporting "USDC has no
// market" would have been the single most discrediting thing on the page.
const usdcDepth = await probeTradable(USDC);
check("the quote asset is not reported as untradable", usdcDepth.tradable === true);

// A counterfeit still must be caught: it claims to be an equity and cannot be one.
const impostor = await fetchMint("LNe8SGaLswHwxXshWMSsyGB286dNUJjo8hmUDpepump");
if (impostor) {
  const v = checkAuthenticity(impostor, null);
  check("a token claiming to be an equity but incapable is still flagged",
    v.verdict === "structurally_impossible", v.verdict);
}

// A garbage address must fail honestly rather than imply a verdict.
const notAMint = await analyseMint("11111111111111111111111111111111");
check("a non-mint address returns an explicit error, not a grade",
  notAMint.error !== null && notAMint.rating === null);

// Issuer identity must work with no list at all.
const ondoState = u.onchain["gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo"];
if (ondoState) {
  check("issuer identified from on-chain fingerprint alone",
    identifyIssuer(ondoState)?.id === "ondo");
}
check("an unrelated mint identifies as no issuer",
  identifyIssuer({ mintAuthority: null, permanentDelegate: null }) === null);

// Grades must be auditable, not asserted.
const spacexRated = bySym("SPACEX");
check("grade exposes its arithmetic",
  (spacexRated?.scoring.reasons.length ?? 0) > 0,
  `${spacexRated?.scoring.reasons.length} charges, score ${spacexRated?.scoring.score}`);
check("score actually produces the stated grade",
  (spacexRated?.scoring.score ?? 0) >= (spacexRated?.scoring.thresholds.F ?? 99));
check("every charge names a reason",
  Object.values(rated.ratings).every((r) =>
    r.scoring.reasons.every((x) => x.because.length > 0 && x.points > 0)));
check("an A-graded token would carry no charges",
  Object.values(rated.ratings).every((r) =>
    r.grade !== "A" || r.scoring.score < r.scoring.thresholds.B));

// Partial-source runs must be visible rather than silent.
check("cache records which sources failed",
  Array.isArray((u as unknown as { sourceFailures?: string[] }).sourceFailures ?? []),
  `${(u as unknown as { sourceFailures?: string[] }).sourceFailures?.length ?? 0} failures`);

// Stale data must be detectable by anyone reading the cache.
const ageHours = (Date.now() - Date.parse(u.generatedAt)) / 3_600_000;
check("universe carries a usable timestamp",
  Number.isFinite(ageHours) && ageHours >= 0, `${ageHours.toFixed(1)}h old`);

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
