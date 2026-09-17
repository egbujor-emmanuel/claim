import { loadUniverse, byMint, type ResolvedCompany, type ResolvedToken } from "./search.js";
import { rateToken, depthFor } from "./rating/index.js";
import type { Grade } from "./rating/grade.js";

/**
 * Which token you should get when you ask for a company.
 *
 * Switching answers "what I hold is weak, what else is there". This answers the
 * question before it: someone wants exposure to Apple and has to pick a mint,
 * with nothing on any venue telling them the mints are different. Buy "Apple"
 * on a router today and you get whichever one has a pool -- which, in 83 of the
 * 154 companies with any route at all, is not the strongest claim available.
 *
 * So Claim picks the destination rather than the user, and says plainly when
 * the one it picked is a compromise: the strongest Apple claim is a security
 * entitlement in regulated custody, and it cannot be bought with a swap.
 */

const ORDER: Grade[] = ["A", "B", "C", "D", "F"];

export interface BuyTarget {
  company: ResolvedCompany;
  /** The best claim that exists, reachable or not. */
  strongest: { token: ResolvedToken; grade: Grade | null };
  /** The best claim a swap can actually land in. Null when none is tradable. */
  reachable: { token: ResolvedToken; grade: Grade | null } | null;
  /**
   * True when the strongest claim is not the reachable one.
   *
   * The whole point of saying it: the holder is about to accept a weaker claim
   * and deserves to know that is what is happening, and why.
   */
  compromised: boolean;
  /** Why the strongest cannot be reached, when it cannot. */
  unreachableBecause: string | null;
}

function rank(g: Grade | null): number {
  return g ? ORDER.indexOf(g) : ORDER.length;
}

/** Whether a swap can land in this mint at all. */
export function isReachable(token: ResolvedToken): boolean {
  const d = depthFor(token.token.mint);
  return !d || d.tradable;
}

export function buyTarget(company: ResolvedCompany): BuyTarget | null {
  const graded = company.tokens
    .map((token) => ({ token, grade: rateToken(token).grade }))
    .filter((x) => x.grade !== null);
  if (graded.length === 0) return null;

  const byStrength = [...graded].sort((a, b) => rank(a.grade) - rank(b.grade));
  const strongest = byStrength[0]!;
  const reachable = byStrength.find((x) => isReachable(x.token)) ?? null;

  const compromised = Boolean(reachable) && reachable!.token.token.mint !== strongest.token.token.mint;
  const issuer = strongest.token.issuer;

  return {
    company,
    strongest,
    reachable,
    compromised,
    unreachableBecause: compromised
      ? `${strongest.token.token.symbol} is the stronger claim but is not traded on any DEX` +
        (issuer ? `; ${issuer.name} issues it directly (${issuer.homepage}).` : ".")
      : null,
  };
}

/**
 * The destination Claim will route a purchase into, for a given company.
 *
 * The API checks against this rather than trusting the mint it was handed. That
 * is the line between "Claim chooses the right token for you" and "Claim is a
 * swap router that will sell you anything" -- without it, a crafted request
 * could route someone into the worst claim on the list using our own endpoint.
 */
export function sanctionedDestination(companyId: string): string | null {
  const u = loadUniverse();
  const company = u.companies.find((c) => c.id === companyId);
  if (!company) return null;
  const firstMint = (company.tokens as unknown as { mint: string }[])[0]?.mint;
  if (!firstMint) return null;
  const resolved = byMint(firstMint, u);
  if (!resolved) return null;
  const target = buyTarget(resolved);
  return target?.reachable?.token.token.mint ?? null;
}

/** Every company a purchase can actually be routed into today. */
export function buyableCompanies(): BuyTarget[] {
  const u = loadUniverse();
  const out: BuyTarget[] = [];
  for (const company of u.companies) {
    const firstMint = (company.tokens as unknown as { mint: string }[])[0]?.mint;
    if (!firstMint) continue;
    const resolved = byMint(firstMint, u);
    if (!resolved) continue;
    const t = buyTarget(resolved);
    if (t?.reachable) out.push(t);
  }
  return out;
}
