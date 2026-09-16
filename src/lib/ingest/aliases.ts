/**
 * Pre-IPO token symbols mapped to the ticker their company now trades under.
 *
 * Pre-IPO issuers name tokens after the company, not a ticker, because no
 * ticker existed when the token launched. Once the company lists, that naming
 * silently splits the same company into two groups: PreStocks' SPACEX and
 * Tessera's tSpaceX in one, Backpack's SPCX and xStocks' SPCXx in another —
 * which hides the single most important comparison Claim can draw.
 *
 * Only companies that have actually listed belong here. Anthropic and OpenAI
 * are still private, so their tokens correctly group on their own.
 */
export const PRE_IPO_ALIASES: Record<string, { symbol: string; isin: string | null }> = {
  // SpaceX listed on Nasdaq on 12 June 2026 under SPCX.
  SPACEX: { symbol: "SPCX", isin: "US84615Q1031" },
};

export function resolveUnderlying(symbol: string): { symbol: string; isin: string | null } {
  return PRE_IPO_ALIASES[symbol.toUpperCase()] ?? { symbol: symbol.toUpperCase(), isin: null };
}
