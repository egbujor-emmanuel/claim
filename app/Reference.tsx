"use client";

import { useEffect, useState } from "react";

/**
 * How far this token sits from the share it tracks.
 *
 * Fetched per card rather than rendered with the page: Pyth's equity feed
 * updates every few seconds, and a premium baked into HTML at build time would
 * be answering yesterday's question. It renders nothing until it has an answer,
 * so a card never shows an empty slot waiting on a network call.
 */
type State =
  | { state: "ok"; message: string; evidence: string; severity: string;
      underlyingUsd: number; tokenUsd: number; premiumPct: number; feedSymbol: string; ageSeconds: number }
  | { state: "no_feed" | "unavailable"; message: string };

export function Reference({ mint }: { mint: string }) {
  const [data, setData] = useState<State | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/reference/${mint}`)
      .then((r) => r.json())
      .then((d: State) => { if (live) setData(d); })
      .catch(() => { /* a failed read is not a finding */ });
    return () => { live = false; };
  }, [mint]);

  if (!data || data.state !== "ok") return null;

  return (
    <li className={`finding f-${data.severity}`}>
      <div className="f-msg">{data.message}</div>
      <div className="f-evidence">
        Pyth {data.feedSymbol} ${data.underlyingUsd.toFixed(2)} ({data.ageSeconds}s ago) ·
        {" "}token ${data.tokenUsd.toFixed(2)} on a live route ·
        {" "}{data.premiumPct >= 0 ? "+" : ""}{data.premiumPct.toFixed(2)}%
      </div>
    </li>
  );
}
