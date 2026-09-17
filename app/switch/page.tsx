import Link from "next/link";
import { byMint } from "@/src/lib/search.js";
import { buyTarget } from "@/src/lib/buy.js";
import { betterClaims } from "@/src/lib/switch.js";
import { rateToken } from "@/src/lib/rating/index.js";
import { SwitchClient } from "./SwitchClient";

/**
 * The review step.
 *
 * Deliberately a separate page rather than an inline button. Claim has just
 * told someone the thing they hold is weaker than they thought, and moving
 * straight from that to a one-click trade would be pressure. This page restates
 * what they are leaving, what they are getting, and what they give up, before
 * a wallet is ever opened.
 */
export default async function SwitchPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from = "", to = "" } = await searchParams;

  // Two arrivals reach this page. A switch moves between claims on one company
  // and the holder already owns the weaker side. A purchase comes from the buy
  // list, where the funding token is whatever the buyer holds -- usually USDC,
  // which is not a tokenized equity and so belongs to no company at all.
  const destinationCompany = to ? byMint(to) : null;
  const company = from ? byMint(from) : null;
  const sameCompany = Boolean(company && destinationCompany && company.id === destinationCompany.id);

  if (!sameCompany && destinationCompany) {
    return <Purchase fromMint={from} toMint={to} />;
  }

  const held = company?.tokens.find((t) => t.token.mint === from);
  const target = company?.tokens.find((t) => t.token.mint === to);

  if (!company || !held || !target) {
    return (
      <main className="wrap">
        <p className="wordmark">
          <Link href="/">Claim</Link> · Switch
        </p>
        <div className="note-box">
          That pair could not be resolved. A switch has to be between two claims on the same
          company, both of which Claim indexes. <Link href="/">Start again</Link>.
        </div>
      </main>
    );
  }

  const option = betterClaims(from, company).find((o) => o.to.token.mint === to);
  const heldRating = rateToken(held);
  const targetRating = rateToken(target);

  return (
    <main className="wrap">
      <header className="masthead">
        <p className="wordmark">
          <Link href="/">Claim</Link> · Switch
        </p>
        <h1 className="thesis">
          {held.token.symbol} → {target.token.symbol}
        </h1>
        <p className="standfirst">
          Both reference {company.name}. They are not the same asset, and this page is here so
          the difference is in front of you before anything is signed.
        </p>
      </header>

      <div className="switch-compare">
        <article className="card">
          <div className="card-top">
            <div className={`grade grade-${heldRating.grade ?? "NA"}`}>
              {heldRating.grade ?? "–"}
            </div>
            <div className="card-id">
              <div className="sym">You hold {held.token.symbol}</div>
              <div className="issuer">{held.issuer?.name}</div>
              <p className="headline">{heldRating.headline}</p>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card-top">
            <div className={`grade grade-${targetRating.grade ?? "NA"}`}>
              {targetRating.grade ?? "–"}
            </div>
            <div className="card-id">
              <div className="sym">You would hold {target.token.symbol}</div>
              <div className="issuer">{target.issuer?.name}</div>
              <p className="headline">{targetRating.headline}</p>
            </div>
          </div>
        </article>
      </div>

      {option ? (
        <div className="switch">
          <div className="switch-head">
            What changes
            <span className="switch-grades">
              {option.fromGrade} → {option.toGrade}
            </span>
          </div>
          <ul className="switch-reasons">
            {option.gains.map((g, i) => (
              <li key={i} className="switch-gain">
                {g}
              </li>
            ))}
            {option.tradeoffs.map((t, i) => (
              <li key={`t${i}`} className="switch-tradeoff">
                {t}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {option && !option.executable ? (
        <div className="note-box">
          <strong>This switch cannot be executed.</strong>
          <br />
          {option.blockedReason}
        </div>
      ) : (
        <SwitchClient
        fromMint={from}
        toMint={to}
        fromSymbol={held.token.symbol}
        toSymbol={target.token.symbol}
          decimals={held.token.decimals ?? 9}
        />
      )}

      <div className="note-box">
        Claim builds the transaction and hands it to your wallet. It never holds a key, never
        funds anything and never submits on your behalf. The route comes from Jupiter, the
        destination is re-read from the chain immediately before the transaction is built, and
        nothing here is investment advice.
      </div>

      <footer>
        <Link href="/">Back to Claim</Link>
      </footer>
    </main>
  );
}

/**
 * Buying a company, rather than repairing a position.
 *
 * The buyer holds no claim on this security yet, so there is nothing to compare
 * against and nothing to leave behind. What they need instead is what they are
 * about to get, and -- where Claim had to compromise -- what they are not
 * getting and why, before a wallet opens.
 */
async function Purchase({ fromMint, toMint }: { fromMint: string; toMint: string }) {
  const company = byMint(toMint);
  const target = company?.tokens.find((t) => t.token.mint === toMint);
  const plan = company ? buyTarget(company) : null;

  if (!company || !target || !plan?.reachable) {
    return (
      <main className="wrap" id="top">
        <p className="wordmark">
          <Link href="/">Claim</Link> · Buy
        </p>
        <div className="note-box">
          Claim cannot route a purchase into that token. <Link href="/buy">See what it can reach</Link>.
        </div>
      </main>
    );
  }

  const rating = rateToken(target);
  const funding = byMint(fromMint)?.tokens.find((t) => t.token.mint === fromMint);
  const fundingSymbol = funding?.token.symbol ?? "USDC";

  return (
    <main className="wrap" id="top">
      <header className="masthead">
        <p className="wordmark">
          <Link href="/">Claim</Link> · <Link href="/buy">Buy</Link>
        </p>
        <h1 className="thesis">Buy {company.name}</h1>
        <p className="standfirst">
          Claim chose the token, not the venue. This is the strongest claim on {company.name}
          {" "}that a swap can actually land in today.
        </p>
      </header>

      <article className="card">
        <div className="card-top">
          <div className={`grade grade-${rating.grade ?? "NA"}`}>{rating.grade ?? "–"}</div>
          <div className="card-id">
            <div className="sym">You would hold {target.token.symbol}</div>
            <div className="issuer">{target.issuer?.name}</div>
            <p className="headline">{rating.headline}</p>
          </div>
        </div>
        <ul className="findings">
          {rating.findings.map((f, i) => (
            <li key={i} className={`finding f-${f.severity}`}>
              <div className="f-msg">{f.message}</div>
              <div className="f-evidence">{f.evidence}</div>
            </li>
          ))}
        </ul>
      </article>

      {plan.compromised ? (
        <div className="note-box">
          <strong>This is not the strongest claim on {company.name}.</strong>
          <br />
          {plan.unreachableBecause} Claim is routing you into{" "}
          {plan.reachable.token.token.symbol} ({plan.reachable.grade}) because it is the best one
          a swap can reach. If the stronger claim matters more to you than the convenience, go to
          the issuer instead — that is a real option and this page is not trying to talk you out
          of it.
        </div>
      ) : null}

      <SwitchClient
        fromMint={fromMint}
        toMint={toMint}
        fromSymbol={fundingSymbol}
        toSymbol={target.token.symbol}
        decimals={funding?.token.decimals ?? 6}
      />

      <div className="note-box">
        Claim builds the transaction and hands it to your wallet. It never holds a key, never
        funds anything and never submits on your behalf. The route comes from Jupiter, the
        destination is re-read from the chain immediately before the transaction is built, and
        nothing here is investment advice.
      </div>

      <footer>
        <Link href="/buy">Back to the buy list</Link>
      </footer>
    </main>
  );
}
