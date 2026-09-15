import { readFileSync } from "node:fs";
import type { Company, TokenRecord } from "./ingest/types.js";
import type { OnChainState } from "./types.js";
import { ISSUERS } from "../data/issuers.js";
import { UNIVERSE_PATH } from "./paths.js";
import type { Issuer, ClaimStructure } from "./types.js";

/**
 * Lookup over the cached universe.
 *
 * Search is by company, never by ticker alone. Tickers are the whole problem:
 * SPCX, SPCXx and SPACEX all reference the same SpaceX shares while conferring
 * three different claims, so a ticker search invites the user to pick whichever
 * spelling they saw first. Searching the company forces the comparison.
 */

export interface CachedOnChain extends OnChainState {
  effectiveMultiplier: string;
  multiplierTrap: boolean;
}

export interface Universe {
  generatedAt: string;
  counts: Record<string, number>;
  tokens: TokenRecord[];
  companies: (Company & { mixedIssuers: boolean })[];
  onchain: Record<string, CachedOnChain>;
}

export interface ResolvedToken {
  token: TokenRecord;
  issuer: Issuer | null;
  onchain: CachedOnChain | null;
}

export interface ResolvedCompany {
  id: string;
  name: string;
  underlyingSymbol: string | null;
  underlyingIsin: string | null;
  /**
   * More than one token references this company.
   *
   * Even when two issuers use the same legal structure, the holder still faces
   * different counterparties, different powers and different liquidity, so this
   * is worth surfacing on its own.
   */
  multiToken: boolean;
  /**
   * The tokens confer materially different legal claims.
   *
   * This is the sharper signal: SpaceX is contested because SPCX is a custodied
   * entitlement, SPCXx is securitized exposure and SPACEX is an SPV interest.
   * Apple has two tokens but both are securitized exposure, so it is multiToken
   * without being contested.
   */
  contested: boolean;
  tokens: ResolvedToken[];
}

let cached: Universe | null = null;

export function loadUniverse(path?: string): Universe {
  if (cached && !path) return cached;
  const parsed = JSON.parse(readFileSync(path ?? UNIVERSE_PATH, "utf8")) as Universe;
  if (!path) cached = parsed;
  return parsed;
}

function resolve(company: Company, universe: Universe): ResolvedCompany {
  const tokens: ResolvedToken[] = company.tokens.map((token) => ({
    token,
    issuer: ISSUERS[token.issuerId] ?? null,
    onchain: universe.onchain[token.mint] ?? null,
  }));

  const structures = new Set(
    tokens
      .map((t) => t.issuer?.structure.value)
      .filter((v): v is ClaimStructure => v !== undefined),
  );

  return {
    id: company.id,
    name: company.name,
    underlyingSymbol: company.underlyingSymbol,
    underlyingIsin: company.underlyingIsin,
    multiToken: tokens.length > 1,
    contested: structures.size > 1,
    tokens,
  };
}

function score(company: Company, needle: string): number {
  const name = company.name.toLowerCase();
  const sym = (company.underlyingSymbol ?? "").toLowerCase();

  if (sym === needle) return 100;
  if (name === needle) return 95;
  if (name.startsWith(needle)) return 80;
  if (sym.startsWith(needle)) return 70;
  if (name.includes(needle)) return 50;
  if (company.tokens.some((t) => t.symbol.toLowerCase() === needle)) return 60;
  if (company.tokens.some((t) => t.symbol.toLowerCase().includes(needle))) return 30;
  return 0;
}

/** Search by company name, underlying ticker, or token ticker. */
export function search(query: string, limit = 10, universe = loadUniverse()): ResolvedCompany[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  return universe.companies
    .map((c) => ({ c, s: score(c, needle) }))
    .filter((x) => x.s > 0)
    // More representations first at equal relevance: those are the interesting rows.
    .sort((a, b) => b.s - a.s || b.c.tokens.length - a.c.tokens.length)
    .slice(0, limit)
    .map((x) => resolve(x.c, universe));
}

/** Resolve a single mint to its company and every competing claim on it. */
export function byMint(mint: string, universe = loadUniverse()): ResolvedCompany | null {
  const company = universe.companies.find((c) => c.tokens.some((t) => t.mint === mint));
  return company ? resolve(company, universe) : null;
}

/** Companies whose tokens confer materially different legal claims. */
export function contested(universe = loadUniverse()): ResolvedCompany[] {
  return universe.companies.map((c) => resolve(c, universe)).filter((c) => c.contested);
}

/** Companies represented by more than one token, whatever the structures. */
export function multiToken(universe = loadUniverse()): ResolvedCompany[] {
  return universe.companies.map((c) => resolve(c, universe)).filter((c) => c.multiToken);
}
