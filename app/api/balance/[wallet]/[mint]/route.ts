import { NextResponse } from "next/server";
import { rpc } from "@/src/lib/onchain/rpc.js";

/**
 * What this wallet can actually spend of this token, and whether it can pay a fee.
 *
 * Asked before a transaction is built rather than after it fails. A holder with
 * an empty wallet was previously allowed to sign a swap, watch it get dropped
 * before inclusion, and then be told to go and read a block explorer that would
 * never find it. Answering the question first is cheaper than explaining the
 * silence afterwards.
 */

const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wallet: string; mint: string }> },
) {
  const { wallet, mint } = await params;
  if (!ADDR.test(wallet) || !ADDR.test(mint)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const [accounts, lamports] = await Promise.all([
      rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { amount: string; decimals: number; uiAmount: number | null } } } } } }[] }>(
        "getTokenAccountsByOwner",
        [wallet, { mint }, { encoding: "jsonParsed" }],
      ),
      rpc<{ value: number }>("getBalance", [wallet]),
    ]);

    let raw = 0n;
    let decimals = 0;
    for (const a of accounts.value) {
      const amt = a.account.data.parsed.info.tokenAmount;
      raw += BigInt(amt.amount);
      decimals = amt.decimals;
    }

    // Roughly what a swap costs to land: base fee plus priority plus rent for a
    // token account that may not exist yet. Deliberately generous; the point is
    // to catch an empty wallet, not to price the transaction precisely.
    const FEE_FLOOR = 2_500_000; // 0.0025 SOL
    return NextResponse.json(
      {
        raw: raw.toString(),
        decimals,
        uiAmount: decimals ? Number(raw) / 10 ** decimals : 0,
        lamports: lamports.value,
        canPayFee: lamports.value >= FEE_FLOOR,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    // A failure to read is not a finding about the wallet.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
