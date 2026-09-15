import { readFileSync, existsSync } from "node:fs";
import type { DepthResult } from "../market/depth.js";
import type { ResolvedCompany, ResolvedToken } from "../search.js";
import { gradeClaim, type ClaimRating } from "./grade.js";
import { DEPTH_PATH } from "../paths.js";

export * from "./grade.js";

interface DepthCache {
  tradable: Record<string, { tradable: boolean; reason: string | null }>;
  ladders: Record<string, DepthResult>;
}

let depthCache: DepthCache | null = null;

function loadDepth(): DepthCache {
  if (depthCache) return depthCache;
  depthCache = existsSync(DEPTH_PATH)
    ? (JSON.parse(readFileSync(DEPTH_PATH, "utf8")) as DepthCache)
    : { tradable: {}, ladders: {} };
  return depthCache;
}

/**
 * Depth for a mint, preferring a full ladder and falling back to the cheap
 * tradability probe. Returns null when we have measured nothing, so the rating
 * omits exit findings rather than inventing them.
 */
export function depthFor(mint: string): DepthResult | null {
  const cache = loadDepth();
  const ladder = cache.ladders[mint];
  if (ladder) return ladder;

  const probe = cache.tradable[mint];
  if (!probe) return null;
  if (probe.tradable) return null; // tradable but unmeasured: say nothing rather than guess

  return {
    mint,
    tradable: false,
    reason: probe.reason,
    priceUsd: null,
    rungs: [],
    maxExitUsd: null,
    checkedAt: "",
  };
}

export function rateToken(resolved: ResolvedToken): ClaimRating {
  return gradeClaim({
    token: resolved.token,
    issuer: resolved.issuer,
    onchain: resolved.onchain,
    depth: depthFor(resolved.token.mint),
  });
}

export interface RatedCompany extends ResolvedCompany {
  ratings: Record<string, ClaimRating>;
}

export function rateCompany(company: ResolvedCompany): RatedCompany {
  const ratings: Record<string, ClaimRating> = {};
  for (const token of company.tokens) ratings[token.token.mint] = rateToken(token);
  return { ...company, ratings };
}
