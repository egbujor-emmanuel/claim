import { byMint, type ResolvedCompany, type ResolvedToken } from "./search.js";
import { rateToken } from "./rating/index.js";
import { fetchMint } from "./onchain/mint.js";
import type { Grade } from "./rating/grade.js";

/**
 * Switching claims.
 *
 * Claim's whole argument is that two tokens on the same company are not the
 * same asset. The conclusion of that argument is an action: if you hold the
 * worse claim, move to the better one. Everything else in this codebase is a
 * diagnosis, and a diagnosis with nothing to do about it is a pamphlet.
 *
 * The routing decision here is the thing no other tool can make. Ranking the
 * four SpaceX tokens by price steers a holder INTO the one that expires in
 * March 2027, because it is the cheapest. Ranking them by claim strength steers
 * them out. Same four tokens, opposite advice.
 *
 * Nothing in this file signs or sends. It produces a route and the reasons for
 * it; the holder's own wallet decides whether any of it happens.
 */

const GRADE_RANK: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };

export interface SwitchOption {
  from: ResolvedToken;
  to: ResolvedToken;
  fromGrade: Grade;
  toGrade: Grade;
  /** Plain sentences describing what the holder gains by moving. */
  gains: string[];
  /** Anything they give up. Stated even when it weakens the case. */
  tradeoffs: string[];
}

function structureOf(t: ResolvedToken) {
  return t.issuer?.structure.value ?? null;
}

/**
 * Why moving from one claim to another is an improvement.
 *
 * Only differences that are actually true of this pair, read from the registry
 * and the chain. No generic marketing.
 */
function describe(from: ResolvedToken, to: ResolvedToken) {
  const gains: string[] = [];
  const tradeoffs: string[] = [];

  const fromRedemption = from.issuer?.redemption.value;
  const toRedemption = to.issuer?.redemption.value;

  if (fromRedemption === "mandatory_conversion" && toRedemption !== "mandatory_conversion") {
    gains.push("Leaves a token that expires if it is not converted before a deadline.");
  }
  if (toRedemption === "portable_to_brokerage" && fromRedemption !== "portable_to_brokerage") {
    gains.push("Moves into a claim you can transfer out to a traditional brokerage as real shares.");
  }
  if (to.issuer?.shareholderRights.value && !from.issuer?.shareholderRights.value) {
    gains.push("Gains the ownership, dividend and corporate-action rights the current token does not carry.");
  }

  const fromStructure = structureOf(from);
  const toStructure = structureOf(to);
  if (fromStructure === "spv_interest" && toStructure !== "spv_interest") {
    gains.push(
      "Leaves an SPV interest, the structure Anthropic and OpenAI declared void for their own shares in May 2026.",
    );
  }
  if (fromStructure === "loan_participation" && toStructure !== "loan_participation") {
    gains.push("Moves from a loan participation right into a claim on the security itself.");
  }

  const fromFee = from.onchain?.transferFee?.basisPoints ?? 0;
  const toFee = to.onchain?.transferFee?.basisPoints ?? 0;
  if (fromFee > toFee) {
    gains.push(`Removes a ${fromFee / 100}% tax on every transfer.`);
  } else if (toFee > fromFee) {
    tradeoffs.push(`The destination taxes every transfer ${toFee / 100}%.`);
  }

  const fromKeys = from.onchain?.distinctAuthorities.length ?? 0;
  const toKeys = to.onchain?.distinctAuthorities.length ?? 0;
  if (fromKeys === 1 && toKeys > 1) {
    gains.push("Leaves a mint where one key controls minting, freezing, seizing and pausing.");
  }

  if (from.onchain?.permanentDelegate && !to.onchain?.permanentDelegate) {
    gains.push("The destination issuer holds no permanent delegate and cannot seize the tokens.");
  } else if (!from.onchain?.permanentDelegate && to.onchain?.permanentDelegate) {
    tradeoffs.push("The destination has a permanent delegate that can move tokens from any wallet.");
  }

  if (from.onchain?.multiplierTrap && !to.onchain?.multiplierTrap) {
    gains.push("Leaves a token whose balance is displayed incorrectly by apps that read it naively.");
  }

  return { gains, tradeoffs };
}

/**
 * Better claims on the same company than the one held.
 *
 * Ordered by claim strength, never by price. That ordering is the entire point:
 * the cheapest SpaceX token is the one that expires.
 */
export function betterClaims(mint: string, company?: ResolvedCompany | null): SwitchOption[] {
  const resolved = company ?? byMint(mint);
  if (!resolved) return [];

  const held = resolved.tokens.find((t) => t.token.mint === mint);
  if (!held) return [];

  const heldRating = rateToken(held);
  if (!heldRating.grade) return []; // not an equity claim; nothing to compare

  const options: SwitchOption[] = [];
  for (const candidate of resolved.tokens) {
    if (candidate.token.mint === mint) continue;
    const rating = rateToken(candidate);
    if (!rating.grade) continue;
    if (GRADE_RANK[rating.grade] >= GRADE_RANK[heldRating.grade]) continue;

    const { gains, tradeoffs } = describe(held, candidate);
    if (gains.length === 0) continue; // a better letter with nothing concrete behind it is not a reason

    options.push({
      from: held,
      to: candidate,
      fromGrade: heldRating.grade,
      toGrade: rating.grade,
      gains,
      tradeoffs,
    });
  }

  return options.sort((a, b) => GRADE_RANK[a.toGrade] - GRADE_RANK[b.toGrade]);
}

export interface PreflightResult {
  ok: boolean;
  /** Reasons the route must not be offered right now. */
  blockers: string[];
  checkedAt: string;
}

/**
 * Re-read the destination from chain before offering a route.
 *
 * The cache can be hours old. A mint that was safe at scan time may have been
 * paused since, and routing someone into a frozen token because of stale data
 * would be the worst thing this tool could do.
 */
export async function preflight(destinationMint: string): Promise<PreflightResult> {
  const checkedAt = new Date().toISOString();
  const blockers: string[] = [];

  let state;
  try {
    state = await fetchMint(destinationMint);
  } catch (e) {
    return {
      ok: false,
      blockers: [
        `Could not re-read the destination from Solana: ${e instanceof Error ? e.message : String(e)}`,
      ],
      checkedAt,
    };
  }

  if (!state) {
    blockers.push("No mint account exists at the destination address.");
    return { ok: false, blockers, checkedAt };
  }

  if (state.pausable?.paused) {
    blockers.push("The destination token is paused right now. Transfers would fail.");
  }
  if (!state.mintAuthority) {
    blockers.push("The destination has no mint authority, so it cannot be issued or redeemed.");
  }

  return { ok: blockers.length === 0, blockers, checkedAt };
}

const JUP_QUOTE = "https://lite-api.jup.ag/swap/v1/quote";
const JUP_SWAP = "https://lite-api.jup.ag/swap/v1/swap";

export interface SwitchQuote {
  inAmountRaw: string;
  outAmountRaw: string;
  priceImpactPct: number | null;
  hops: number;
  slippageBps: number;
  /** The raw Jupiter response, needed to build the transaction. */
  raw: unknown;
}

/**
 * A real executable quote between two claims on the same company.
 *
 * Jupiter routes tokenized stocks against each other directly, so switching is
 * a single transaction rather than a sell-then-buy the holder has to babysit.
 */
export async function quoteSwitch(
  fromMint: string,
  toMint: string,
  amountRaw: string,
  slippageBps = 300,
): Promise<SwitchQuote | { error: string }> {
  const url = `${JUP_QUOTE}?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountRaw}&slippageBps=${slippageBps}`;
  try {
    const res = await fetch(url);
    const body = (await res.json()) as {
      outAmount?: string;
      inAmount?: string;
      priceImpactPct?: string;
      routePlan?: unknown[];
      error?: string;
      errorCode?: string;
    };
    if (!res.ok || !body.outAmount) {
      return { error: body.errorCode ?? body.error ?? `HTTP ${res.status}` };
    }
    return {
      inAmountRaw: body.inAmount ?? amountRaw,
      outAmountRaw: body.outAmount,
      priceImpactPct: body.priceImpactPct != null ? Number(body.priceImpactPct) * 100 : null,
      hops: body.routePlan?.length ?? 0,
      slippageBps,
      raw: body,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "quote failed" };
  }
}

/**
 * Build the unsigned transaction for a switch.
 *
 * Returns base64 for the holder's wallet to sign. Nothing here holds a key or
 * submits anything; the wallet decides.
 */
export async function buildSwitchTransaction(
  quote: SwitchQuote,
  userPublicKey: string,
): Promise<{ swapTransaction: string } | { error: string }> {
  try {
    const res = await fetch(JUP_SWAP, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote.raw,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
      }),
    });
    const body = (await res.json()) as { swapTransaction?: string; error?: string };
    if (!res.ok || !body.swapTransaction) {
      return { error: body.error ?? `HTTP ${res.status}` };
    }
    return { swapTransaction: body.swapTransaction };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "could not build transaction" };
  }
}
