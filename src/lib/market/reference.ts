import { readPrices } from "./pyth.js";
import { readFileSync, existsSync } from "node:fs";
import { PYTH_FEEDS_PATH } from "../paths.js";
import type { ResolvedToken } from "../search.js";

/**
 * Whether the token is priced like the thing it claims to represent.
 *
 * Claim answers what a claim is and whether you can get out of it. Neither
 * tells you that AAPLx is trading two percent away from Apple. A token can have
 * impeccable structure and still be mispriced, and a holder looking at a wallet
 * has no way to see it: the wallet shows the token's price, and the share it
 * tracks is on an exchange the wallet cannot reach.
 *
 * Pyth publishes the real equity price on Solana, updated within seconds. Its
 * Solana feeds for the tokens themselves are five days stale, so the token side
 * comes from a live Jupiter quote instead -- both halves current, rather than a
 * fresh number against a stale one.
 */

export interface Reference {
  /** Pyth's price for the underlying share. */
  underlyingUsd: number;
  /** How old that price is. A market that is closed publishes nothing new. */
  ageSeconds: number;
  /** Pyth's own uncertainty band on it. */
  confidenceUsd: number;
  feedSymbol: string;
  /** The token's own price, from a live route. */
  tokenUsd: number;
  /** Positive means the token costs more than the share it tracks. */
  premiumPct: number;
}

interface FeedEntry { feedId: string; symbol: string }

let feeds: Record<string, FeedEntry> | null = null;

function feedMap(): Record<string, FeedEntry> {
  if (feeds) return feeds;
  // Via paths.ts, not import.meta.url: under `next start` this module lives in
  // a bundle and a path built from its own URL points nowhere.
  try {
    feeds = existsSync(PYTH_FEEDS_PATH)
      ? (JSON.parse(readFileSync(PYTH_FEEDS_PATH, "utf8")) as Record<string, FeedEntry>)
      : {};
  } catch {
    feeds = {};
  }
  return feeds;
}

/** Whether Claim knows a real-world price feed for this token's underlying. */
export function hasReference(token: ResolvedToken): boolean {
  const sym = token.token.underlyingSymbol;
  return Boolean(sym && feedMap()[sym]);
}

/**
 * The share price, and how far the token sits from it.
 *
 * Returns null rather than a guess whenever either half is missing or the Pyth
 * price is too old to lean on. A stale reference is worse than none: it would
 * report a premium that is really just the market having been closed.
 */
export async function reference(
  token: ResolvedToken,
  tokenUsd: number | null,
  maxAgeSeconds = 900,
): Promise<Reference | null> {
  const sym = token.token.underlyingSymbol;
  if (!sym || !tokenUsd || tokenUsd <= 0) return null;
  const entry = feedMap()[sym];
  if (!entry) return null;

  const prices = await readPrices([entry.feedId]);
  const p = prices.get(entry.feedId.replace(/^0x/, ""));
  if (!p || p.price <= 0) return null;
  if (p.ageSeconds > maxAgeSeconds) return null;

  return {
    underlyingUsd: p.price,
    ageSeconds: p.ageSeconds,
    confidenceUsd: p.confidence,
    feedSymbol: entry.symbol,
    tokenUsd,
    premiumPct: ((tokenUsd - p.price) / p.price) * 100,
  };
}

/**
 * Say what the gap means, if it means anything.
 *
 * Small gaps are spread and timing, not a finding, so they are reported as
 * tracking rather than dressed up as a discovery.
 */
export function describeReference(r: Reference): { message: string; evidence: string; severity: "warning" | "note" | "good" } {
  const gap = Math.abs(r.premiumPct);
  const dir = r.premiumPct > 0 ? "above" : "below";
  const evidence =
    `${r.feedSymbol} $${r.underlyingUsd.toFixed(2)} ±$${r.confidenceUsd.toFixed(2)}, ` +
    `published ${r.ageSeconds}s ago; token $${r.tokenUsd.toFixed(2)} from a live route`;

  if (gap >= 5) {
    return {
      severity: "warning",
      message: `Trading ${gap.toFixed(1)}% ${dir} the share it tracks.`,
      evidence,
    };
  }
  if (gap >= 1.5) {
    return {
      severity: "note",
      message: `Trading ${gap.toFixed(1)}% ${dir} the underlying share.`,
      evidence,
    };
  }
  return {
    severity: "good",
    message: `Tracking the underlying share within ${gap.toFixed(1)}%.`,
    evidence,
  };
}
