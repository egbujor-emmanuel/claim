import { readFileSync, existsSync } from "node:fs";
import { loadUniverse } from "./search.js";
import { DEPTH_PATH } from "./paths.js";
import type { DepthResult } from "./market/depth.js";

/**
 * Universe-level findings.
 *
 * These are the numbers on the landing page, so each one is computed here from
 * the caches rather than typed into the markup. A figure nobody can regenerate
 * is a figure nobody should trust.
 */

export interface UniverseStats {
  tokens: number;
  /** Mints where some authority can move or burn from any holder's wallet. */
  delegated: number;
  /** Largest number of mints controlled by one permanent-delegate key. */
  largestDelegateReach: number;
  /** The key with that reach. Derived, so prose can never name the wrong one. */
  largestDelegateKey: string | null;
  /** Distinct permanent-delegate keys across the whole universe. */
  delegateKeys: number;
  /** Mints where reading the multiplier field naively gives a wrong balance. */
  multiplierTraps: number;
  /** Worst display error among those, as a percentage of the real balance. */
  worstTrapPct: number | null;
  /** Mints probed for a Jupiter route. */
  probed: number;
  /** Mints with any route at all. */
  routable: number;
  /** Mints measured with a full ladder. */
  laddered: number;
  /** Of those laddered, how many can shift $10k inside 5% slippage. */
  canExit10k: number;
  generatedAt: string;
}

interface DepthCache {
  tradable: Record<string, { tradable: boolean; reason: string | null }>;
  ladders: Record<string, DepthResult>;
}

function loadDepthCache(): DepthCache {
  if (!existsSync(DEPTH_PATH)) return { tradable: {}, ladders: {} };
  return JSON.parse(readFileSync(DEPTH_PATH, "utf8")) as DepthCache;
}

export function universeStats(): UniverseStats {
  const u = loadUniverse();
  const states = Object.values(u.onchain);
  const depth = loadDepthCache();

  const byDelegate = new Map<string, number>();
  for (const s of states) {
    if (s.permanentDelegate) {
      byDelegate.set(s.permanentDelegate, (byDelegate.get(s.permanentDelegate) ?? 0) + 1);
    }
  }

  const trapErrors = states
    .filter((s) => s.multiplierTrap && s.scaledUiAmount)
    .map((s) => {
      const naive = Number(s.scaledUiAmount!.multiplier);
      const real = Number(s.effectiveMultiplier);
      return naive && real ? (naive / real) * 100 : null;
    })
    .filter((v): v is number => v !== null);

  const probes = Object.values(depth.tradable);
  const ladders = Object.values(depth.ladders);

  const ranked = [...byDelegate.entries()].sort((a, b) => b[1] - a[1]);

  return {
    tokens: u.tokens.length,
    delegated: states.filter((s) => s.permanentDelegate).length,
    largestDelegateReach: ranked[0]?.[1] ?? 0,
    largestDelegateKey: ranked[0]?.[0] ?? null,
    delegateKeys: byDelegate.size,
    multiplierTraps: states.filter((s) => s.multiplierTrap).length,
    // The worst trap shows the smallest fraction of the real balance.
    worstTrapPct: trapErrors.length ? Math.min(...trapErrors) : null,
    probed: probes.length,
    routable: probes.filter((p) => p.tradable).length,
    laddered: ladders.length,
    canExit10k: ladders.filter((l) => (l.maxExitUsd ?? 0) >= 10_000).length,
    generatedAt: u.generatedAt,
  };
}
