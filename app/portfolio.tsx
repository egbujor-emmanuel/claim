import type { PortfolioScan } from "@/src/lib/holdings.js";
import { summarise } from "@/src/lib/holdings.js";
import { Scoring } from "./live";

/**
 * A wallet's positions, worst claim first.
 *
 * Someone scanning an address needs the problem, not an inventory. So the
 * ordering is by claim strength and the switch sits on the card rather than
 * behind a tab: the whole point is that there is something to do about it.
 */
export function Portfolio({ scan }: { scan: PortfolioScan }) {
  return (
    <section>
      <header className="company-head">
        <h2>Holdings</h2>
        <div className="isin mono">{scan.address}</div>
        <p className="portfolio-summary">{summarise(scan)}</p>
        {scan.omittedCount > 0 ? (
          <p className="isin">
            Showing the {scan.holdings.length} positions that most need attention, worst claim
            first. {scan.omittedCount} further position
            {scan.omittedCount === 1 ? " is" : "s are"} held and counted in the summary above
            but not drawn here.
          </p>
        ) : null}
        {scan.otherTokenCount > 0 ? (
          <p className="isin">
            {scan.otherTokenCount} other token account
            {scan.otherTokenCount === 1 ? "" : "s"} at this address are not tokenized equities and
            were not assessed.
          </p>
        ) : null}
      </header>

      {scan.holdings.length === 0 ? (
        <div className="note-box">
          No tokenized equities found here. That is not a verdict about the address — it simply
          holds none of the {"issuers"} Claim indexes.
        </div>
      ) : null}

      {scan.holdings.map((h) => (
        <article className="card" key={h.mint}>
          <div className="card-top">
            <div
              className={`grade grade-${h.rating.grade ?? "NA"}`}
              aria-label={h.rating.grade ? `Grade ${h.rating.grade}` : "Not assessed"}
            >
              {h.rating.grade ?? "–"}
            </div>
            <div className="card-id">
              <div className="sym">
                {h.symbol}
                <span className="holding-amount">
                  {h.uiAmount.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                </span>
              </div>
              <div className="issuer">
                {h.name}
                {h.token.issuer ? ` · ${h.token.issuer.name}` : null}
              </div>
              <p className="headline">{h.rating.headline}</p>
            </div>
          </div>

          {h.multiplierApplied ? (
            <p className="holding-note">
              Balance shown with the scaled-UI multiplier applied. A wallet reading the raw
              field would show a different number.
            </p>
          ) : null}

          <div className="mint">{h.mint}</div>

          <ul className="findings">
            {h.rating.findings.map((f, i) => (
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

          {h.switches.length > 0 ? <SwitchPanel holding={h} /> : null}

          <Scoring rating={h.rating} />
        </article>
      ))}
    </section>
  );
}

function SwitchPanel({ holding }: { holding: PortfolioScan["holdings"][number] }) {
  const best = holding.switches[0];
  if (!best) return null;

  return (
    <div className="switch">
      <div className="switch-head">
        {best.executable
          ? "A stronger claim on the same company is available"
          : "A stronger claim exists, but this position cannot be sold"}
        <span className="switch-grades">
          {best.fromGrade} → {best.toGrade}
        </span>
      </div>

      <div className="switch-target">
        Switch to <strong>{best.to.token.symbol}</strong>
        {best.to.issuer ? ` · ${best.to.issuer.name}` : null}
      </div>

      <ul className="switch-reasons">
        {best.gains.map((g, i) => (
          <li key={i} className="switch-gain">
            {g}
          </li>
        ))}
        {best.tradeoffs.map((t, i) => (
          <li key={`t${i}`} className="switch-tradeoff">
            {t}
          </li>
        ))}
      </ul>

      {best.executable ? (
        <form action="/switch" method="get">
          <input type="hidden" name="from" value={holding.mint} />
          <input type="hidden" name="to" value={best.to.token.mint} />
          <button type="submit" className="switch-button">
            Review this switch
          </button>
        </form>
      ) : (
        <p className="switch-blocked">{best.blockedReason}</p>
      )}
    </div>
  );
}
