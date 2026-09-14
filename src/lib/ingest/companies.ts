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

function keyFor(token: TokenRecord): string | null {
  if (token.underlyingIsin) return `isin:${token.underlyingIsin}`;
  if (token.underlyingSymbol) return `sym:${token.underlyingSymbol.toUpperCase()}`;
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
  const buckets = new Map<string, TokenRecord[]>();

  for (const token of tokens) {
    const key = keyFor(token);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(token);
    else buckets.set(key, [token]);
  }

  const companies: Company[] = [];
  for (const [id, group] of buckets) {
    const first = group[0];
    if (!first) continue;
    companies.push({
      id,
      name: displayName(first),
      underlyingSymbol: first.underlyingSymbol,
      underlyingIsin: first.underlyingIsin,
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
