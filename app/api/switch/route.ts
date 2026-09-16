import { NextResponse } from "next/server";
import { quoteSwitch, buildSwitchTransaction, preflight } from "@/src/lib/switch.js";
import { byMint } from "@/src/lib/search.js";

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const amount = url.searchParams.get("amount") ?? "";

  if (!MINT.test(from) || !MINT.test(to) || !/^\d+$/.test(amount)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!sameCompany(from, to)) {
    return NextResponse.json(
      { error: "not_the_same_company", message: "Claim only routes between claims on one company." },
      { status: 400 },
    );
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
    return NextResponse.json({ error: quote.error }, { status: 502 });
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
  if (!sameCompany(from, to)) {
    return NextResponse.json({ error: "not_the_same_company" }, { status: 400 });
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
    return NextResponse.json({ error: quote.error }, { status: 502 });
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
