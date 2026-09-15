# Claim

**Not everything called a tokenized stock is a stock.**

**Live: https://claim-puce-kappa.vercel.app** · [Public API](https://claim-puce-kappa.vercel.app/api-docs) · read-only, no wallet, nothing to sign.

Three SpaceX tokens trade on Solana right now. They look interchangeable in a wallet. They are not.

| | SPCX | SPCXx | SPACEX |
|---|---|---|---|
| Issuer | Backpack Securities | Backed Assets (JE) Ltd | PreStocks |
| Structure | Custodied entitlement | Securitized exposure | **SPV interest** |
| What you own | Real shares, 1:1 in regulated custody | A certificate against a Jersey entity | An interest in a vehicle holding the shares |
| Exit | Portable to a traditional brokerage | Redeem with the issuer, $1,000 minimum | **Swap by 12 Mar 2027 or it expires worthless** |
| Transfer fee | none | none | **0.5%, uncapped** |
| Keys controlling the mint | 2 | 4 | **1** |
| Balance display | correct | correct | **naive apps show 20% of your real balance** |
| Claim grade | **B** | **B** | **F** |

Every cell is read from live data. Every assertion links to its source.

## Why this matters now

On 13 May 2026, PreStocks tokens for Anthropic and OpenAI fell **34%** and **39%** in seven days after both companies stated that transfers of their shares into SPVs are void under their transfer restrictions. Anthropic put eight secondary platforms on notice and warned that third parties selling such exposure "may be engaging in fraud or offering investments with no real value."

Same issuer. Same structure. Live on Solana today.

Meanwhile every other tool in this space — aggregators, terminals, "best price" routers — compares tokens on **price, spread and liquidity**, and treats the legal claim as interchangeable. Rank the SpaceX tokens by price and the cheapest option is the one that evaporates in March 2027.

Claim is the missing dimension.

## What it does

**Search a company, not a ticker.** Tickers are the problem — `SPCX`, `SPCXx` and `SPACEX` all reference the same SpaceX shares. Searching the company forces the comparison.

For every token Claim reports:

- **Claim structure** — direct entitlement, custodied entitlement, securitized exposure, SPV interest, synthetic, or unbacked, following the post-Anthropic/OpenAI legal framework
- **Redemption reality** — portable to a brokerage, redeemable with the issuer, or a conversion deadline that destroys value if missed
- **Issuer powers, read from chain** — permanent delegate, pause authority, transfer fee, transfer hook, and how many distinct keys control the mint
- **Exit depth** — real executable Jupiter quotes at $1k / $10k / $100k / $1M, not modelled slippage
- **Issuer identity** — whether the mint actually carries the issuer's on-chain fingerprint, rather than merely looking like it does
- **Counterfeit detection** — whether the mint is structurally capable of being what it claims
- **Balance correctness** — whether reading the scaled-UI multiplier naively shows the wrong number

## Findings

<!-- findings:start -->
Measured across **2,050 tokenized equities** from four issuers — xStocks 837, Backpack Securities 1,138, Ondo 74, PreStocks 1 — covering 1,402 companies. Regenerate any figure below with `npm run findings`.

**586 companies carry tokens that confer materially different legal claims.** Not different prices for the same thing — different things. Of 586 companies represented by more than one token, every single one spans issuers whose tokens are not legally equivalent.

**One key can seize 1,138 of them.** A single permanent delegate, `2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a`, can move or burn that many tokenized equities out of any wallet on Solana without the holder's consent. Across the whole universe there are only 3 such keys, covering 1,976 of 2,050 tokens.

**74 tokens have no permanent delegate at all** — every Ondo mint. Ondo is the only issuer that cannot take tokens out of a holder's wallet, and that is worth saying as plainly as the risks.

**357 tokens display the wrong balance to naive apps.** They carry a scheduled scaled-UI multiplier that has already taken effect, so software reading the `multiplier` field instead of computing the effective value is wrong. PPLTx shows **10%**, NFLXx shows **10%**, PALLx shows **20%**, SPACEX shows **20%**, CRWDx shows **25%**, APHx shows **50%** of the real position.

**Almost none of them can be sold.** All 2,050 were probed against Jupiter. **96 have a route. 1,954 have none** — no liquidity pool in existence, cross-checked against DexScreener, which returns no pairs for them.

**And a route is not an exit.** Full quote ladders were measured for every routable mint. **38 can absorb a $10,000 sale inside 5% slippage** — out of 2,050.

**Counterfeits are live.** Searching Jupiter for `QQQon` returns nine mints, eight of which fail on-chain verification against Ondo's mint authority, and all of which call themselves "Invesco QQQ (Ondo Tokenized)". One impersonating NVIDIA is a pump.fun mint with a fixed billion supply and no extensions at all.

**And the good news, stated plainly:** every xStocks asset with circulating supply is fully collateralised. None are under-backed.
<!-- findings:end -->

## Fairness notes

Four places where the obvious reading would have been wrong, and Claim does not take it:

- **No DEX route is not automatically a trap.** Ondo runs no AMM liquidity and expects holders to mint and redeem directly, 24/7. Absence of a Jupiter route is only critical when redemption is *also* closed to the holder.
- **On-chain supply is not circulating supply.** SPCXx has 559,993 minted against 265,083 circulating. Reconciling naively against custody would report it 53% under-backed. It is backed at 1.0018.
- **A ticker collision is not a counterfeit.** Coca-Cola's Ondo ticker is `KOon`, which collides with memecoins named "Kooncoin". Those are counted separately and excluded from the counterfeit numbers.
- **Risks are not the only thing worth reporting.** Ondo is the only issuer with no permanent delegate on any mint, so they structurally cannot take tokens out of your wallet. Backpack gives every token its own mint authority — 1,138 distinct keys — which is unusually good isolation. Both are stated as prominently as the failures.

## Public API

```
GET https://claim-puce-kappa.vercel.app/api/claim/{mint}
```

Free, unauthenticated, CORS-open. Returns claim structure, issuer powers, exit reality, competing tokens for the same security, and the grade with all its findings.

Any protocol accepting tokenized equities as collateral needs to know whether the issuer can freeze the position mid-liquidation, whether a permanent delegate can seize it, whether it can actually be liquidated at size, and whether the multiplier will silently shift its value. Those facts exist on chain and in issuer documentation, but no single call returned them together before this one.

Any mint works, indexed or not. A mint outside the indexed universe is read live from chain and identified by its on-chain fingerprint, because an unknown address is exactly when someone most needs an answer. A token that is not a tokenized equity at all — a stablecoin, a memecoin — comes back explicitly out of scope with no grade, rather than being failed on a scale it never belonged to. An address with no mint returns `404`, and malformed input `400`, both stating plainly that this is a failure to answer rather than a verdict.

## Running it

```bash
npm install
npm run scan      # build the universe cache: issuer registries + on-chain state
npm run depth     # exit-depth sweep (rate limited, resumable)
npm run verify    # 78-check gate across all three phases
npm run findings  # regenerate the README figures from the caches
npm run find -- spacex
npm run build && npm start
```

Optional `SOLANA_RPC_URL` for a dedicated RPC. Nothing else is needed — every data source is public and free.

## Design commitments

**Read-only.** Claim never requests a signature, never submits a transaction, never holds keys. There is nothing to approve.

**No mocks.** No synthetic data, no paper trading, no devnet stand-ins. Every number comes from a live source with a visible timestamp.

**Receipts on everything.** Structure claims carry a source URL and a verification date, enforced by the type system and by the test gate. On-chain claims name the account field so you can query it yourself.

**Identity is verified, never inferred.** An issuer is recognised by its on-chain fingerprint — the mint authority it signs with, or the permanent delegate it holds — not by the shape of an address. A mint either carries that fingerprint or it does not, and you can check which against any RPC.

**Numbers regenerate.** Every figure in the Findings section is produced by `npm run findings` from the caches. Nothing is typed in by hand, so the README cannot claim something the data does not support.

**Not advice.** These are sourced descriptions of legal structure and verifiable on-chain state, not legal or investment advice. Where evidence is a secondary report rather than an issuer's own words, the registry records that in the fact itself.

## Data sources

| Source | Use | Auth |
|---|---|---|
| `api.xstocks.fi/api/v2/public/*` | assets, multiplier history, proof of reserves, oracles | none |
| `api.backpack.exchange/api/v1/assets` | Backpack Solana mint addresses | none |
| `api.backpack.exchange/api/v1/securities` | CUSIPs, converted to ISINs for exact grouping | none |
| `api.sunrise.xyz/v1/tokens` | independent confirmation of Backpack mints | none |
| Solana JSON-RPC | Token-2022 state, and the authority fingerprints that identify issuers | none |
| `lite-api.jup.ag` | executable quotes, token search | none |
| DexScreener | independent liquidity cross-check | none |
| Issuer documentation | claim structure and terms, cited per fact | none |

## Open-source components

Next.js, React, TypeScript, tsx. No forked or copied application code; the registry, rating engine, on-chain reader and adapters are original to this project.

---

Built for the Solana Foundation **Stocklana** hackathon, September 2026.
