import Link from "next/link";
import { search } from "@/src/lib/search.js";
import { universeStats } from "@/src/lib/stats.js";
import { rateCompany } from "@/src/lib/rating/index.js";
import { CompanyBlock, Disclaimer } from "./components";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // Next 15 passes searchParams as a promise.
  const query = (await searchParams).q?.trim() ?? "";
  const results = query ? search(query, 3).map(rateCompany) : [];
  const spacex = query ? [] : search("spacex", 1).map(rateCompany);
  const stats = universeStats();

  return (
    <main className="wrap">
      <header className="masthead">
        <p className="wordmark">Claim</p>
        <h1 className="thesis">Not everything called a tokenized stock is a stock.</h1>
        <p className="standfirst">
          The same company can have several tokens on Solana, and they do not confer the same
          rights. One may be a real share you can move to a brokerage. One may be a
          certificate against an offshore issuer. One may expire worthless on a date nobody
          told you about.
        </p>

        <form className="search" action="/" method="get">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search a company — SpaceX, Apple, Nvidia"
            aria-label="Search a company"
          />
          <button type="submit">Check</button>
        </form>
        <div className="examples">
          Try{" "}
          <Link href="/?q=spacex">SpaceX</Link>
          <Link href="/?q=apple">Apple</Link>
          <Link href="/?q=nvidia">Nvidia</Link>
          <Link href="/?q=netflix">Netflix</Link>
        </div>
      </header>

      {query && results.length === 0 ? (
        <p className="muted">No tokenized equity found for “{query}”.</p>
      ) : null}

      {(query ? results : spacex).map((c) => (
        <CompanyBlock key={c.id} company={c} />
      ))}

      {!query ? (
        <>
          <div className="stats">
            <div className="stat">
              <div className="stat-n">{stats.largestDelegateReach.toLocaleString()}</div>
              <div className="stat-l">
                tokenized equities one key can seize from any wallet
              </div>
            </div>
            <div className="stat">
              <div className="stat-n">
                {stats.probed ? `${stats.probed - stats.routable}` : "—"}
              </div>
              <div className="stat-l">
                of {stats.probed.toLocaleString()} have no market at all
              </div>
            </div>
            <div className="stat">
              <div className="stat-n">{stats.multiplierTraps.toLocaleString()}</div>
              <div className="stat-l">
                show the wrong balance in apps that read the multiplier naively
              </div>
            </div>
            <div className="stat">
              <div className="stat-n">
                {stats.worstTrapPct !== null ? `${stats.worstTrapPct.toFixed(0)}%` : "—"}
              </div>
              <div className="stat-l">of the real balance, in the worst case</div>
            </div>
          </div>
          <Disclaimer />
        </>
      ) : (
        <Disclaimer />
      )}

      <footer>
        Built for the Solana Foundation Stocklana hackathon. Read-only: Claim never asks for a
        signature and never moves anything. Data from issuer APIs, public Solana RPC and
        Jupiter quotes. <Link href="/api-docs">Public API</Link>.
      </footer>
    </main>
  );
}
