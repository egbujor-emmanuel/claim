import Link from "next/link";
import GlyphPortal from "@/components/ui/glyph-portal";

/**
 * The opening frame.
 *
 * You scroll through a letter of the word CLAIM and come out inside the thing
 * the word means. That is the argument in one gesture: the shape you were
 * looking at turns out to be a place with its own rules.
 *
 * Deliberate choices:
 *  - No webfont. The component's own Arial Black fallback is used, so the hero
 *    never waits on a network request and never shifts as a face swaps in. The
 *    component freezes whichever face is available at mount for exactly that
 *    reason, and a hero that stalls is worse than a hero in a system face.
 *  - Palette is taken from the app's own tokens rather than the component's
 *    green default, so the portal opens into Claim rather than into a demo.
 *  - Rendered only on the unsearched landing page. Someone who has searched is
 *    looking for an answer and should not have to scroll past a title sequence
 *    to reach it.
 *  - prefers-reduced-motion is handled inside the component: the pin releases,
 *    the copy shows statically, and nothing animates.
 */
export function Hero({ stat }: { stat: { tokens: number; contested: number } }) {
  return (
    <GlyphPortal
      word="CLAIM"
      scrollLength={2.6}
      fontWeight={900}
      enterLabel="See the evidence"
      style={{
        "--gp-paper": "var(--bg)",
        "--gp-ink": "var(--text)",
        "--gp-field": "#0c1a14",
        "--gp-foreground": "#f2f5f3",
      }}
      front={
        <div className="hero-front">
          <div className="hero-top">
            <span className="hero-mark">Claim</span>
            <span className="hero-kicker">Tokenized equities on Solana</span>
          </div>
          <p className="hero-eyebrow">Not everything called a tokenized stock is a stock.</p>
          <p className="hero-support">
            {stat.contested.toLocaleString()} companies on Solana have tokens that are not
            legally equivalent.
          </p>
          <span className="hero-scroll">Scroll through a letter ↓</span>
        </div>
      }
    >
      <div className="hero-copy">
        <h2>Four SpaceX tokens trade on Solana. They confer four different legal relationships.</h2>
        <div className="hero-grid">
          <div className="hero-item">
            <h3>
              <span className="hero-no">SPCX</span>Backpack Securities
            </h3>
            <p>
              Real shares in regulated custody, portable to a traditional brokerage. A UCC
              Article 8 security entitlement, in the issuer&apos;s own words.
            </p>
          </div>
          <div className="hero-item">
            <h3>
              <span className="hero-no">SPCXx</span>Backed, Jersey
            </h3>
            <p>
              A certificate against an offshore issuer, carrying its own Swiss ISIN. Price
              exposure, not ownership.
            </p>
          </div>
          <div className="hero-item">
            <h3>
              <span className="hero-no">tSpaceX</span>Tessera
            </h3>
            <p>
              A loan participation right, not equity. In the issuer&apos;s own words, holders
              have no ownership, voting or dividend rights.
            </p>
          </div>
          <div className="hero-item">
            <h3>
              <span className="hero-no">SPACEX</span>PreStocks
            </h3>
            <p>
              An SPV interest that expires worthless on 12 March 2027 if it is not swapped,
              and taxes every transfer 0.5%.
            </p>
          </div>
        </div>
        <p className="hero-foot">
          Claim reads all {stat.tokens.toLocaleString()} of them from the chain and says which
          is which. <Link href="/?q=spacex">Start with SpaceX</Link>.
        </p>
      </div>
    </GlyphPortal>
  );
}
