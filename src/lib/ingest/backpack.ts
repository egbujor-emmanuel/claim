import type { Adapter, TokenRecord } from "./types.js";

/**
 * Backpack Securities adapter.
 *
 * Backpack opened a public mint-and-redeem API to Solana developers on
 * 13 September 2026. Two public, unauthenticated endpoints together give a
 * complete registry:
 *
 *   /api/v1/assets      — every asset, with Solana contract addresses
 *   /api/v1/securities  — tradable securities, with CUSIPs
 *
 * The CUSIP is what makes cross-issuer grouping exact rather than
 * ticker-guessing: a US CUSIP converts deterministically to the ISIN that
 * xStocks publishes, so Backpack's AAPL and xStocks' AAPLx resolve to the same
 * security without heuristics.
 */

const BASE = "https://api.backpack.exchange/api/v1";

interface BackpackToken {
  blockchain?: string;
  contractAddress?: string | null;
  nativeDecimals?: number | null;
}

interface BackpackAsset {
  symbol?: string;
  displayName?: string;
  tokens?: BackpackToken[];
}

interface BackpackSecurity {
  asset?: string;
  name?: string;
  cusip?: string;
}

/**
 * CUSIP to ISIN.
 *
 * A US ISIN is "US" + the 9-character CUSIP + a check digit computed with the
 * Luhn algorithm over the alphanumeric-expanded string (A=10 ... Z=35).
 */
export function cusipToIsin(cusip: string, country = "US"): string | null {
  const body = `${country}${cusip.trim().toUpperCase()}`;
  if (!/^[A-Z0-9]{11}$/.test(body)) return null;

  // Expand letters to their two-digit numeric values.
  let digits = "";
  for (const ch of body) {
    digits += /[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
  }

  // Luhn: double every second digit counting from the right.
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    double = !double;
    sum += d;
  }

  const check = (10 - (sum % 10)) % 10;
  return `${body}${check}`;
}

/** "AAPL.US" -> "AAPL". Backpack suffixes assets with their listing country. */
function baseTicker(symbol: string): string {
  return symbol.split(".")[0] ?? symbol;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Backpack ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const backpackAdapter: Adapter = {
  issuerId: "backpack",

  async fetchTokens(): Promise<TokenRecord[]> {
    const fetchedAt = new Date().toISOString();

    const [assets, securities] = await Promise.all([
      getJson<BackpackAsset[]>("/assets"),
      getJson<BackpackSecurity[]>("/securities"),
    ]);

    // asset symbol -> {cusip, name}
    const meta = new Map<string, { cusip?: string; name?: string }>();
    for (const s of securities) {
      if (s.asset) meta.set(s.asset, { cusip: s.cusip, name: s.name });
    }

    const out: TokenRecord[] = [];
    const seen = new Set<string>();

    for (const asset of assets) {
      const symbol = asset.symbol;
      if (!symbol) continue;

      const solana = asset.tokens?.find(
        (t) => t.blockchain === "Solana" && t.contractAddress,
      );
      if (!solana?.contractAddress) continue;
      if (seen.has(solana.contractAddress)) continue;

      // Only equities. Backpack lists crypto assets on the same endpoint, and a
      // security is exactly what appears in /securities.
      const info = meta.get(symbol);
      if (!info) continue;

      seen.add(solana.contractAddress);
      const ticker = baseTicker(symbol);
      const isin = info.cusip ? cusipToIsin(info.cusip) : null;

      out.push({
        mint: solana.contractAddress,
        symbol: ticker,
        name: info.name ?? asset.displayName ?? ticker,
        issuerId: "backpack",
        underlyingSymbol: ticker,
        underlyingIsin: isin,
        tokenIsin: null,
        decimals: solana.nativeDecimals ?? null,
        halted: false,
        // Backpack's whole proposition is 1:1 mint and redeem against a real
        // share through their broker-dealer.
        issuance: true,
        redemption: true,
        minOrderUsd: null,
        sourceUrl: `${BASE}/assets`,
        fetchedAt,
      });
    }

    return out;
  },
};

interface SunriseToken {
  chain?: string;
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  assetClass?: string;
  issuer?: string | null;
  tokenProgram?: string;
  stock?: { ticker?: string };
}

/**
 * Sunrise listing registry.
 *
 * Sunrise is the liquidity layer that brings Backpack Securities tokens onto
 * Solana, and publishes a token list carrying the issuer for each mint. We use
 * it as an independent confirmation of Backpack's canonical addresses rather
 * than as a primary source: two registries agreeing is worth more than one.
 */
export async function fetchSunriseTokens(): Promise<Map<string, { symbol: string; issuer: string | null }>> {
  const res = await fetch("https://api.sunrise.xyz/v1/tokens");
  if (!res.ok) return new Map();

  const body = (await res.json()) as { data?: { tokens?: SunriseToken[] } };
  const out = new Map<string, { symbol: string; issuer: string | null }>();

  for (const t of body.data?.tokens ?? []) {
    if (t.chain !== "solana" || !t.address || t.assetClass !== "stock") continue;
    out.set(t.address, { symbol: t.symbol ?? "", issuer: t.issuer ?? null });
  }

  return out;
}
