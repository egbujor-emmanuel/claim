import { NextResponse } from "next/server";
import { quoteSwitch, buildSwitchTransaction, preflight } from "@/src/lib/switch.js";
import { byMint } from "@/src/lib/search.js";
import { sanctionedDestination } from "@/src/lib/buy.js";

/**
 * Quote and build a switch between two claims on the same company.
 *
 * GET  quotes it. POST builds an unsigned transaction for the holder's wallet.
 *
 * Neither signs nor submits anything. The server never sees a private key and
 * never touches funds; it produces a transaction and hands it back.
 */

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Say what a routing failure means, in words.
 *
 * Jupiter's codes are precise and useless to a holder. TOKEN_NOT_TRADABLE in
 * particular is the single most informative thing Claim can report -- it means
 * the position has no buyer at any size -- and leaking the raw string wastes
 * that and reads as a broken tool.
 *
 * It also reveals when our own depth cache has gone stale: a token recorded as
 * routable that Jupiter now refuses has lost its market since the last sweep.
 * The live quote is the authority, not the cache.
 */
function explainRouteFailure(code: string, fromSymbol: string): string {
  if (/TOKEN_NOT_TRADABLE/i.test(code)) {
    return `${fromSymbol} has no market on any venue Jupiter can reach, so it cannot be sold to fund a switch. That is the finding, not a glitch: the only way out of a position like this is redemption with the issuer, on their terms.`;
  }
  if (/NO_ROUTES?_FOUND/i.test(code)) {
    return `No route exists for that size right now. A smaller amount may route; a position this thin can often only be moved in pieces, if at all.`;
  }
  if (/CIRCULAR_ARBITRAGE|SAME/i.test(code)) {
    return "Those are the same token.";
  }
  return `The router could not price this switch (${code}).`;
}

/**
 * Both mints must reference the same company.
 *
 * Without this the endpoint is a general-purpose swap router, which is not what
 * Claim is for and not something it should quietly become. A switch is a move
 * between claims on one security.
 */
function sameCompany(from: string, to: string): boolean {
  const a = byMint(from);
  const b = byMint(to);
  return Boolean(a && b && a.id === b.id);
}

/**
 * Whether Claim is willing to route this pair.
 *
 * Two shapes are allowed and nothing else. A switch stays within one company:
 * the holder has a weak claim on a security and is moving to a better one on
 * the same security. A purchase crosses companies, but only into the mint Claim
 * itself nominates as the best reachable claim for that company.
 *
 * The second check is the important one. Without it this endpoint is a general
 * swap router wearing Claim's name, and a crafted request could route someone
 * into the worst token on the list -- the precise outcome the product exists to
 * prevent. Claim chooses the destination; the caller does not get to.
 */
function routable(from: string, to: string): { ok: true } | { ok: false; why: string } {
  if (sameCompany(from, to)) return { ok: true };

  const destination = byMint(to);
  if (!destination) {
    return { ok: false, why: "Claim does not index the destination token." };
  }
  if (sanctionedDestination(destination.id) !== to) {
    return {
      ok: false,
      why:
        `Claim routes purchases only into the strongest claim it can reach for a company. ` +
        `That is not this mint for ${destination.name}.`,
    };
  }
  return { ok: true };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const amount = url.searchParams.get("amount") ?? "";

  if (!MINT.test(from) || !MINT.test(to) || !/^\d+$/.test(amount)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const allowed = routable(from, to);
  if (!allowed.ok) {
    return NextResponse.json({ error: "destination_not_sanctioned", message: allowed.why }, { status: 400 });
  }

  const check = await preflight(to);
  if (!check.ok) {
    return NextResponse.json(
      { error: "destination_unsafe", message: check.blockers.join(" ") },
      { status: 409 },
    );
  }

  const quote = await quoteSwitch(from, to, amount);
  if ("error" in quote) {
    const fromToken = byMint(from)?.tokens.find((t) => t.token.mint === from);
    return NextResponse.json(
      {
        error: explainRouteFailure(quote.error, fromToken?.token.symbol ?? "This token"),
        code: quote.error,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    outAmount: quote.outAmountRaw,
    priceImpactPct: quote.priceImpactPct,
    hops: quote.hops,
    slippageBps: quote.slippageBps,
    preflightCheckedAt: check.checkedAt,
  });
}

export async function POST(request: Request) {
  let body: { from?: string; to?: string; amount?: string; wallet?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { from = "", to = "", amount = "", wallet = "" } = body;
  if (!MINT.test(from) || !MINT.test(to) || !/^\d+$/.test(amount) || !MINT.test(wallet)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const allowed = routable(from, to);
  if (!allowed.ok) {
    return NextResponse.json({ error: "destination_not_sanctioned", message: allowed.why }, { status: 400 });
  }

  // Re-checked at build time, not just at quote time. The gap between a quote
  // and a signature is where a pause would bite.
  const check = await preflight(to);
  if (!check.ok) {
    return NextResponse.json(
      { error: "destination_unsafe", message: check.blockers.join(" ") },
      { status: 409 },
    );
  }

  const quote = await quoteSwitch(from, to, amount);
  if ("error" in quote) {
    const fromToken = byMint(from)?.tokens.find((t) => t.token.mint === from);
    return NextResponse.json(
      {
        error: explainRouteFailure(quote.error, fromToken?.token.symbol ?? "This token"),
        code: quote.error,
      },
      { status: 502 },
    );
  }

  const tx = await buildSwitchTransaction(quote, wallet);
  if ("error" in tx) {
    return NextResponse.json({ error: tx.error }, { status: 502 });
  }

  return NextResponse.json({
    swapTransaction: tx.swapTransaction,
    outAmount: quote.outAmountRaw,
    priceImpactPct: quote.priceImpactPct,
    disclaimer:
      "Claim built this transaction and did not sign it. Your wallet decides whether it is sent.",
  });
}
