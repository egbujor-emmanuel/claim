import type { Company, TokenRecord } from "./types.js";

/**
 * Group tokens by the security they actually reference.
 *
 * This is the step that makes the thesis visible. Search "SpaceX" and you get
 * one company with three tokens underneath it, not three unrelated SPL mints.
 *
 * Grouping key is the underlying ISIN when the issuer publishes one, because
 * tickers collide across venues and issuers spell them differently. Ticker is
 * the fallback.
 */

/**
 * Build a ticker -> ISIN map from whichever issuers publish ISINs.
 *
 * Without this, grouping silently fails exactly where it matters most. xStocks
 * publishes an ISIN for AAPLx, Ondo publishes none for AAPLon, so keying on
 * "isin:US0378331005" and "sym:AAPL" puts the same company in two buckets and
 * the tool reports zero competing claims for Apple. Backfilling first is what
 * makes cross-issuer comparison work at all.
 */
function buildIsinIndex(tokens: TokenRecord[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const token of tokens) {
    if (token.underlyingSymbol && token.underlyingIsin) {
      index.set(token.underlyingSymbol.toUpperCase(), token.underlyingIsin);
    }
  }
  return index;
}

function keyFor(token: TokenRecord, isinIndex: Map<string, string>): string | null {
  const symbol = token.underlyingSymbol?.toUpperCase();
  const isin = token.underlyingIsin ?? (symbol ? isinIndex.get(symbol) : undefined);
  if (isin) return `isin:${isin}`;
  if (symbol) return `sym:${symbol}`;
  return null;
}

/** Strip issuer decoration to recover a readable company name. */
function displayName(token: TokenRecord): string {
  return token.name
    .replace(/\s*[-–]\s*Backpack Securities\s*$/i, "")
    .replace(/\s+xStock$/i, "")
    .replace(/\s+PreStocks$/i, "")
    .trim();
}

export function groupByCompany(tokens: TokenRecord[]): Company[] {
  const isinIndex = buildIsinIndex(tokens);
  const buckets = new Map<string, TokenRecord[]>();

  for (const token of tokens) {
    const key = keyFor(token, isinIndex);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(token);
    else buckets.set(key, [token]);
  }

  const companies: Company[] = [];
  for (const [id, group] of buckets) {
    const first = group[0];
    if (!first) continue;
    // Prefer a name and ISIN from a token that actually carries them.
    const named = group.find((t) => t.underlyingIsin) ?? first;
    companies.push({
      id,
      name: displayName(named),
      underlyingSymbol: named.underlyingSymbol ?? first.underlyingSymbol,
      underlyingIsin: named.underlyingIsin ?? null,
      // Most representations first: those are the interesting rows.
      tokens: [...group].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    });
  }

  return companies.sort((a, b) => {
    if (b.tokens.length !== a.tokens.length) return b.tokens.length - a.tokens.length;
    return a.name.localeCompare(b.name);
  });
}

/** Companies represented by more than one token: where claim differences bite. */
export function contestedCompanies(companies: Company[]): Company[] {
  return companies.filter((c) => c.tokens.length > 1);
}

/** Do these tokens come from issuers with materially different structures? */
export function hasMixedIssuers(company: Company): boolean {
  return new Set(company.tokens.map((t) => t.issuerId)).size > 1;
}
