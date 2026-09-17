import Link from "next/link";
import { search, loadUniverse, contested } from "@/src/lib/search.js";
import { universeStats } from "@/src/lib/stats.js";
import { rateCompany } from "@/src/lib/rating/index.js";
import { analyseMint } from "@/src/lib/live.js";
import { CompanyBlock, Disclaimer } from "./components";
import { LiveCard, Freshness } from "./live";
import { Portfolio } from "./portfolio";
import { TopButton } from "./TopButton";
import { scanAddress, type PortfolioScan } from "@/src/lib/holdings.js";
import { Hero } from "./hero";

/** Base58, the length a Solana address can be. */
const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // Next 15 passes searchParams as a promise.
  const query = (await searchParams).q?.trim() ?? "";
  const universe = loadUniverse();
  const stats = universeStats();
  const contestedCount = contested().length;

  // A raw address is looked up live rather than searched as text. Someone
  // pasting a mint wants to know what it is, and the answer must not depend on
  // whether we happened to index it.
  // One input, two meanings. A base58 string is either a mint or a wallet, and
  // making the visitor know which in advance would be a strange thing to ask.
  // Try it as a mint; if no mint account exists there, scan it as a wallet.
  const isAddress = MINT_PATTERN.test(query);
  const live = isAddress ? await analyseMint(query) : null;

  let portfolio: PortfolioScan | null = null;
  let portfolioError: string | null = null;
  if (isAddress && live?.error) {
    try {
      portfolio = await scanAddress(query);
    } catch (e) {
      portfolioError = e instanceof Error ? e.message : "Could not read this address.";
    }
  }

  const results = query && !isAddress ? search(query, 3).map(rateCompany) : [];
  const featured = query ? [] : search("spacex", 1).map(rateCompany);

  return (
    <>
      {/* The opening frame only on the unsearched page. Someone who has searched
          wants an answer, not a title sequence. */}
      {!query ? (
        <Hero stat={{ tokens: stats.tokens, contested: contestedCount }} />
      ) : null}

      <main className="wrap" id="top">
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
            placeholder="Search a company, or paste a wallet or mint address"
            aria-label="Search a company, or paste a wallet or mint address"
          />
          <button type="submit">Check</button>
        </form>
        <div className="examples">
          Try <Link href="/?q=spacex">SpaceX</Link>
          <Link href="/?q=apple">Apple</Link>
          <Link href="/?q=nvidia">Nvidia</Link>
          <Link href="/?q=netflix">Netflix</Link>
        </div>
      </header>

      {/* Not a mint, but a readable wallet: show what it holds. */}
      {portfolio ? <Portfolio scan={portfolio} /> : null}

      {/* Neither a mint nor a readable wallet. Say so; imply no verdict. */}
      {live?.error && !portfolio ? (
        <div className="note-box">
          <strong>{portfolioError ?? live.error}</strong>
          <br />
          Claim found neither a token mint nor a readable wallet at{" "}
          <code className="mono">{query}</code>. That is a failure to answer, not a judgement
          about anything.
        </div>
      ) : null}

      {/* Indexed mint: show the company and every competing claim on it. */}
      {live?.indexed && live.company ? (
        <CompanyBlock company={rateCompany(live.company)} />
      ) : null}

      {/* Unindexed mint: read live, graded on what the chain says. */}
      {live && !live.indexed && live.rating ? (
        <LiveCard mint={query} rating={live.rating} />
      ) : null}

      {query && !isAddress && results.length === 0 ? (
        <p className="muted">
          No tokenized equity found for “{query}”. Try a company name, a ticker, or paste a
          mint address.
        </p>
      ) : null}

      {(query ? results : featured).map((c) => (
        <CompanyBlock key={c.id} company={c} />
      ))}

      {!query ? (
        <div className="stats">
          <div className="stat">
            <div className="stat-n">{stats.largestDelegateReach.toLocaleString()}</div>
            <div className="stat-l">tokenized equities one key can seize from any wallet</div>
          </div>
          <div className="stat">
            <div className="stat-n">{(stats.probed - stats.routable).toLocaleString()}</div>
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
      ) : null}

      <Disclaimer />
      <Freshness generatedAt={universe.generatedAt} />

      <footer>
        <p>
          <a href="#top" className="back-to-top">↑ Back to the top</a>
        </p>
        Built for the Solana Foundation Stocklana hackathon. Claim reads the chain, grades what
        it finds, and can build the switch — but it never holds a key, never funds anything and
        never submits on your behalf. Your wallet signs, or nothing happens. Data from issuer
        APIs, public Solana RPC and Jupiter quotes. <Link href="/api-docs">Public API</Link>.
      </footer>
      <TopButton />
      </main>
    </>
  );
}
