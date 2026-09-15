# Claim

**Not everything called a tokenized stock is a stock.**

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
- **Counterfeit detection** — whether the mint is structurally capable of being what it claims
- **Balance correctness** — whether reading the scaled-UI multiplier naively shows the wrong number

## Findings

Measured across **869 tokenized equities** on 14–15 September 2026.

**One key controls 832 of them.** A single permanent delegate, `5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq`, can move or burn every xStocks token from any wallet on Solana. Three delegate keys exist across the whole universe: 832 / 1 / 1.

**335 tokens display the wrong balance to naive apps.** They carry a scheduled scaled-UI multiplier that has already taken effect, so software reading the `multiplier` field instead of computing the effective value is wrong. NFLXx and PPLTx by **−90%**, PALLx and SPACEX by **−80%**, CRWDx **−75%**, APHx **−50%**. A wallet reading Netflix naively shows you a tenth of your position.

**Almost none of them can be sold.** Of 700 mints probed against Jupiter, **5 had a route**. The rest have no liquidity pool in existence — confirmed independently against DexScreener, which returns no pairs for them.

**Counterfeits are live.** Searching Jupiter for `QQQon` returns nine mints, eight of which are not Ondo's and all of which call themselves "Invesco QQQ (Ondo Tokenized)". One impersonating NVIDIA is a pump.fun mint with a fixed billion supply and no extensions at all.

**And the good news, stated plainly:** all 732 xStocks assets with circulating supply are fully collateralised. None are under-backed.

## Fairness notes

Three places where the obvious reading would have been wrong, and Claim does not take it:

- **No DEX route is not automatically a trap.** Ondo runs no AMM liquidity and expects holders to mint and redeem directly, 24/7. Absence of a Jupiter route is only critical when redemption is *also* closed to the holder.
- **On-chain supply is not circulating supply.** SPCXx has 559,993 minted against 265,083 circulating. Reconciling naively against custody would report it 53% under-backed. It is backed at 1.0018.
- **A ticker collision is not a counterfeit.** Coca-Cola's Ondo ticker is `KOon`, which collides with memecoins named "Kooncoin". Those are counted separately and excluded from the counterfeit numbers.

## Public API

```
GET /api/claim/{mint}
```

Free, unauthenticated, CORS-open. Returns claim structure, issuer powers, exit reality, competing tokens for the same security, and the grade with all its findings.

Any protocol accepting tokenized equities as collateral needs to know whether the issuer can freeze the position mid-liquidation, whether a permanent delegate can seize it, whether it can actually be liquidated at size, and whether the multiplier will silently shift its value. Nothing published that before.

An unknown mint returns `404` with an explicit statement that absence is **not** a safety verdict.

## Running it

```bash
npm install
npm run scan      # build the universe cache: issuer registries + on-chain state
npm run depth     # exit-depth sweep (rate limited, resumable)
npm run verify    # 66-check gate across all three phases
npm run find -- spacex
npm run build && npm start
```

Optional `SOLANA_RPC_URL` for a dedicated RPC. Nothing else is needed — every data source is public and free.

## Design commitments

**Read-only.** Claim never requests a signature, never submits a transaction, never holds keys. There is nothing to approve.

**No mocks.** No synthetic data, no paper trading, no devnet stand-ins. Every number comes from a live source with a visible timestamp.

**Receipts on everything.** Structure claims carry a source URL and a verification date, enforced by the type system and by the test gate. On-chain claims name the account field so you can query it yourself.

**Not advice.** These are sourced descriptions of legal structure and verifiable on-chain state, not legal or investment advice.

## Data sources

| Source | Use | Auth |
|---|---|---|
| `api.xstocks.fi/api/v2/public/*` | assets, multiplier history, proof of reserves, oracles | none |
| Solana JSON-RPC | Token-2022 mint and extension state | none |
| `lite-api.jup.ag` | executable quotes, token search | none |
| DexScreener | independent liquidity cross-check | none |
| prestocks.com, Backpack, Ondo, Backed docs | issuer structure and terms | none |

## Limitations

- Ondo publishes no public asset API we could find. Their mints are discovered through Jupiter and filtered on the `ondo` vanity suffix, which is **inferred from observation, not from a canonical list Ondo publishes**. Confirm with Ondo before treating it as authoritative.
- Backpack/Sunrise coverage is two hand-verified mints rather than a full ingest.
- The Article 8 characterisation of SPCX comes from a secondary report and is flagged as such in the registry.
- Claim structure is a sourced description, not a legal opinion. Where evidence is secondary rather than the issuer's own words, the registry says so.

## Open-source components

Next.js, React, TypeScript, tsx. No forked or copied application code; the registry, rating engine, on-chain reader and adapters are original to this project.

---

Built for the Solana Foundation **Stocklana** hackathon, September 2026.
