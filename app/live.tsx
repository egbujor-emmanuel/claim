import type { ClaimRating } from "@/src/lib/rating/grade.js";

/** A mint we read live from chain rather than from the indexed universe. */
export function LiveCard({ mint, rating }: { mint: string; rating: ClaimRating }) {
  return (
    <section>
      <header className="company-head">
        <h2>{rating.symbol}</h2>
        <div className="isin">
          Read live from Solana just now. This mint is not in the indexed universe, so there is
          no issuer catalogue entry or competing-token list behind it — but everything below
          was read from the chain.
        </div>
      </header>

      <article className="card">
        <div className="card-top">
          <div
            className={`grade grade-${rating.grade ?? "NA"}`}
            aria-label={rating.grade ? `Grade ${rating.grade}` : "Not assessed"}
          >
            {rating.grade ?? "–"}
          </div>
          <div className="card-id">
            <div className="sym">{rating.symbol}</div>
            <p className="headline">{rating.headline}</p>
          </div>
        </div>

        <div className="mint">{mint}</div>

        <ul className="findings">
          {rating.findings.map((f, i) => (
            <li key={i} className={`finding f-${f.severity}`}>
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
          ))}
        </ul>

        <Scoring rating={rating} />
      </article>
    </section>
  );
}

/**
 * The arithmetic behind the letter.
 *
 * A grade nobody can audit is an opinion in a serif font. Showing the score,
 * the thresholds and what was charged for lets a reader disagree with one
 * weight instead of dismissing the whole verdict.
 */
export function Scoring({ rating }: { rating: ClaimRating }) {
  if (!rating.inScope) return null;
  const { score, thresholds, reasons } = rating.scoring;
  if (reasons.length === 0) {
    return (
      <details className="scoring">
        <summary>How this grade was reached</summary>
        <p className="f-evidence">
          Nothing counted against this token. Score 0. A is anything below {thresholds.B}.
        </p>
      </details>
    );
  }

  return (
    <details className="scoring">
      <summary>How this grade was reached</summary>
      <table className="score-table">
        <tbody>
          {reasons.map((r, i) => (
            <tr key={i}>
              <td className="score-pts">+{r.points}</td>
              <td>{r.because}</td>
            </tr>
          ))}
          <tr className="score-total">
            <td className="score-pts">{score}</td>
            <td>
              total · F at {thresholds.F}, D at {thresholds.D}, C at {thresholds.C}, B at{" "}
              {thresholds.B}, otherwise A
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  );
}

/** How old the indexed data is, stated plainly rather than hidden. */
export function Freshness({ generatedAt }: { generatedAt: string }) {
  const hours = Math.round((Date.now() - Date.parse(generatedAt)) / 3_600_000);
  const stale = hours > 48;
  const when =
    hours < 1 ? "less than an hour ago" : hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;

  return (
    <p className={`freshness${stale ? " stale" : ""}`}>
      Indexed universe last rebuilt <strong>{when}</strong> ({generatedAt.slice(0, 16).replace("T", " ")} UTC).
      {stale
        ? " Issuer powers and balances may have changed since; rerun npm run scan for current state."
        : " On-chain fields for any single mint are re-read live when you look one up."}
    </p>
  );
}
