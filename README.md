# Claim

**Not everything called a tokenized stock is a stock.**

**Live: https://claim-puce-kappa.vercel.app** · [Public API](https://claim-puce-kappa.vercel.app/api-docs)

Claim reads the chain, grades what it finds, and then builds the trade that acts on the grade. It never holds a key, never funds anything and never submits on your behalf — your wallet signs, or nothing happens.

Four SpaceX tokens trade on Solana right now. They look interchangeable in a wallet. They confer four different legal relationships.

| | SPCX | SPCXx | tSpaceX | SPACEX |
|---|---|---|---|---|
| Issuer | Backpack Securities | Backed Assets (JE) Ltd | Tessera | PreStocks |
| Structure | Custodied entitlement | Securitized exposure | **Loan participation** | **SPV interest** |
| What you own | Real shares, 1:1 in regulated custody | A certificate against a Jersey entity | **A loan, not equity.** No ownership, voting or dividend rights | An interest in a vehicle holding the shares |
| Exit | Portable to a traditional brokerage | Redeem with the issuer, $1,000 minimum | Only once the issuer divests. You cannot initiate it | **Swap by 12 Mar 2027 or it expires worthless** |
| Transfer fee | none | none | **0.2%, uncapped** | **0.5%, uncapped** |
| Claim grade | **A** | **C** | **C** | **F** |

Tessera says it plainest, in the token's own on-chain metadata: *"This is a loan product, not a security — token holders have no ownership, voting, or dividend rights in OpenAI."*

Every cell is read from live data. Every assertion links to its source.

## Why this matters now

On 13 May 2026, PreStocks tokens for Anthropic and OpenAI fell **34%** and **39%** in seven days after both companies stated that transfers of their shares into SPVs are void under their transfer restrictions. Anthropic put eight secondary platforms on notice and warned that third parties selling such exposure "may be engaging in fraud or offering investments with no real value."

**Both tokens are still listed and still trading.** Claim indexes them from PreStocks' own API and grades them. The same API also publishes two prices for each token — the issuer's mark and the market price — so you can see that SPACEX marks at $143.98 and trades at $112.00, a 22% discount to its own issuer's valuation that no wallet shows you.

Meanwhile every other tool in this space — aggregators, terminals, "best price" routers — compares tokens on **price, spread and liquidity**, and treats the legal claim as interchangeable. Rank the SpaceX tokens by price and the cheapest option is the one that evaporates in March 2027.

Claim is the missing dimension — and it does not stop at the diagnosis.

## It is not a read-only report

Every other entry in this space stops at telling you. Claim offers the move.

Where a stronger claim on the same company exists **and can be reached**, Claim builds the swap transaction and hands it to your wallet. Real Jupiter route, real price impact, quoted at your own size. The destination mint is re-read from the chain immediately before the transaction is built, so a token paused between the quote and the signature cannot be switched into.

Across the universe that is **706 switch options over 588 companies** whose tokens are not legally equivalent. Eleven are routable on a DEX today; the rest are blocked, and Claim says which side is impossible and why:

- **Source blocked** — nobody will buy what you hold, so redemption with the issuer is the only exit.
- **Destination blocked** — the better claim is fine but is not traded on any DEX. Backpack's tokens are the clearest case: they are the strongest claims Claim grades and you get them from Backpack, not from a swap. Claim names the issuer and links it rather than dead-ending.

Nothing is mocked. There is no fake data and no simulated transaction anywhere in this repository.

**The transactions Claim builds have been verified against mainnet.** Signing one costs money, so the honest test short of that is `simulateTransaction`: the validator executes the instructions against current chain state and reports the result, without a signature and without spending anything. Every routable switch in two real wallets simulates clean —

```
SPACEX -> SPCX   (F -> A)  3 hops  SIMULATION: OK  units 263,957
SPACEX -> SPCXx  (F -> C)  2 hops  SIMULATION: OK  units 162,863
SPACEX -> tSpaceX (F -> C) 3 hops  SIMULATION: OK  units 217,083
```

Reproduce it yourself against any address: `npx tsx src/scripts/e2e.ts <wallet>`. A transaction that simulates clean is one a wallet can sign; a transaction that failed here would have failed on chain. The only step not exercised is the signature itself, which belongs to the holder.

`npm run fullcheck` drives the deployed site the way a judge would — every page, every endpoint, every guard — and builds seven real transactions across both the switch and buy paths, each executed by a validator against mainnet. **62 checks, 0 failures**, alongside the 150-check gate and a whole-universe audit of all 2,060 tokens.

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

And then the part that is not a report:

- **The move.** Where a stronger claim on the same company exists and can be reached, Claim builds the swap and hands it to the wallet — quoted at the holder's own size, with the destination mint re-read from chain in the moment before the transaction is built. Where it cannot be reached, Claim says which side of the trade is impossible and, if the destination is issued rather than traded, names the issuer that does sell it.

## Buy a company, not a ticker

Switching answers "what I hold is weak, what else is there". Buying is the question before it: someone wants exposure to Apple and has to choose a mint, with nothing on any venue telling them the mints confer different things.

**154 companies can be reached by a swap on Solana. For 83 of them the strongest claim is not the one you can buy.**

```
Apple     strongest AAPL  (A)  not tradable   reachable AAPLx  (C)
Alphabet  strongest GOOGL (A)  not tradable   reachable GOOGLx (C)
Amazon    strongest AMZN  (A)  not tradable   reachable AMZNx  (C)
SpaceX    strongest SPCX  (A)  tradable       reachable SPCX   (A)
```

Buy Apple on any router today and you get a Jersey certificate carrying a seizure delegate, while the real shares sit on a venue the router cannot see. Claim picks the destination instead of the buyer, and states the compromise on the review page before a wallet opens — including that going to the issuer directly is the better option if the claim matters more than the convenience.

Claim will not route a purchase into anything other than the strongest claim it can reach for that company. The API checks the destination against its own choice rather than trusting the mint it was handed; without that this endpoint is a swap router wearing Claim's name. `npm run buy-e2e` builds real purchases and simulates them on mainnet:

```
Apple    -> AAPLx (C) [compromise]  $1.00 -> 298,134 raw  SIMULATION: OK
Alphabet -> GOOGLx (C) [compromise] $1.00 -> 288,229 raw  SIMULATION: OK
SpaceX   -> SPCX (A)                $1.00 ->   6,513 raw  SIMULATION: OK
```

## Is it priced like the thing it tracks

A token can have impeccable structure and still be mispriced, and a wallet cannot show you that: it knows the token's price and nothing about the share it claims to represent.

Pyth publishes the real equity price on Solana, seconds old. Claim reads it from chain and sets it against the token's own price from a live route:

```
AAPLx   trading 1.7% below Apple        Equity.US.AAPL/USD  $336.83  (17s old)
NVDAx   trading 2.4% below NVIDIA
MSFTx   trading 2.0% above Microsoft
```

901 equity feeds are mapped, one per underlying, cached because the mapping never changes. The prices are not cached — a premium computed an hour ago is answering a different question.

Two things this does **not** do, on purpose. Pyth's Solana feeds for the tokenized versions themselves (`Crypto.AAPLX/USD`, and the `.RR` redemption-ratio feeds) are currently five days and eight weeks stale, so the token side comes from a live Jupiter quote instead — both halves current rather than a fresh number against an old one. And an equity price older than fifteen minutes is refused rather than shown, because a market that is closed publishes nothing new and the gap would be the clock rather than a premium.

The price never moves the grade. The grade is about what you legally own; the premium is a separate fact, reported next to it.

## Findings

<!-- findings:start -->
Measured across **2,060 tokenized equities** from five issuers — xStocks 837, Backpack Securities 1,138, Ondo 74, PreStocks 8, Tessera 3 — covering 1,409 companies. Regenerate any figure below with `npm run findings`.

**588 companies carry tokens that confer materially different legal claims.** Not different prices for the same thing — different things. Of 588 companies represented by more than one token, every single one spans issuers whose tokens are not legally equivalent.

**One key can seize 1,138 of them.** A single permanent delegate, `2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a`, can move or burn that many tokenized equities out of any wallet on Solana without the holder's consent. Across the whole universe there are only 3 such keys, covering 1,983 of 2,060 tokens.

**77 tokens have no permanent delegate at all** — every Ondo mint. Ondo is the only issuer that cannot take tokens out of a holder's wallet, and that is worth saying as plainly as the risks.

**368 tokens display the wrong balance to naive apps.** They carry a scheduled scaled-UI multiplier that has already taken effect, so software reading the `multiplier` field instead of computing the effective value is wrong. PPLTx shows **10%**, NFLXx shows **10%**, PALLx shows **20%**, SPACEX shows **20%**, CRWDx shows **25%**, APHx shows **50%** of the real position.

**Almost none of them can be sold.** All 2,053 were probed against Jupiter. **173 have a route. 1,880 have none** — no liquidity pool in existence, cross-checked against DexScreener, which returns no pairs for them. A request that fails is never recorded as an answer: a dropped socket or a rate limit leaves the mint unmeasured and asked again, because "we could not reach the router" is not a finding about the market.

**And a route is not an exit.** Full quote ladders were measured for every routable mint. **38 can absorb a $10,000 sale inside 5% slippage** — out of 2,060.

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
npm run verify    # 150-check gate across five phases, end to end
npm run audit     # whole-universe integrity sweep: every token rated and graded
npm run e2e       # build real switch transactions and simulate them on mainnet
npm run buy-e2e   # the same for purchases
npm run fullcheck # drive the deployed site end to end: 62 checks, 7 mainnet simulations
npm run findings  # regenerate the README figures from the caches
npm run find -- spacex
npm run build && npm start
```

Optional `SOLANA_RPC_URL` for a dedicated RPC. Nothing else is needed — every data source is public and free.

## Design commitments

**Claim never holds a key.** It builds the switch transaction and hands it to your wallet unsigned. It never signs, never submits, never funds anything and never takes custody of a token. Everything except the final signature works without connecting at all, and the signature is your wallet's to give or refuse.

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
