import type { Adapter, TokenRecord } from "./types.js";

/**
 * Hand-verified tokens for issuers without a confirmed public asset API.
 *
 * Backpack Securities publishes a mint-and-redeem API for developers and
 * Sunrise maintains listings, but neither has been verified by us yet. Rather
 * than guess at an endpoint, these entries are each confirmed against a primary
 * source and the chain. Small, honest, and correct beats broad and wrong.
 *
 * Every mint here was read back from mainnet on 2026-09-14 and matched the
 * issuer's own published address.
 */

const fetchedAt = "2026-09-14T00:00:00.000Z";

const MANUAL: TokenRecord[] = [
  {
    mint: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh",
    symbol: "SPACEX",
    name: "SpaceX PreStocks",
    issuerId: "prestocks",
    underlyingSymbol: "SPCX",
    underlyingIsin: "US84615Q1031",
    tokenIsin: null,
    decimals: 9,
    halted: false,
    issuance: false,
    // Not redeemable with the issuer: the only exit is an on-chain swap into
    // SPCXx before 11:59pm UTC on 12 March 2027, after which the issuer states
    // the tokens expire worthless.
    redemption: false,
    minOrderUsd: null,
    sourceUrl: "https://prestocks.com/spacex",
    fetchedAt,
  },
];

export const manualAdapter: Adapter = {
  issuerId: "manual",
  async fetchTokens(): Promise<TokenRecord[]> {
    return MANUAL;
  },
};

/**
 * Deadlines that kill a token if the holder does nothing.
 *
 * Keyed by mint. This is the single most consequential fact Claim surfaces and
 * it appears in no wallet, explorer, or aggregator we have found.
 */
export const EXPIRY: Record<string, { deadline: string; action: string; source: string }> = {
  PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh: {
    deadline: "2027-03-12T23:59:00.000Z",
    action:
      "Swap into SPCXx (Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8) or another token. Unswapped tokens expire worthless.",
    source: "https://prestocks.com/spacex",
  },
};

export function daysUntilExpiry(mint: string, now = Date.now()): number | null {
  const entry = EXPIRY[mint];
  if (!entry) return null;
  return Math.floor((Date.parse(entry.deadline) - now) / 86_400_000);
}
