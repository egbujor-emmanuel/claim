import type { ClaimRating, Finding } from "@/src/lib/rating/grade.js";
import type { RatedCompany } from "@/src/lib/rating/index.js";
import type { ResolvedToken } from "@/src/lib/search.js";

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
        <div className={`grade grade-${rating.grade}`} aria-label={`Grade ${rating.grade}`}>
          {rating.grade}
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
    </article>
  );
}

/** Grades sort worst-first: the thing a holder most needs to see goes on top. */
const GRADE_ORDER = ["F", "D", "C", "B", "A"];

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
