import Link from "next/link";
import { search, loadUniverse } from "@/src/lib/search.js";
import { rateCompany } from "@/src/lib/rating/index.js";
import { CompanyBlock, Disclaimer } from "./components";

function universeStats() {
  const u = loadUniverse();
  const states = Object.values(u.onchain);

  const delegated = states.filter((s) => s.permanentDelegate).length;
  const traps = states.filter((s) => s.multiplierTrap).length;
  const delegates = new Set(
    states.map((s) => s.permanentDelegate).filter((d): d is string => Boolean(d)),
  );
  const biggest = [...delegates]
    .map((d) => states.filter((s) => s.permanentDelegate === d).length)
    .sort((a, b) => b - a)[0];

  return { tokens: u.tokens.length, delegated, traps, biggest: biggest ?? 0 };
}

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
              <div className="stat-n">{stats.tokens.toLocaleString()}</div>
              <div className="stat-l">tokenized equities indexed</div>
            </div>
            <div className="stat">
              <div className="stat-n">{stats.biggest.toLocaleString()}</div>
              <div className="stat-l">controlled by a single seizure key</div>
            </div>
            <div className="stat">
              <div className="stat-n">{stats.delegated.toLocaleString()}</div>
              <div className="stat-l">where an authority can take your tokens</div>
            </div>
            <div className="stat">
              <div className="stat-n">{stats.traps.toLocaleString()}</div>
              <div className="stat-l">that display the wrong balance to naive apps</div>
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
        Jupiter quotes.
      </footer>
    </main>
  );
}
