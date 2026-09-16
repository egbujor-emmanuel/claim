import type { Issuer } from "../lib/types.js";

/**
 * Issuer registry.
 *
 * Claim structure is an ISSUER-level property, not a per-token one. That is what
 * makes this tractable: a handful of classifications cover every tokenised
 * equity on Solana, including issuers with hundreds of mints.
 *
 * Rules for this file:
 *  - Every non-obvious assertion carries a source URL and a verification date.
 *  - Nothing here is legal advice. These are sourced descriptions of structure,
 *    shown to users next to the source so they can check for themselves.
 *  - Where a source is a secondary report rather than the issuer's own words,
 *    say so in `note`.
 */

const V = "2026-09-14";

export const ISSUERS: Record<string, Issuer> = {
  backpack: {
    id: "backpack",
    name: "Backpack Securities",
    legalEntity: {
      value: "Backpack Securities (US registered broker-dealer)",
      source: "https://learn.backpack.exchange/articles/how-to-hold-spcx",
      verifiedAt: V,
    },
    jurisdiction: {
      value: "United States",
      source:
        "https://www.coindesk.com/tech/2026/06/10/spacex-stock-is-coming-to-solana-on-the-same-day-it-lists-on-nasdaq",
      verifiedAt: V,
    },
    regulatoryStatus: {
      value:
        "Regulated US broker-dealer. Holdings are, in the issuer's own words, UCC Article 8 security entitlements governed under New York law",
      source: "https://learn.backpack.exchange/articles/how-to-hold-spcx",
      verifiedAt: V,
      note: "Confirmed against Backpack's own documentation, not a secondary report.",
    },
    structure: {
      value: "custodied_entitlement",
      source: "https://learn.backpack.exchange/articles/how-to-hold-spcx",
      verifiedAt: V,
      note: "The issuer states tokenized SPCX is redeemable for a real SpaceX share through Backpack Securities, with ACATS and DTCC-compatible transfer infrastructure.",
    },
    redemption: {
      value: "portable_to_brokerage",
      source: "https://x.com/Backpack/status/2065464739749323171",
      verifiedAt: V,
      note: "Issuer states on/off-ramping is available between Solana, Backpack Securities and other traditional brokerages.",
    },
    corporateActions: {
      value: true,
      source: "https://learn.backpack.exchange/articles/how-to-hold-spcx",
      verifiedAt: V,
      note: "Issuer states corporate actions are reflected through proportional token balance adjustments, and dividends are automatically reinvested into additional tokens.",
    },
    shareholderRights: {
      value: true,
      source: "https://learn.backpack.exchange/articles/how-to-hold-spcx",
      verifiedAt: V,
      note: "Issuer describes real ownership rights including cash dividends, corporate actions, brokerage transfers and applicable tax treaty benefits.",
    },
    homepage: "https://backpack.exchange",
    docs: "https://docs.backpack.exchange",
  },

  backed: {
    id: "backed",
    name: "xStocks (Backed)",
    legalEntity: {
      value: "Backed Assets (JE) Limited, Jersey",
      source: "https://docs.xstocks.fi/docs/issuance-and-redemption",
      verifiedAt: V,
    },
    jurisdiction: {
      value: "Jersey issuer, Liechtenstein framework, Swiss-issued ISINs",
      source: "https://api.xstocks.fi/api/v2/public/assets?network=Solana",
      verifiedAt: V,
      note: "Verified directly from the API: SPCXx carries its own ISIN CH1564487366 while the underlying SpaceX share is US84615Q1031. The token is a distinct security from the share.",
    },
    regulatoryStatus: {
      value: "Swiss DLT Act issuer; tokens are tracker certificates, not shares",
      source: "https://solana.com/news/case-study-xstocks",
      verifiedAt: V,
    },
    structure: {
      value: "securitized_exposure",
      source: "https://docs.xstocks.fi/docs/how-xstocks-work",
      verifiedAt: V,
      note: "The claim runs against Backed Assets (JE) Limited, not the underlying company. Confirmed from the issuer's own API: each token carries its own Swiss ISIN distinct from the share it tracks, so the token is a separate security rather than the share itself.",
    },
    redemption: {
      value: "issuer_redemption",
      source: "https://docs.xstocks.fi/docs/issuance-and-redemption",
      verifiedAt: V,
      note: "Verified from the public API: issuance and redemption enabled with a USD 1,000 minimum on 828 of 832 Solana assets. No ACATS/DTCC path.",
    },
    corporateActions: {
      value: true,
      source: "https://docs.xstocks.fi/developers/multipliers",
      verifiedAt: V,
      note: "Dividends and splits arrive as Token-2022 scaled-UI multiplier updates rather than cash. Verified against the multiplier history endpoint.",
    },
    shareholderRights: {
      value: false,
      source:
        "https://blockeden.xyz/blog/2025/09/03/xstocks-on-solana-a-developer-s-field-guide-to-tokenized-equities/",
      verifiedAt: V,
      note: "Price exposure only; tokens do not confer shareholder rights.",
    },
    mintPrefix: "Xs",
    homepage: "https://xstocks.fi",
    docs: "https://docs.xstocks.fi",
  },

  prestocks: {
    id: "prestocks",
    name: "PreStocks",
    legalEntity: {
      value: "PreStocks; special purpose vehicles hold the referenced shares",
      source: "https://prestocks.com/api/prestocks",
      verifiedAt: "2026-09-16",
      note: "The issuer's own API describes each token as backed 1:1 by SPV exposure that tracks the price of the underlying private company.",
    },
    jurisdiction: {
      value: "Not disclosed on the product page",
      source: "https://prestocks.com/spacex",
      verifiedAt: V,
    },
    regulatoryStatus: {
      value:
        "Not affiliated with, endorsed by, or issued by the referenced companies, per the issuer's own disclaimer",
      source: "https://prestocks.com/spacex",
      verifiedAt: V,
      note: "The issuer states its tokens provide only economic exposure.",
    },
    structure: {
      value: "spv_interest",
      source:
        "https://www.coindesk.com/markets/2026/05/13/anthropic-openai-tokens-plunge-nearly-40-as-ai-firms-warn-spv-transfers-are-invalid",
      verifiedAt: V,
      note: "On 13 May 2026 Anthropic and OpenAI stated that transfers of their shares to SPVs are void under their transfer restrictions. PreStocks tokens for both fell 34% and 39% over the following seven days.",
    },
    redemption: {
      value: "mandatory_conversion",
      source: "https://prestocks.com/spacex",
      verifiedAt: V,
      note: "SPACEX must be swapped before 11:59pm UTC on 12 March 2027 or, in the issuer's own words, tokens will expire worthless.",
    },
    corporateActions: {
      value: false,
      source: "https://prestocks.com/spacex",
      verifiedAt: V,
      note: "Economic exposure only. The 5-for-1 split was reflected as a scaled-UI multiplier change, verified on chain.",
    },
    shareholderRights: {
      value: false,
      source: "https://prestocks.com/spacex",
      verifiedAt: V,
    },
    mintPrefix: "Pre",
    homepage: "https://prestocks.com",
  },

  tessera: {
    id: "tessera",
    name: "Tessera",
    legalEntity: {
      value: "Tessera; the holder is a participant in a lending arrangement, not a shareholder",
      source: "https://cdn.tesseralab.co/tessera/t-openai.json",
      verifiedAt: "2026-09-16",
      note: "Taken from the token's own on-chain metadata document, which is as primary as a source gets.",
    },
    jurisdiction: {
      value: "Not disclosed in the token metadata or the public documentation",
      source: "https://docs.tessera.pe/",
      verifiedAt: "2026-09-16",
    },
    regulatoryStatus: {
      value: "Issuer states T-Tokens are a loan product and not a security, while noting regulatory treatment may vary by jurisdiction",
      source: "https://docs.tessera.pe/",
      verifiedAt: "2026-09-16",
    },
    structure: {
      value: "loan_participation",
      source: "https://cdn.tesseralab.co/tessera/t-openai.json",
      verifiedAt: "2026-09-16",
      note: "In the issuer's own words: a loan participation right giving economic exposure, and token holders have no ownership, voting or dividend rights in the referenced company.",
    },
    redemption: {
      value: "secondary_only",
      source: "https://cdn.tesseralab.co/tessera/t-openai.json",
      verifiedAt: "2026-09-16",
      note: "Redeemable only following divestment of the underlying exposure, which the holder cannot initiate. Until then the open market is the only exit.",
    },
    corporateActions: {
      value: false,
      source: "https://cdn.tesseralab.co/tessera/t-openai.json",
      verifiedAt: "2026-09-16",
      note: "No dividend rights, and the mint carries no scaled-UI multiplier to express one.",
    },
    shareholderRights: {
      value: false,
      source: "https://cdn.tesseralab.co/tessera/t-openai.json",
      verifiedAt: "2026-09-16",
      note: "Issuer states holders have no ownership, voting or dividend rights.",
    },
    homepage: "https://app.tessera.pe/",
    docs: "https://docs.tessera.pe/",
  },

  ondo: {
    id: "ondo",
    name: "Ondo Global Markets",
    legalEntity: {
      value: "Ondo Finance; shares held at US-registered broker-dealers",
      source: "https://ondo.finance/blog/global-markets-live-on-solana",
      verifiedAt: V,
    },
    jurisdiction: {
      value: "Non-US retail and institutional; EU access waitlisted",
      source: "https://docs.ondo.finance/ondo-stocks/investing-and-redeeming",
      verifiedAt: V,
    },
    regulatoryStatus: {
      value: "Backed 1:1 by securities held at US-registered broker-dealers",
      source: "https://solana.com/news/ondo-global-markets-tokenized-stocks-etfs-solana",
      verifiedAt: V,
    },
    structure: {
      value: "securitized_exposure",
      source: "https://solana.com/news/ondo-global-markets-tokenized-stocks-etfs-solana",
      verifiedAt: V,
      note: "Backed 1:1 by securities at US-registered broker-dealers; the holder's claim runs against Ondo rather than the underlying company. Verified on chain: every Ondo mint shares one mint authority and carries no permanent delegate, so Ondo cannot move tokens out of a holder's wallet.",
    },
    redemption: {
      value: "issuer_redemption",
      source: "https://ondo.finance/blog/real-24-7-trading-for-tokenized-stocks",
      verifiedAt: V,
      note: "24/7 mint and redemption for eligible users.",
    },
    corporateActions: {
      value: true,
      source: "https://docs.ondo.finance/ondo-stocks/investing-and-redeeming",
      verifiedAt: V,
    },
    shareholderRights: {
      value: false,
      source: "https://docs.ondo.finance/ondo-stocks/investing-and-redeeming",
      verifiedAt: V,
    },
    homepage: "https://ondo.finance",
    docs: "https://docs.ondo.finance",
  },
};

/** Explicit mint to issuer mappings, checked before vanity-prefix matching. */
export const MINT_ISSUER_OVERRIDES: Record<string, string> = {
  SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb: "backpack",
  Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8: "backed",
  PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh: "prestocks",
};

export function issuerForMint(mint: string): Issuer | null {
  const override = MINT_ISSUER_OVERRIDES[mint];
  if (override) return ISSUERS[override] ?? null;
  for (const issuer of Object.values(ISSUERS)) {
    if (issuer.mintPrefix && mint.startsWith(issuer.mintPrefix)) return issuer;
  }
  return null;
}
