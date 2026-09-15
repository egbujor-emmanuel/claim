import type { Adapter, TokenRecord } from "./types.js";
import { fetchMints } from "../onchain/mint.js";

/**
 * Ondo Global Markets adapter.
 *
 * Ondo publishes no public asset API (probed 2026-09-14: api.ondo.finance paths
 * return nothing, and app.ondo.finance/api/tokens serves only their yield
 * products). So mints are discovered through Jupiter's token search and then
 * VERIFIED ON CHAIN.
 *
 * Verification is what makes this exact rather than a guess. Every Ondo Global
 * Markets mint is minted by one authority:
 *
 *   9foMHsSDq7nMg4WPusSz9eY7tyxyukqborA8GyU5cUxD
 *
 * and carries the same Token-2022 extension signature — scaled UI amount,
 * pausable and transfer hook — matching the extension set in Ondo's own
 * open-source Global Markets program. A mint either has that authority or it
 * does not; there is nothing to infer. Confirmed across every Ondo mint found:
 * 35 of 35 share the authority, 35 of 35 share the signature.
 *
 * The vanity suffix is used only to narrow search candidates cheaply. It never
 * decides inclusion.
 */

const JUP_SEARCH = "https://lite-api.jup.ag/tokens/v2/search";

/** The on-chain identity of Ondo Global Markets. Verified, not inferred. */
export const ONDO_GM_MINT_AUTHORITY = "9foMHsSDq7nMg4WPusSz9eY7tyxyukqborA8GyU5cUxD";

/** Cheap pre-filter for search candidates. Inclusion is decided on chain. */
const VANITY_SUFFIX = "ondo";

const UNDERLYINGS = [
  "AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMZN", "META", "NFLX", "AMD", "INTC",
  "COIN", "MSTR", "HOOD", "PLTR", "CRWD", "AVGO", "ORCL", "CRM", "ADBE", "UBER",
  "DIS", "BA", "JPM", "V", "MA", "WMT", "KO", "PEP", "NKE", "MCD",
  "SPY", "QQQ", "VOO", "IWM", "DIA", "GLD", "TLT", "ARKK",
  "ABNB", "ACN", "ADI", "AMAT", "ANET", "AXP", "BAC", "BLK", "BMY", "C",
  "CAT", "CSCO", "CVX", "DE", "GE", "GS", "HD", "HON", "IBM", "JNJ",
  "LLY", "LMT", "LRCX", "MRK", "MU", "NOW", "PFE", "PG", "PYPL", "QCOM",
  "RTX", "SBUX", "SHOP", "SNOW", "SQ", "T", "TMO", "TXN", "UNH", "UPS",
  "VZ", "XOM", "ZM", "SMH", "XLE", "XLF", "XLK", "VTI", "VUG", "SCHD",
];

interface JupToken {
  id?: string;
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  baseAsset?: { id?: string; symbol?: string; name?: string; decimals?: number };
}

interface Candidate {
  mint: string;
  symbol: string;
  name: string;
  decimals: number | null;
  underlying: string;
}

function normalise(t: JupToken) {
  const mint = t.id ?? t.address ?? t.baseAsset?.id;
  const symbol = t.symbol ?? t.baseAsset?.symbol;
  if (!mint || !symbol) return null;
  return {
    mint,
    symbol,
    name: t.name ?? t.baseAsset?.name ?? symbol,
    decimals: t.decimals ?? t.baseAsset?.decimals ?? null,
  };
}

async function searchJupiter(query: string): Promise<JupToken[]> {
  const res = await fetch(`${JUP_SEARCH}?query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const body = (await res.json()) as JupToken[] | { tokens?: JupToken[]; data?: JupToken[] };
  return Array.isArray(body) ? body : (body.tokens ?? body.data ?? []);
}

/** Does this mint actually belong to Ondo Global Markets? Decided on chain. */
export async function verifyOndoMints(mints: string[]): Promise<Set<string>> {
  const states = await fetchMints(mints);
  const verified = new Set<string>();
  for (const [mint, state] of states) {
    const authorityMatches = state.mintAuthority === ONDO_GM_MINT_AUTHORITY;
    const signatureMatches =
      Boolean(state.scaledUiAmount) && Boolean(state.pausable) && Boolean(state.transferHook);
    if (authorityMatches && signatureMatches) verified.add(mint);
  }
  return verified;
}

export const ondoAdapter: Adapter = {
  issuerId: "ondo",

  async fetchTokens(): Promise<TokenRecord[]> {
    const fetchedAt = new Date().toISOString();
    const candidates: Candidate[] = [];
    const seen = new Set<string>();

    for (const underlying of UNDERLYINGS) {
      const ticker = `${underlying}on`;
      let results: JupToken[] = [];
      try {
        results = await searchJupiter(ticker);
      } catch {
        continue; // one failed lookup must never abort the scan
      }

      for (const raw of results) {
        const t = normalise(raw);
        if (!t) continue;
        if (t.symbol.toLowerCase() !== ticker.toLowerCase()) continue;
        if (!t.mint.endsWith(VANITY_SUFFIX)) continue; // cheap pre-filter only
        if (seen.has(t.mint)) continue;
        seen.add(t.mint);
        candidates.push({ ...t, underlying });
      }

      await new Promise((r) => setTimeout(r, 1100)); // Jupiter lite-api rate limit
    }

    // Inclusion is decided here, on chain, not by the address shape.
    const verified = await verifyOndoMints(candidates.map((c) => c.mint));

    return candidates
      .filter((c) => verified.has(c.mint))
      .map((c) => ({
        mint: c.mint,
        symbol: c.symbol,
        name: c.name,
        issuerId: "ondo",
        underlyingSymbol: c.underlying,
        underlyingIsin: null, // resolved by the ticker->ISIN backfill at grouping
        tokenIsin: null,
        decimals: c.decimals,
        halted: false,
        issuance: true,
        redemption: true,
        minOrderUsd: null,
        sourceUrl: `on-chain mint authority ${ONDO_GM_MINT_AUTHORITY}`,
        fetchedAt,
      }));
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
  if (n.includes(issuerName) || n.includes("tokenized") || n.includes("tokenised")) {
    return "impersonation";
  }
  if (n === ticker.toLowerCase()) return "impersonation";
  return "ticker_collision";
}

/** Mints claiming an Ondo ticker that fail on-chain verification. */
export async function findImpostors(underlyings = UNDERLYINGS.slice(0, 38)): Promise<ImpostorReport[]> {
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

    const verified = await verifyOndoMints(matching.map((m) => m.mint));
    const canonical = matching.find((t) => verified.has(t.mint));
    const impostors = matching
      .filter((t) => !verified.has(t.mint))
      .map((t) => ({ mint: t.mint, name: t.name, symbol: t.symbol, kind: classify(t.name, ticker) }));

    if (impostors.length > 0) {
      reports.push({ ticker, canonical: canonical?.mint ?? null, impostors });
    }

    await new Promise((r) => setTimeout(r, 1100));
  }

  return reports;
}
