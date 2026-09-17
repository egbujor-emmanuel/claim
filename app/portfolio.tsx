import type { PortfolioScan } from "@/src/lib/holdings.js";
import { summarise } from "@/src/lib/holdings.js";
import { Scoring } from "./live";
import { WalletBar } from "./switch/WalletBar";

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

      <Actionable scan={scan} />

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

/**
 * What you can actually do, before the diagnosis.
 *
 * Holdings are ordered worst-claim-first, which is right for reading and wrong
 * for acting: in a real wallet the worst positions are the illiquid ones whose
 * switches cannot be routed, so every card at the top is a dead end and the few
 * live switches sit hundreds of lines below the fold. A holder scrolling that
 * page sees no button anywhere and concludes the product does not work.
 *
 * So the actionable switches are lifted to the top, and the wallet connects
 * from here rather than only from a review page reached through a button that
 * most cards do not have.
 */
function Actionable({ scan }: { scan: PortfolioScan }) {
  const live = scan.holdings.flatMap((h) =>
    h.switches.filter((s) => s.executable).map((s) => ({ holding: h, option: s })),
  );
  const blocked = scan.holdings.reduce(
    (n, h) => n + h.switches.filter((s) => !s.executable).length,
    0,
  );

  if (live.length === 0 && blocked === 0) return null;

  return (
    <div className="actionable">
      <div className="actionable-head">
        {live.length > 0
          ? `${live.length} switch${live.length === 1 ? "" : "es"} you can make right now`
          : "No switch here can be routed on-chain today"}
      </div>

      {live.length > 0 ? (
        <>
          <ul className="actionable-list">
            {live.map(({ holding, option }) => (
              <li key={`${holding.mint}-${option.to.token.mint}`}>
                <span className="actionable-pair">
                  <strong>{holding.symbol}</strong> → <strong>{option.to.token.symbol}</strong>
                  <span className="actionable-grades">
                    {option.fromGrade} → {option.toGrade}
                  </span>
                </span>
                <a
                  className="switch-button"
                  href={`/switch?from=${holding.mint}&to=${option.to.token.mint}`}
                >
                  Review
                </a>
              </li>
            ))}
          </ul>
          <WalletBar hasReviews />
        </>
      ) : null}

      {blocked > 0 ? (
        <p className="actionable-note">
          {blocked} further switch{blocked === 1 ? "" : "es"} would improve{" "}
          {blocked === 1 ? "a claim" : "these claims"} but cannot be routed on a DEX — those
          destinations are issued directly rather than traded. Each card below says where.
        </p>
      ) : null}
    </div>
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
          : best.blockedSide === "destination"
            ? "A stronger claim exists, reached through its issuer"
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
