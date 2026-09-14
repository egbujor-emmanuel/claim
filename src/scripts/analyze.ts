/**
 * Sanity-check the headline findings from the scan before any of them go on
 * screen. A striking number that turns out to be a parsing artifact is worse
 * than no number at all.
 */
import { readFileSync } from "node:fs";

interface CachedState {
  mint: string;
  symbol?: string;
  decimals: number;
  permanentDelegate: string | null;
  pausable: { authority: string | null; paused: boolean } | null;
  distinctAuthorities: string[];
  scaledUiAmount: {
    multiplier: string;
    newMultiplier: string;
    newMultiplierEffectiveTimestamp: number;
  } | null;
  effectiveMultiplier: string;
  multiplierTrap: boolean;
}

const cache = JSON.parse(
  readFileSync(new URL("../../data/cache/universe.json", import.meta.url), "utf8"),
) as { onchain: Record<string, CachedState> };

const states = Object.values(cache.onchain);
const bar = "=".repeat(64);

// --- 1. Is "100% permanent delegate" real, or one issuer repeated? ---
console.log(`\n${bar}\n1. PERMANENT DELEGATE CONCENTRATION\n${bar}`);
const byDelegate = new Map<string, number>();
for (const s of states) {
  if (s.permanentDelegate) byDelegate.set(s.permanentDelegate, (byDelegate.get(s.permanentDelegate) ?? 0) + 1);
}
console.log(`mints with a permanent delegate: ${[...byDelegate.values()].reduce((a, b) => a + b, 0)}/${states.length}`);
console.log(`distinct delegate keys:          ${byDelegate.size}\n`);
for (const [key, count] of [...byDelegate.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}  controls ${count} mints`);
}

// --- 2. How wrong are the multiplier traps, actually? ---
console.log(`\n${bar}\n2. MULTIPLIER TRAP MAGNITUDE\n${bar}`);
const traps = states.filter((s) => s.multiplierTrap && s.scaledUiAmount);
const errors = traps
  .map((s) => {
    const naive = Number(s.scaledUiAmount!.multiplier);
    const real = Number(s.effectiveMultiplier);
    if (!naive || !real) return null;
    return { symbol: s.symbol ?? s.mint.slice(0, 6), errorPct: (naive / real - 1) * 100 };
  })
  .filter((x): x is { symbol: string; errorPct: number } => x !== null)
  .sort((a, b) => Math.abs(b.errorPct) - Math.abs(a.errorPct));

console.log(`tokens with an already-effective scheduled multiplier: ${traps.length}/${states.length}`);
const buckets = { "under 0.1%": 0, "0.1-1%": 0, "1-10%": 0, "over 10%": 0 };
for (const e of errors) {
  const a = Math.abs(e.errorPct);
  if (a < 0.1) buckets["under 0.1%"]++;
  else if (a < 1) buckets["0.1-1%"]++;
  else if (a < 10) buckets["1-10%"]++;
  else buckets["over 10%"]++;
}
console.log(`\nsize of the display error if you read the multiplier field naively:`);
for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(12)} ${v}`);
console.log(`\nworst offenders:`);
for (const e of errors.slice(0, 8)) {
  console.log(`  ${e.symbol.padEnd(10)} shows ${e.errorPct.toFixed(2)}% vs reality`);
}

// --- 3. Authority concentration across the universe ---
console.log(`\n${bar}\n3. AUTHORITY CONCENTRATION\n${bar}`);
const byCount = new Map<number, number>();
for (const s of states) byCount.set(s.distinctAuthorities.length, (byCount.get(s.distinctAuthorities.length) ?? 0) + 1);
for (const [n, c] of [...byCount.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${n} distinct authority key(s): ${c} mints${n === 1 ? "  <-- single point of control" : ""}`);
}
console.log(`\n${bar}\n`);
