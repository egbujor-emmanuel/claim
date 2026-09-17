import Link from "next/link";
import { buyableCompanies } from "@/src/lib/buy.js";
import { WalletBar } from "../switch/WalletBar";
import { TopButton } from "../TopButton";

/**
 * Buy a company, not a ticker.
 *
 * Every router in this space sells you whichever mint has a pool. For 83 of the
 * 154 companies that can be reached by a swap at all, that is not the strongest
 * claim on the company -- buy "Apple" anywhere today and you get a Jersey
 * certificate with a seizure delegate, while the real shares sit on a venue the
 * router cannot see.
 *
 * So Claim picks the destination and shows its working, including when the one
 * it picked is a compromise and what the better claim would have been.
 */
export const metadata = {
  title: "Buy — Claim",
  description:
    "Buy a company on Solana and get the strongest claim that can actually be reached, with the compromise stated when there is one.",
};

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export default function BuyPage() {
  const targets = buyableCompanies().sort((a, b) => a.company.name.localeCompare(b.company.name));
  const compromised = targets.filter((t) => t.compromised).length;

  return (
    <main className="wrap" id="top">
      <header className="masthead">
        <p className="wordmark">
          <Link href="/">Claim</Link> · Buy
        </p>
        <h1 className="thesis">Buy the company. Claim picks the claim.</h1>
        <p className="standfirst">
          {targets.length} companies can be reached by a swap on Solana today. For{" "}
          <strong>{compromised}</strong> of them the strongest claim is not the one you can buy,
          and every venue that sells you the weaker one does it without saying so. Claim routes
          into the best claim it can actually reach, and tells you when that is a compromise.
        </p>
      </header>

      <div className="actionable">
        <div className="actionable-head">Pay with USDC, from your own wallet</div>
        <p className="actionable-note">
          Claim builds the swap and hands it to your wallet unsigned. It never holds a key and
          never submits — you approve the amount, or nothing happens.
        </p>
        <WalletBar />
      </div>

      <section>
        <ul className="buy-list">
          {targets.map((t) => (
            <li key={t.company.id} className={t.compromised ? "buy-row compromised" : "buy-row"}>
              <div className="buy-id">
                <span className="buy-name">{t.company.name}</span>
                <span className="buy-sym mono">
                  {t.reachable!.token.token.symbol}
                  {t.reachable!.token.issuer ? ` · ${t.reachable!.token.issuer.name}` : null}
                </span>
              </div>

              <div className={`grade grade-${t.reachable!.grade ?? "NA"}`}>
                {t.reachable!.grade ?? "–"}
              </div>

              <div className="buy-note">
                {t.compromised ? (
                  <>
                    Strongest is <strong>{t.strongest.token.token.symbol}</strong> (
                    {t.strongest.grade}), which cannot be bought with a swap.
                  </>
                ) : (
                  <>This is the strongest claim on {t.company.name}.</>
                )}
              </div>

              <a className="switch-button" href={`/switch?from=${USDC}&to=${t.reachable!.token.token.mint}`}>
                Review
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="note-box">
        A grade here describes the legal claim, not the company. A C-graded Apple token is still
        exposure to Apple — it is the wrapper around it that is weaker, and the review page says
        exactly how before anything is signed.
      </div>

      <footer>
        <p>
          <a href="#top" className="back-to-top">↑ Back to the top</a>
        </p>
        <Link href="/">Back to Claim</Link>
      </footer>
      <TopButton />
    </main>
  );
}
