import type { ClaimRating, Finding } from "@/src/lib/rating/grade.js";
import type { RatedCompany } from "@/src/lib/rating/index.js";
import type { ResolvedToken } from "@/src/lib/search.js";
import { Scoring } from "./live";
import { betterClaims, type SwitchOption } from "@/src/lib/switch.js";
import { WalletBar } from "./switch/WalletBar";

function isUrl(s: string) {
  return s.startsWith("http://") || s.startsWith("https://");
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <li className={`finding f-${f.severity}`}>
      <div className="f-msg">{f.message}</div>
      <div className="f-evidence">
        {f.evidence}
        {f.source ? (
          <>
            {" · "}
            <a href={f.source} target="_blank" rel="noreferrer noopener">
              source
            </a>
          </>
        ) : null}
      </div>
    </li>
  );
}

export function TokenCard({
  resolved,
  rating,
}: {
  resolved: ResolvedToken;
  rating: ClaimRating;
}) {
  const { token, issuer } = resolved;
  return (
    <article className="card">
      <div className="card-top">
        <div
          className={`grade grade-${rating.grade ?? "NA"}`}
          aria-label={rating.grade ? `Grade ${rating.grade}` : "Not assessed"}
        >
          {rating.grade ?? "–"}
        </div>
        <div className="card-id">
          <div className="sym">{token.symbol}</div>
          <div className="issuer">
            {token.name}
            {issuer ? ` · ${issuer.name}` : null}
          </div>
          <p className="headline">{rating.headline}</p>
        </div>
      </div>

      <div className="mint">{token.mint}</div>

      <ul className="findings">
        {rating.findings.map((f, i) => (
          <FindingRow key={i} f={f} />
        ))}
      </ul>

      <Scoring rating={rating} />
    </article>
  );
}

/** Grades sort worst-first: the thing a holder most needs to see goes on top. */
const GRADE_ORDER = ["F", "D", "C", "B", "A"];

/**
 * Every move available between this company's tokens.
 *
 * The company page was the strongest screen in the product and the only one you
 * could not act from: it diagnosed four different legal claims on SpaceX and
 * then offered nothing to do about it. Searching a company is how most people
 * arrive, so the page has to carry the same action the wallet scan does.
 *
 * Unlike a scan, nothing here is known to be held. So the moves are stated
 * conditionally -- if you hold this, you can move to that -- and the review
 * page is where the holder's own balance and quote come in.
 */
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function CompanyActions({ company }: { company: RatedCompany }) {
  const moves: { from: ResolvedToken; option: SwitchOption }[] = [];
  const seen = new Set<string>();
  for (const t of company.tokens) {
    for (const o of betterClaims(t.token.mint, company)) {
      const key = `${t.token.mint}->${o.to.token.mint}`;
      if (seen.has(key)) continue;
      seen.add(key);
      moves.push({ from: t, option: o });
    }
  }
  // Silence reads as breakage. When no move exists it is because every token
  // here already grades the same, which is a finding about the company and
  // worth one line rather than an empty page.
  if (moves.length === 0) {
    if (company.tokens.length < 2) {
      return (
        <div className="actionable">
          <div className="actionable-head">One representation of {company.name} on Solana</div>
          <p className="actionable-note">
            Claim indexes a single token for this company, so there is nothing to switch to. The
            grade below still says what the claim is worth, and connecting lets Claim read what
            you hold.
          </p>
          <WalletBar />
        </div>
      );
    }
    return (
      <div className="actionable">
        <div className="actionable-head">No stronger claim to move to</div>
        <p className="actionable-note">
          All {company.tokens.length} tokens on {company.name} grade the same, so switching
          between them would not improve the claim. The differences below are still real —
          different issuers, different counterparties — they just do not rank one above another.
        </p>
        <WalletBar />
      </div>
    );
  }

  const live = moves.filter((m) => m.option.executable);
  const blocked = moves.length - live.length;

  return (
    <div className="actionable">
      <div className="actionable-head">
        {live.length > 0
          ? `${live.length} move${live.length === 1 ? "" : "s"} to a stronger claim on ${company.name}`
          : `No move between these tokens can be routed on-chain today`}
      </div>

      {live.length > 0 ? (
        <>
          <ul className="actionable-list">
            {live.map(({ from, option }) => (
              <li key={`${from.token.mint}-${option.to.token.mint}`}>
                <span className="actionable-pair">
                  <strong>{from.token.symbol}</strong> → <strong>{option.to.token.symbol}</strong>
                  <span className="actionable-grades">
                    {option.fromGrade} → {option.toGrade}
                  </span>
                </span>
                <a
                  className="switch-button"
                  href={`/switch?from=${from.token.mint}&to=${option.to.token.mint}`}
                >
                  Review
                </a>
              </li>
            ))}
          </ul>
          <p className="actionable-note">
            These are the routes that exist today. If you hold the token on the left, the review
            page quotes your own size before anything is signed.
          </p>
          <WalletBar hasReviews />
        </>
      ) : null}

      {blocked > 0 ? (
        <p className="actionable-note">
          {blocked} further move{blocked === 1 ? "" : "s"} would improve the claim but cannot be
          routed on a DEX — those destinations are issued directly rather than traded.
        </p>
      ) : null}

      {/* Connecting belongs on every company page, not only where a route
          happens to exist today. A holder arriving at a company wants to know
          what they hold before they care whether it can be swapped. */}
      {live.length === 0 ? <WalletBar /> : null}
    </div>
  );
}

export function CompanyBlock({ company }: { company: RatedCompany }) {
  const ordered = [...company.tokens].sort((a, b) => {
    const ga = company.ratings[a.token.mint]?.grade ?? "F";
    const gb = company.ratings[b.token.mint]?.grade ?? "F";
    return GRADE_ORDER.indexOf(ga) - GRADE_ORDER.indexOf(gb);
  });

  return (
    <section>
      <header className="company-head">
        <h2>
          {company.name}
          {company.underlyingSymbol ? (
            <span className="muted"> · {company.underlyingSymbol}</span>
          ) : null}
        </h2>
        {company.underlyingIsin ? (
          <div className="isin mono">underlying security {company.underlyingIsin}</div>
        ) : null}
        {company.contested ? (
          <div className="contested">
            These tokens confer materially different legal claims
          </div>
        ) : company.multiToken ? (
          <div className="isin">
            {company.tokens.length} tokens, different issuers and different counterparties
          </div>
        ) : null}
      </header>

      <CompanyActions company={company} />

      {ordered.map((resolved) => {
        const rating = company.ratings[resolved.token.mint];
        if (!rating) return null;
        return <TokenCard key={resolved.token.mint} resolved={resolved} rating={rating} />;
      })}
    </section>
  );
}

export function Disclaimer() {
  return (
    <div className="note-box">
      Structure descriptions are sourced and linked, not legal or investment advice. Every
      on-chain field shown here is readable from any public Solana RPC, so you can check all
      of it yourself rather than taking our word for it.
    </div>
  );
}

export { isUrl };
