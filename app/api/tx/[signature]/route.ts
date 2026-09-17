import { NextResponse } from "next/server";
import { rpc } from "@/src/lib/onchain/rpc.js";

/**
 * What actually happened to a transaction.
 *
 * The client cannot answer this itself without an RPC key, and it must not
 * guess. A wallet returns a signature the moment it submits, which is not the
 * same as the transaction succeeding -- a swap with no funding fails on chain
 * and still hands back a signature. Reporting that as "sent" tells a holder
 * their position moved when it did not.
 */

const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,96}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ signature: string }> },
) {
  const { signature } = await params;
  if (!SIG.test(signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    const res = await rpc<{
      value: ({ slot: number; err: unknown; confirmationStatus: string | null } | null)[];
    }>("getSignatureStatuses", [[signature], { searchTransactionHistory: true }]);

    const status = res.value[0];
    if (!status) {
      // Not yet visible. The caller polls; this is not a verdict.
      return NextResponse.json({ state: "pending" }, { headers: { "cache-control": "no-store" } });
    }
    if (status.err) {
      return NextResponse.json(
        { state: "failed", error: describeError(status.err), raw: status.err },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { state: "confirmed", slot: status.slot, confirmationStatus: status.confirmationStatus },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    // A failure to read is not a failure of the transaction, and must not be
    // reported as one.
    return NextResponse.json(
      { state: "unknown", error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

/**
 * Say what the chain's error means, in words a holder can act on.
 */
function describeError(err: unknown): string {
  const text = JSON.stringify(err);

  // Anchor programs report failures as a numeric Custom code, and the status
  // carries the decimal form while the logs carry hex. Jupiter's slippage
  // error is 6001, which a holder is more likely to hit than anything else
  // here -- a route can move between the quote and the signature.
  const custom = /"Custom":\s*(\d+)/.exec(text)?.[1];
  if (custom === "6001") {
    return "The price moved by more than the allowed slippage between your quote and your signature, so the chain rejected it rather than filling you at a worse price. Nothing moved. Quote again for a fresh price.";
  }
  if (custom === "6000") {
    return "The route Jupiter built was no longer valid by the time it landed. Nothing moved; quoting again will build a new one.";
  }
  if (custom === "1") {
    return "The transaction was rejected for insufficient funds. Nothing moved.";
  }
  if (/InsufficientFunds|insufficient lamports|0x1\b/i.test(text)) {
    return "The transaction was submitted and rejected by the chain: the wallet did not hold enough to cover the swap and the fee. Nothing moved and nothing was charged beyond the network's own handling.";
  }
  if (/AccountNotFound|could not find account/i.test(text)) {
    return "The transaction was submitted and rejected: an account it needed does not exist in this wallet yet.";
  }
  if (/SlippageToleranceExceeded|0x1771/i.test(text)) {
    return "The route moved by more than the allowed slippage between the quote and the signature, so the chain rejected it rather than filling at a worse price. Nothing moved.";
  }
  if (/BlockhashNotFound/i.test(text)) {
    return "The transaction expired before it landed. Nothing moved; quoting again will produce a fresh one.";
  }
  return `The chain rejected the transaction: ${text}. Nothing moved.`;
}
