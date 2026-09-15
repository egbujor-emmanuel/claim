import Link from "next/link";
import { loadUniverse } from "@/src/lib/search.js";

const EXAMPLE = "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh";

const SAMPLE = `{
  "mint": "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh",
  "symbol": "SPACEX",
  "grade": "F",
  "headline": "An interest in a vehicle that holds the shares...",

  "company": {
    "name": "SpaceX",
    "underlyingIsin": "US84615Q1031",
    "contested": true,
    "alternatives": [
      { "symbol": "SPCX",  "structure": "custodied_entitlement" },
      { "symbol": "SPCXx", "structure": "securitized_exposure" }
    ]
  },

  "claim": {
    "issuer": "PreStocks",
    "structure": "spv_interest",
    "redemption": "mandatory_conversion",
    "shareholderRights": false,
    "sources": { "structure": "https://...", "redemption": "https://..." }
  },

  "onchain": {
    "permanentDelegate": "WV9PJN7X...",
    "pausable": { "authority": "WV9PJN7X...", "paused": false },
    "transferFeeBasisPoints": 50,
    "distinctAuthorities": ["WV9PJN7X..."],
    "multiplier": "1",
    "effectiveMultiplier": "5",
    "multiplierTrap": true
  },

  "exit": {
    "tradable": true,
    "maxExitWithin5PctUsd": 10000,
    "ladder": [ { "usd": 1000, "lossPct": 0.4 } ]
  }
}`;

export default function ApiDocs() {
  const u = loadUniverse();

  return (
    <main className="wrap">
      <header className="masthead">
        <p className="wordmark">
          <Link href="/">Claim</Link> · API
        </p>
        <h1 className="thesis">One call tells you what a token actually is.</h1>
        <p className="standfirst">
          Free, unauthenticated, CORS-open. Built for protocols that accept tokenized
          equities as collateral and need to know whether the issuer can freeze the position
          mid-liquidation, whether a permanent delegate can seize it, and whether it can be
          liquidated at size.
        </p>
      </header>

      <section>
        <h2 style={{ fontSize: 19, marginBottom: 8 }}>Endpoint</h2>
        <pre className="note-box mono" style={{ whiteSpace: "pre-wrap" }}>
          GET /api/claim/{"{mint}"}
        </pre>
        <p className="muted" style={{ fontSize: 14 }}>
          Try it:{" "}
          <a className="mono" href={`/api/claim/${EXAMPLE}`}>
            /api/claim/{EXAMPLE.slice(0, 12)}…
          </a>
        </p>
      </section>

      <section style={{ marginTop: 30 }}>
        <h2 style={{ fontSize: 19, marginBottom: 8 }}>Response</h2>
        <pre
          className="note-box mono"
          style={{ whiteSpace: "pre", overflowX: "auto", fontSize: 12 }}
        >
          {SAMPLE}
        </pre>
      </section>

      <section style={{ marginTop: 30 }}>
        <h2 style={{ fontSize: 19, marginBottom: 8 }}>What the fields mean</h2>
        <ul className="findings" style={{ borderTop: "none" }}>
          <li className="finding f-critical">
            <div className="f-msg">
              <code className="mono">claim.structure</code> — what you legally hold.
              <code className="mono"> spv_interest</code> means an interest in a vehicle,
              which the underlying company can decline to recognise. That is what cost
              PreStocks holders 34–39% in May 2026.
            </div>
          </li>
          <li className="finding f-critical">
            <div className="f-msg">
              <code className="mono">claim.redemption</code> —{" "}
              <code className="mono">mandatory_conversion</code> means a deadline exists and
              the token stops being worth anything if it passes.
            </div>
          </li>
          <li className="finding f-warning">
            <div className="f-msg">
              <code className="mono">onchain.permanentDelegate</code> — an authority that can
              move or burn the token from any wallet, including a protocol vault.
            </div>
          </li>
          <li className="finding f-warning">
            <div className="f-msg">
              <code className="mono">onchain.distinctAuthorities</code> — a length of 1 means
              one key can mint, freeze, seize, pause, retax and rewrite the balance display.
            </div>
          </li>
          <li className="finding f-warning">
            <div className="f-msg">
              <code className="mono">onchain.multiplierTrap</code> — true when reading the
              raw <code className="mono">multiplier</code> field gives the wrong balance. Use{" "}
              <code className="mono">effectiveMultiplier</code>.
            </div>
          </li>
          <li className="finding f-note">
            <div className="f-msg">
              <code className="mono">exit.tradable: false</code> is not automatically a trap.
              Some issuers run no AMM liquidity and expect direct redemption instead. Read it
              alongside <code className="mono">claim.redemption</code>.
            </div>
          </li>
        </ul>
      </section>

      <div className="note-box">
        A mint we do not index returns <code className="mono">404</code>. That is not a
        safety verdict — it may be an issuer we do not cover yet. Absence of a record is
        never evidence of anything.
      </div>

      <footer>
        Universe generated {new Date(u.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
        {u.tokens.length.toLocaleString()} tokens indexed · <Link href="/">back to Claim</Link>
      </footer>
    </main>
  );
}
