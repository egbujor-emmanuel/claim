import type { Adapter, TokenRecord } from "./types.js";
import { resolveUnderlying } from "./aliases.js";

/**
 * PreStocks adapter.
 *
 * Public, unauthenticated: https://prestocks.com/api/prestocks
 *
 * This is the most consequential catalogue Claim indexes. PreStocks is the
 * issuer whose Anthropic and OpenAI tokens fell 34% and 39% in the week of
 * 13 May 2026, after both companies stated that transfers of their shares into
 * SPVs are void under their transfer restrictions. Those two tokens are still
 * listed and still trading.
 *
 * The API also publishes two prices for the same token — the issuer's own mark
 * and the market price — which is a premium or discount to the issuer's
 * valuation that no wallet surfaces.
 */

const API = "https://prestocks.com/api/prestocks";

interface PreStocksAsset {
  name?: string;
  symbol?: string;
  description?: string;
  external_url?: string;
  contract_address?: string;
  /** The issuer's own valuation mark for one token. */
  markPrice?: number;
  /** What the token actually trades at. */
  tokenPrice?: number;
  markValuation?: number;
  impliedValuation?: number;
  supply?: number;
}

export interface PreStocksMark {
  symbol: string;
  markPrice: number | null;
  tokenPrice: number | null;
  /** Negative means the market values the token below the issuer's own mark. */
  discountPct: number | null;
  supply: number | null;
  externalUrl: string | null;
}

async function fetchAssets(): Promise<PreStocksAsset[]> {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`PreStocks API: HTTP ${res.status}`);
  const body = (await res.json()) as PreStocksAsset[] | { data?: PreStocksAsset[] };
  return Array.isArray(body) ? body : (body.data ?? []);
}

export const prestocksAdapter: Adapter = {
  issuerId: "prestocks",

  async fetchTokens(): Promise<TokenRecord[]> {
    const fetchedAt = new Date().toISOString();
    const assets = await fetchAssets();
    const out: TokenRecord[] = [];
    const seen = new Set<string>();

    for (const asset of assets) {
      const mint = asset.contract_address;
      const symbol = asset.symbol;
      if (!mint || !symbol || seen.has(mint)) continue;
      seen.add(mint);

      out.push({
        mint,
        symbol,
        name: asset.name ?? symbol,
        issuerId: "prestocks",
        // Pre-IPO companies have no listed ticker or ISIN. Grouping falls back
        // to the symbol, which is what the issuer itself uses.
        underlyingSymbol: resolveUnderlying(symbol).symbol,
        underlyingIsin: resolveUnderlying(symbol).isin,
        tokenIsin: null,
        decimals: null, // read from chain during the scan
        halted: false,
        // Redemption is not offered on demand; SPACEX must be converted before
        // its own deadline or it expires. Recorded per token in manual.ts.
        issuance: false,
        redemption: false,
        minOrderUsd: null,
        sourceUrl: API,
        fetchedAt,
      });
    }

    return out;
  },
};

/** Issuer mark against market price: a discount nobody else publishes. */
export async function fetchMarks(): Promise<Map<string, PreStocksMark>> {
  const assets = await fetchAssets();
  const out = new Map<string, PreStocksMark>();

  for (const asset of assets) {
    if (!asset.symbol) continue;
    const mark = typeof asset.markPrice === "number" ? asset.markPrice : null;
    const price = typeof asset.tokenPrice === "number" ? asset.tokenPrice : null;
    out.set(asset.symbol, {
      symbol: asset.symbol,
      markPrice: mark,
      tokenPrice: price,
      discountPct: mark && price ? ((price - mark) / mark) * 100 : null,
      supply: typeof asset.supply === "number" ? asset.supply : null,
      externalUrl: asset.external_url ?? null,
    });
  }

  return out;
}
