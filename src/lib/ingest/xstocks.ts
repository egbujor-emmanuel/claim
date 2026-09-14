import type { Adapter, TokenRecord } from "./types.js";

/**
 * xStocks (Backed) adapter.
 *
 * Public, unauthenticated API. Verified 2026-09-14: 832 assets deployed on
 * Solana across 9 pages. The `network` parameter is case-sensitive ("Solana")
 * and pagination is page-number based, not cursor based.
 */

const BASE = "https://api.xstocks.fi/api/v2/public";
const PAGE_SIZE = 100;
const MAX_PAGES = 30;

interface XStocksStablecoin {
  symbol?: string;
  issuance?: boolean;
  redemption?: boolean;
}

interface XStocksDeployment {
  address?: string;
  network?: string;
  supportsAtomicSwaps?: boolean;
  stablecoins?: XStocksStablecoin[];
}

interface XStocksAsset {
  id?: string;
  name?: string;
  symbol?: string;
  isin?: string;
  underlyingSymbol?: string;
  underlyingIsin?: string;
  isTradingHalted?: boolean;
  trading?: {
    limitsPerPeriod?: Record<string, { minOrderFiatValue?: number } | undefined>;
  };
  deployments?: XStocksDeployment[];
}

interface XStocksPage {
  nodes?: XStocksAsset[];
  page?: { currentPage?: number; hasNextPage?: boolean };
}

function toRecord(asset: XStocksAsset, fetchedAt: string): TokenRecord | null {
  const solana = asset.deployments?.find((d) => d.network === "Solana");
  if (!solana?.address || !asset.symbol) return null;

  const stablecoins = solana.stablecoins ?? [];
  const market = asset.trading?.limitsPerPeriod?.market;

  return {
    mint: solana.address,
    symbol: asset.symbol,
    name: asset.name ?? asset.symbol,
    issuerId: "backed",
    underlyingSymbol: asset.underlyingSymbol ?? null,
    underlyingIsin: asset.underlyingIsin ?? null,
    tokenIsin: asset.isin ?? null,
    decimals: null, // filled in from chain; the API does not publish it
    halted: Boolean(asset.isTradingHalted),
    issuance: stablecoins.some((s) => s.issuance === true),
    redemption: stablecoins.some((s) => s.redemption === true),
    minOrderUsd: typeof market?.minOrderFiatValue === "number" ? market.minOrderFiatValue : null,
    sourceUrl: `${BASE}/assets?network=Solana`,
    fetchedAt,
  };
}

export const xstocksAdapter: Adapter = {
  issuerId: "backed",

  async fetchTokens(): Promise<TokenRecord[]> {
    const fetchedAt = new Date().toISOString();
    const seen = new Set<string>();
    const out: TokenRecord[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${BASE}/assets?network=Solana&limit=${PAGE_SIZE}&page=${page}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`xStocks assets page ${page}: HTTP ${res.status}`);

      const body = (await res.json()) as XStocksPage;
      const nodes = body.nodes ?? [];

      for (const asset of nodes) {
        const record = toRecord(asset, fetchedAt);
        if (record && !seen.has(record.mint)) {
          seen.add(record.mint);
          out.push(record);
        }
      }

      if (nodes.length === 0 || !body.page?.hasNextPage) break;
      await new Promise((r) => setTimeout(r, 150));
    }

    return out;
  },
};

export interface MultiplierEvent {
  reason: string;
  multiplier: number;
  previousMultiplier: number;
  activationDateTime: string;
}

/**
 * Corporate action history for one asset.
 *
 * This endpoint is the real corporate-action feed. There is no
 * /corporate-actions endpoint despite what secondary sources suggest — checked
 * 2026-09-14, it returns 404. Dividends and splits show up here as multiplier
 * changes with a stated reason.
 */
export async function fetchMultiplierHistory(symbol: string): Promise<MultiplierEvent[]> {
  const url = `${BASE}/assets/${encodeURIComponent(symbol)}/multiplier/history?network=Solana`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const body = (await res.json()) as { nodes?: MultiplierEvent[] };
  return body.nodes ?? [];
}

export interface ReserveRecord {
  symbol: string;
  timestamp: string;
  sharesHeld: string;
  circulatingSupply: string;
  holdings: { provider: string; quantity: string; symbol: string }[];
}

/**
 * Proof of reserves: custodied shares against circulating token supply.
 *
 * Paginated the same way as /assets — 100 per page. Fetching only the first
 * page silently gives you a twelfth of the universe, which is how you end up
 * reporting a backing ratio for assets you never looked at.
 */
export async function fetchProofOfReserves(): Promise<Map<string, ReserveRecord>> {
  const out = new Map<string, ReserveRecord>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${BASE}/proof-of-reserves?limit=${PAGE_SIZE}&page=${page}`);
    if (!res.ok) throw new Error(`proof-of-reserves page ${page}: HTTP ${res.status}`);

    const body = (await res.json()) as {
      nodes?: ReserveRecord[];
      page?: { hasNextPage?: boolean };
    };
    const nodes = body.nodes ?? [];
    for (const record of nodes) out.set(record.symbol, record);

    if (nodes.length === 0 || !body.page?.hasNextPage) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  return out;
}

/** Shares held divided by circulating supply. Below 1 means under-collateralised. */
export function backingRatio(record: ReserveRecord): number | null {
  const held = Number(record.sharesHeld);
  const circulating = Number(record.circulatingSupply);
  if (!Number.isFinite(held) || !Number.isFinite(circulating) || circulating === 0) return null;
  return held / circulating;
}
