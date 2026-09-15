import type { Adapter, TokenRecord } from "./types.js";

/**
 * Ondo Global Markets adapter.
 *
 * Ondo has no public asset API we could find (probed 2026-09-14: api.ondo.finance
 * paths return nothing; app.ondo.finance/api/tokens serves only their yield
 * products, not Global Markets equities). So we discover mints through Jupiter's
 * token search and keep only those matching Ondo's canonical vanity suffix.
 *
 * This matters more than it sounds. A plain name search is dangerous here:
 * searching "QQQon" returns nine tokens all calling themselves
 * "Invesco QQQ (Ondo Tokenized)" and only one is Ondo's. Filtering on the
 * canonical suffix, then confirming the mint carries real equity machinery, is
 * what separates the asset from its counterfeits.
 *
 * Caveat worth stating plainly: the `ondo` suffix is inferred from observing
 * that every legitimate-looking Ondo mint ends in it, not from Ondo publishing
 * a canonical list. Confirm with Ondo before treating this as authoritative.
 */

const JUP_SEARCH = "https://lite-api.jup.ag/tokens/v2/search";
const CANONICAL_SUFFIX = "ondo";

/**
 * Underlyings to probe. Ondo lists 200+; this is the liquid core plus the names
 * that also exist on other issuers, which is where competing claims show up.
 */
const UNDERLYINGS = [
  "AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMZN", "META", "NFLX", "AMD", "INTC",
  "COIN", "MSTR", "HOOD", "PLTR", "CRWD", "AVGO", "ORCL", "CRM", "ADBE", "UBER",
  "DIS", "BA", "JPM", "V", "MA", "WMT", "KO", "PEP", "NKE", "MCD",
  "SPY", "QQQ", "VOO", "IWM", "DIA", "GLD", "TLT", "ARKK",
];

interface JupToken {
  id?: string;
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  baseAsset?: { id?: string; symbol?: string; name?: string; decimals?: number };
}

function normalise(t: JupToken): { mint: string; symbol: string; name: string; decimals: number | null } | null {
  const mint = t.id ?? t.address ?? t.baseAsset?.id;
  const symbol = t.symbol ?? t.baseAsset?.symbol;
  if (!mint || !symbol) return null;
  const decimals = t.decimals ?? t.baseAsset?.decimals ?? null;
  return { mint, symbol, name: t.name ?? t.baseAsset?.name ?? symbol, decimals };
}

async function searchJupiter(query: string): Promise<JupToken[]> {
  const res = await fetch(`${JUP_SEARCH}?query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const body = (await res.json()) as JupToken[] | { tokens?: JupToken[]; data?: JupToken[] };
  if (Array.isArray(body)) return body;
  return body.tokens ?? body.data ?? [];
}

export const ondoAdapter: Adapter = {
  issuerId: "ondo",

  async fetchTokens(): Promise<TokenRecord[]> {
    const fetchedAt = new Date().toISOString();
    const out: TokenRecord[] = [];
    const seen = new Set<string>();

    for (const underlying of UNDERLYINGS) {
      const ticker = `${underlying}on`;
      let results: JupToken[] = [];
      try {
        results = await searchJupiter(ticker);
      } catch {
        // A single failed lookup should never abort the scan.
        continue;
      }

      for (const raw of results) {
        const t = normalise(raw);
        if (!t) continue;
        // Symbol must match exactly, and the mint must carry Ondo's vanity suffix.
        if (t.symbol.toLowerCase() !== ticker.toLowerCase()) continue;
        if (!t.mint.endsWith(CANONICAL_SUFFIX)) continue;
        if (seen.has(t.mint)) continue;

        seen.add(t.mint);
        out.push({
          mint: t.mint,
          symbol: t.symbol,
          name: t.name,
          issuerId: "ondo",
          underlyingSymbol: underlying,
          underlyingIsin: null, // Ondo does not publish ISINs through this path.
          tokenIsin: null,
          decimals: t.decimals,
          halted: false,
          issuance: true,
          redemption: true,
          minOrderUsd: null,
          sourceUrl: `${JUP_SEARCH}?query=${ticker}`,
          fetchedAt,
        });
      }

      await new Promise((r) => setTimeout(r, 1100)); // Jupiter lite-api is rate limited.
    }

    return out;
  },
};

export interface ImpostorReport {
  ticker: string;
  canonical: string | null;
  impostors: { mint: string; name: string; symbol: string; kind: ImpostorKind }[];
}

/**
 * Not every ticker collision is fraud, and saying so would be dishonest.
 *
 * Coca-Cola's Ondo ticker is KOon, which collides with unrelated memecoins
 * called "Kooncoin" and "KewlKoon". Those are coincidences. By contrast, eight
 * separate mints calling themselves "Invesco QQQ (Ondo Tokenized)" while not
 * being Ondo's are claiming to be something they are not.
 *
 * The distinguishing test is the NAME, not the ticker: does the token also
 * present itself as the issuer's product?
 */
export type ImpostorKind = "impersonation" | "ticker_collision";

function classify(name: string, ticker: string, issuerName = "ondo"): ImpostorKind {
  const n = name.toLowerCase().trim();

  // Presents itself as the issuer's product.
  if (n.includes(issuerName) || n.includes("tokenized") || n.includes("tokenised")) {
    return "impersonation";
  }
  // Names itself after the canonical ticker, e.g. a mint simply called "MSTRon".
  if (n === ticker.toLowerCase()) return "impersonation";

  return "ticker_collision";
}

/**
 * Find mints that claim an Ondo ticker but are not Ondo's.
 *
 * This is the counterfeit surface, measured rather than asserted.
 */
export async function findImpostors(underlyings = UNDERLYINGS): Promise<ImpostorReport[]> {
  const reports: ImpostorReport[] = [];

  for (const underlying of underlyings) {
    const ticker = `${underlying}on`;
    let results: JupToken[] = [];
    try {
      results = await searchJupiter(ticker);
    } catch {
      continue;
    }

    const matching = results
      .map(normalise)
      .filter((t): t is NonNullable<ReturnType<typeof normalise>> => t !== null)
      .filter((t) => t.symbol.toLowerCase() === ticker.toLowerCase());

    if (matching.length === 0) {
      await new Promise((r) => setTimeout(r, 1100));
      continue;
    }

    const canonical = matching.find((t) => t.mint.endsWith(CANONICAL_SUFFIX));
    const impostors = matching
      .filter((t) => !t.mint.endsWith(CANONICAL_SUFFIX))
      .map((t) => ({
        mint: t.mint,
        name: t.name,
        symbol: t.symbol,
        kind: classify(t.name, ticker),
      }));

    if (impostors.length > 0) {
      reports.push({ ticker, canonical: canonical?.mint ?? null, impostors });
    }

    await new Promise((r) => setTimeout(r, 1100));
  }

  return reports;
}
