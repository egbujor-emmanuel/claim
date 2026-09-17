import { NextResponse } from "next/server";
import { byMint } from "@/src/lib/search.js";
import { depthFor } from "@/src/lib/rating/index.js";
import { reference, describeReference, hasReference } from "@/src/lib/market/reference.js";

/**
 * How far this token sits from the share it claims to track.
 *
 * Live on request rather than swept into a cache, because a price that is
 * hours old answers a different question than the one being asked. Pyth's
 * equity feed is seconds old; the token's own price comes from the depth ladder
 * measured against real routes.
 */

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params;
  if (!MINT.test(mint)) {
    return NextResponse.json({ error: "invalid_mint" }, { status: 400 });
  }

  const company = byMint(mint);
  const token = company?.tokens.find((t) => t.token.mint === mint);
  if (!token) {
    return NextResponse.json({ error: "not_indexed" }, { status: 404 });
  }
  if (!hasReference(token)) {
    return NextResponse.json(
      { state: "no_feed", message: "Pyth publishes no equity feed for this underlying." },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  }

  const depth = depthFor(mint);
  const r = await reference(token, depth?.priceUsd ?? null);
  if (!r) {
    return NextResponse.json(
      {
        state: "unavailable",
        message:
          "No live comparison right now — either the token has no routable price or the equity feed has not published recently. That is a gap in the data, not a finding about the token.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    { state: "ok", ...r, ...describeReference(r) },
    { headers: { "cache-control": "public, max-age=30", "access-control-allow-origin": "*" } },
  );
}
