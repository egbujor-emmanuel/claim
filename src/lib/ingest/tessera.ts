import type { Adapter, TokenRecord } from "./types.js";
import { resolveUnderlying } from "./aliases.js";

/**
 * Tessera adapter.
 *
 * Public, unauthenticated: https://rest-api.tessera.pe/v1/public/tokens
 * (the documented /token-details endpoint returns HTTP 500 as of 2026-09-16,
 * so the token list is used instead.)
 *
 * Tessera matters to Claim because its tokens are not equity in any form, and
 * the issuer says so plainly in the token's own on-chain metadata:
 *
 *   "T-OpenAI represents a loan participation right which provides economic
 *    exposure to OpenAI and is redeemable following divestment of the
 *    underlying exposure. This is a loan product, not a security - token
 *    holders have no ownership, voting, or dividend rights in OpenAI."
 *
 * That is the clearest statement of structure any issuer in this space
 * publishes, and it lands a token next to three others referencing the same
 * company while conferring something entirely different: the holder is a
 * creditor, not an owner, and cannot redeem until the lender divests.
 */

const API = "https://rest-api.tessera.pe/v1/public/tokens";

interface TesseraToken {
  token?: string;
  symbol?: string;
  name?: string;
  latest_supply?: string;
  uri?: string;
}

/** "tOpenAI" -> "OPENAI", so it groups with other representations. */
function underlyingOf(symbol: string): string {
  return symbol.replace(/^t[-_]?/i, "").toUpperCase();
}

export const tesseraAdapter: Adapter = {
  issuerId: "tessera",

  async fetchTokens(): Promise<TokenRecord[]> {
    const fetchedAt = new Date().toISOString();

    const res = await fetch(API);
    if (!res.ok) throw new Error(`Tessera API: HTTP ${res.status}`);
    const body = (await res.json()) as
      | TesseraToken[]
      | { data?: TesseraToken[]; tokens?: TesseraToken[] };
    const tokens = Array.isArray(body) ? body : (body.data ?? body.tokens ?? []);

    const out: TokenRecord[] = [];
    const seen = new Set<string>();

    for (const t of tokens) {
      const mint = t.token;
      const symbol = t.symbol;
      if (!mint || !symbol || seen.has(mint)) continue;
      seen.add(mint);

      out.push({
        mint,
        symbol,
        name: t.name ?? symbol,
        issuerId: "tessera",
        underlyingSymbol: resolveUnderlying(underlyingOf(symbol)).symbol,
        underlyingIsin: resolveUnderlying(underlyingOf(symbol)).isin,
        tokenIsin: null,
        decimals: null, // read from chain during the scan
        halted: false,
        issuance: false,
        // Redeemable only once the issuer divests the underlying exposure, which
        // is not redemption a holder can initiate.
        redemption: false,
        minOrderUsd: null,
        sourceUrl: API,
        fetchedAt,
      });
    }

    return out;
  },
};
