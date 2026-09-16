import { rpc } from "./onchain/rpc.js";
import { byMint, loadUniverse, type ResolvedToken } from "./search.js";
import { rateToken } from "./rating/index.js";
import { betterClaims, type SwitchOption } from "./switch.js";
import { effectiveMultiplier } from "./onchain/mint.js";
import type { ClaimRating, Grade } from "./rating/grade.js";

/**
 * What a wallet actually holds.
 *
 * This is the question Claim exists to answer and could not, until now: not
 * "what is this token" but "what do I own, and is any of it worse than it looks".
 *
 * It takes a plain address. No connection, no signature, no fee — reading token
 * accounts is a free RPC call, so anyone can check any wallet, including one
 * they do not control. That matters for a counterparty, a treasury, or a fund
 * you are about to trust.
 *
 * Balances are reported through the scaled-UI multiplier, because the raw
 * amount is not what the holder owns. 368 of the indexed mints carry a
 * multiplier that has already taken effect, and reading the field naively
 * understates some positions by 90%.
 */

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TOKEN_LEGACY = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export interface Holding {
  mint: string;
  symbol: string;
  name: string;
  /** Raw on-chain amount, before the multiplier. */
  rawAmount: string;
  /** What the holder actually owns, multiplier applied. */
  uiAmount: number;
  decimals: number;
  /** True when a naive reader would report a different balance. */
  multiplierApplied: boolean;
  token: ResolvedToken;
  rating: ClaimRating;
  /** Better claims on the same company, if any exist. */
  switches: SwitchOption[];
}

export interface PortfolioScan {
  address: string;
  /**
   * Tokenized equities found, worst claim first, capped for rendering.
   *
   * Issuer treasuries hold hundreds of positions -- one holds 952 -- and
   * rendering every card produced an 8MB page that took eleven seconds. A
   * portfolio view exists to surface what needs attention, not to dump an
   * inventory, so the list is capped and the remainder is counted instead.
   */
  holdings: Holding[];
  /** Positions found in total, before the render cap. */
  totalHoldings: number;
  /** How many were left out of `holdings`. */
  omittedCount: number;
  /** Token accounts that are not indexed tokenized equities. */
  otherTokenCount: number;
  /** Positions carrying at least one critical finding. */
  criticalCount: number;
  /** Positions where a better claim exists on the same company. */
  switchableCount: number;
  scannedAt: string;
}

const GRADE_RANK: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };

interface ParsedTokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint?: string;
          tokenAmount?: { amount?: string; decimals?: number };
        };
      };
    };
  };
}

/** Base58, the length a Solana address can be. */
export const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Scan an address for tokenized equities.
 *
 * Both token programs are queried: xStocks and the rest are Token-2022, but a
 * wallet can hold legacy SPL tokens too and skipping them would silently
 * under-report.
 */
/**
 * Most positions rendered. Everything past this is counted, not drawn.
 * Worst-first ordering means the cap only ever hides the least urgent rows.
 */
export const RENDER_CAP = 40;

export async function scanAddress(address: string): Promise<PortfolioScan> {
  const scannedAt = new Date().toISOString();
  if (!ADDRESS_PATTERN.test(address)) {
    throw new Error("That is not a base58 Solana address.");
  }

  const universe = loadUniverse();
  const known = new Set(universe.tokens.map((t) => t.mint));

  const programs = [TOKEN_2022, TOKEN_LEGACY];
  const accounts: ParsedTokenAccount[] = [];
  for (const programId of programs) {
    const result = await rpc<{ value: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [
      address,
      { programId },
      { encoding: "jsonParsed" },
    ]);
    accounts.push(...(result.value ?? []));
  }

  const holdings: Holding[] = [];
  let otherTokenCount = 0;

  for (const entry of accounts) {
    const info = entry.account?.data?.parsed?.info;
    const mint = info?.mint;
    const raw = info?.tokenAmount?.amount;
    if (!mint || !raw || raw === "0") continue;

    if (!known.has(mint)) {
      otherTokenCount++;
      continue;
    }

    const company = byMint(mint, universe);
    const resolved = company?.tokens.find((t) => t.token.mint === mint);
    if (!company || !resolved) {
      otherTokenCount++;
      continue;
    }

    const decimals = resolved.onchain?.decimals ?? info.tokenAmount?.decimals ?? 0;
    const multiplier = resolved.onchain
      ? Number(effectiveMultiplier(resolved.onchain))
      : 1;
    const base = Number(raw) / Math.pow(10, decimals);

    holdings.push({
      mint,
      symbol: resolved.token.symbol,
      name: resolved.token.name,
      rawAmount: raw,
      uiAmount: base * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1),
      decimals,
      multiplierApplied: multiplier !== 1,
      token: resolved,
      rating: rateToken(resolved),
      switches: betterClaims(mint, company),
    });
  }

  // Worst claim first. Someone scanning their wallet needs the problem, not an
  // alphabetical inventory.
  holdings.sort((a, b) => {
    const ga = a.rating.grade ? GRADE_RANK[a.rating.grade] : -1;
    const gb = b.rating.grade ? GRADE_RANK[b.rating.grade] : -1;
    if (gb !== ga) return gb - ga;
    return b.uiAmount - a.uiAmount;
  });

  // Counted across everything found, not just what is rendered, so the summary
  // never understates the problem because of a display limit.
  const criticalCount = holdings.filter((h) =>
    h.rating.findings.some((f) => f.severity === "critical"),
  ).length;
  const switchableCount = holdings.filter((h) => h.switches.length > 0).length;

  return {
    address,
    holdings: holdings.slice(0, RENDER_CAP),
    totalHoldings: holdings.length,
    omittedCount: Math.max(0, holdings.length - RENDER_CAP),
    otherTokenCount,
    criticalCount,
    switchableCount,
    scannedAt,
  };
}

/** One sentence summarising what the scan found, for the top of the page. */
export function summarise(scan: PortfolioScan): string {
  const n = scan.totalHoldings;
  if (n === 0) {
    return "No tokenized equities found at this address.";
  }
  const parts = [`${n} tokenized ${n === 1 ? "equity" : "equities"} held.`];
  if (scan.criticalCount > 0) {
    parts.push(
      `${scan.criticalCount} ${scan.criticalCount === 1 ? "carries" : "carry"} a critical finding.`,
    );
  }
  if (scan.switchableCount > 0) {
    parts.push(
      `${scan.switchableCount} ${scan.switchableCount === 1 ? "has" : "have"} a stronger claim available on the same company.`,
    );
  }
  return parts.join(" ");
}
