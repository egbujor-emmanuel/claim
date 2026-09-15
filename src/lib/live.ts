import { fetchMint, effectiveMultiplier, hasMultiplierTrap } from "./onchain/mint.js";
import {
  checkAuthenticity,
  ISSUER_MINT_AUTHORITIES,
  ISSUER_PERMANENT_DELEGATES,
} from "./authenticity.js";
import { ISSUERS } from "../data/issuers.js";
import { gradeClaim, type ClaimRating } from "./rating/grade.js";
import { byMint, type ResolvedCompany } from "./search.js";
import { probeTradable } from "./market/depth.js";
import type { Issuer } from "./types.js";
import type { TokenRecord } from "./ingest/types.js";

/**
 * Analyse any mint, indexed or not.
 *
 * A tool that can only answer about assets it pre-indexed is not much use: the
 * first thing anyone does is paste an address it has never seen, and that is
 * exactly the moment a counterfeit check matters most. So an unknown mint is
 * read live from chain and identified by its on-chain fingerprint rather than
 * refused.
 *
 * This is also where the fingerprint approach earns its keep. We do not need a
 * list to say "this was minted by Ondo" — we can check.
 */

export interface LiveAnalysis {
  mint: string;
  /** True when the mint was already in the indexed universe. */
  indexed: boolean;
  /** Present when the mint resolves to a company we track. */
  company: ResolvedCompany | null;
  rating: ClaimRating | null;
  /** Set when the mint is not a token account at all. */
  error: string | null;
}

/** Identify an issuer purely from on-chain fingerprints. No list required. */
export function identifyIssuer(state: {
  mintAuthority: string | null;
  permanentDelegate: string | null;
}): Issuer | null {
  for (const [id, authority] of Object.entries(ISSUER_MINT_AUTHORITIES)) {
    if (state.mintAuthority === authority) return ISSUERS[id] ?? null;
  }
  for (const [id, delegate] of Object.entries(ISSUER_PERMANENT_DELEGATES)) {
    if (state.permanentDelegate === delegate) return ISSUERS[id] ?? null;
  }
  return null;
}

export async function analyseMint(mint: string): Promise<LiveAnalysis> {
  // Prefer the indexed record: it carries issuer metadata and competing claims.
  const company = byMint(mint);
  if (company) {
    const resolved = company.tokens.find((t) => t.token.mint === mint);
    if (resolved) {
      const { rateToken } = await import("./rating/index.js");
      return {
        mint,
        indexed: true,
        company,
        rating: rateToken(resolved),
        error: null,
      };
    }
  }

  const state = await fetchMint(mint);
  if (!state) {
    return {
      mint,
      indexed: false,
      company: null,
      rating: null,
      error:
        "No mint account exists at this address on Solana mainnet. It may be a wallet, a program, or a typo.",
    };
  }

  const issuer = identifyIssuer(state);

  // Enough of a TokenRecord to grade. Fields we genuinely do not know stay null
  // rather than being guessed at.
  const token: TokenRecord = {
    mint,
    symbol: state.symbol ?? mint.slice(0, 6),
    name: state.name ?? "Unknown token",
    issuerId: issuer?.id ?? "unknown",
    underlyingSymbol: null,
    underlyingIsin: null,
    tokenIsin: null,
    decimals: state.decimals,
    halted: false,
    issuance: false,
    redemption: false,
    minOrderUsd: null,
    sourceUrl: "live Solana RPC read",
    fetchedAt: state.fetchedAt,
  };

  let depth = null;
  try {
    const probe = await probeTradable(mint);
    depth = probe.tradable
      ? null // tradable but unmeasured: say nothing rather than guess at depth
      : {
          mint,
          tradable: false,
          reason: probe.reason,
          priceUsd: null,
          rungs: [],
          maxExitUsd: null,
          checkedAt: new Date().toISOString(),
        };
  } catch {
    depth = null; // a quote failure must not block the structural verdict
  }

  return {
    mint,
    indexed: false,
    company: null,
    rating: gradeClaim({ token, issuer, onchain: state, depth }),
    error: null,
  };
}

export { checkAuthenticity, effectiveMultiplier, hasMultiplierTrap };
