/**
 * Full universe scan.
 *
 * Pulls every tokenised equity we can identify, groups them by the security
 * they reference, enriches with on-chain authority state, and writes a cache.
 *
 * All reads. Nothing here signs, spends, or deploys.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { xstocksAdapter } from "../lib/ingest/xstocks.js";
import { manualAdapter } from "../lib/ingest/manual.js";
import { groupByCompany, contestedCompanies, hasMixedIssuers } from "../lib/ingest/companies.js";
import { fetchMints, effectiveMultiplier, hasMultiplierTrap } from "../lib/onchain/mint.js";
import type { TokenRecord } from "../lib/ingest/types.js";

const CACHE_DIR = new URL("../../data/cache/", import.meta.url);

function log(msg: string) {
  console.log(`[scan] ${msg}`);
}

const started = Date.now();

log("fetching issuer registries...");
const batches = await Promise.all([xstocksAdapter.fetchTokens(), manualAdapter.fetchTokens()]);

const tokens: TokenRecord[] = [];
const seen = new Set<string>();
for (const batch of batches) {
  for (const t of batch) {
    if (!seen.has(t.mint)) {
      seen.add(t.mint);
      tokens.push(t);
    }
  }
}
log(`${tokens.length} tokens across ${new Set(tokens.map((t) => t.issuerId)).size} issuers`);

log("grouping by underlying security...");
const companies = groupByCompany(tokens);
const contested = contestedCompanies(companies);
log(`${companies.length} companies, ${contested.length} with more than one token`);

log(`reading on-chain state for ${tokens.length} mints...`);
const chain = await fetchMints(tokens.map((t) => t.mint));
log(`${chain.size} mints read`);

// Backfill decimals the issuer APIs do not publish.
for (const token of tokens) {
  const state = chain.get(token.mint);
  if (state && token.decimals === null) token.decimals = state.decimals;
}

const withDelegate = [...chain.values()].filter((s) => s.permanentDelegate);
const withPause = [...chain.values()].filter((s) => s.pausable);
const pausedNow = [...chain.values()].filter((s) => s.pausable?.paused);
const withFee = [...chain.values()].filter((s) => (s.transferFee?.basisPoints ?? 0) > 0);
const withHook = [...chain.values()].filter((s) => s.transferHook?.programId);
const singleKey = [...chain.values()].filter((s) => s.distinctAuthorities.length === 1);
const traps = [...chain.values()].filter((s) => hasMultiplierTrap(s));
const haltedByIssuer = tokens.filter((t) => t.halted);

mkdirSync(CACHE_DIR, { recursive: true });
const payload = {
  generatedAt: new Date().toISOString(),
  counts: {
    tokens: tokens.length,
    companies: companies.length,
    contestedCompanies: contested.length,
    mintsRead: chain.size,
  },
  tokens,
  companies: companies.map((c) => ({ ...c, mixedIssuers: hasMixedIssuers(c) })),
  onchain: Object.fromEntries(
    [...chain.entries()].map(([mint, state]) => [
      mint,
      { ...state, effectiveMultiplier: effectiveMultiplier(state), multiplierTrap: hasMultiplierTrap(state) },
    ]),
  ),
};
writeFileSync(new URL("universe.json", CACHE_DIR), JSON.stringify(payload, null, 1));

const bar = "=".repeat(64);
console.log(`\n${bar}\nUNIVERSE\n${bar}`);
console.log(`tokens                      ${tokens.length}`);
console.log(`companies                   ${companies.length}`);
console.log(`companies with >1 token     ${contested.length}`);
console.log(`\n--- issuer powers over holders ---`);
console.log(`permanent delegate active   ${withDelegate.length}  (can move/burn from any wallet)`);
console.log(`pausable                    ${withPause.length}`);
console.log(`paused right now            ${pausedNow.length}`);
console.log(`transfer fee > 0            ${withFee.length}`);
console.log(`transfer hook program set   ${withHook.length}`);
console.log(`single key controls all     ${singleKey.length}`);
console.log(`\n--- correctness hazards ---`);
console.log(`multiplier traps            ${traps.length}  (naive integrators show wrong balance)`);
console.log(`halted by issuer            ${haltedByIssuer.length}`);

if (contested.length) {
  console.log(`\n--- companies with competing claims ---`);
  for (const c of contested.slice(0, 10)) {
    const detail = c.tokens.map((t) => `${t.symbol}(${t.issuerId})`).join("  ");
    console.log(`  ${c.name.padEnd(28)} ${detail}`);
  }
}

console.log(`\ncache -> data/cache/universe.json`);
console.log(`elapsed ${((Date.now() - started) / 1000).toFixed(1)}s\n${bar}\n`);
