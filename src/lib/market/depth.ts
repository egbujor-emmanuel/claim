/**
 * Exit depth from real executable quotes.
 *
 * Everyone else models slippage from pool reserves. We ask Jupiter what it would
 * actually fill, at real sizes, right now. The number is a quote, not an
 * estimate, and anyone can reproduce it against the same free endpoint.
 */

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const QUOTE = "https://lite-api.jup.ag/swap/v1/quote";

/** lite-api is rate limited and shared; stay well under it. */
const THROTTLE_MS = 1_150;

export const LADDER_USD = [1_000, 10_000, 100_000, 1_000_000] as const;

export interface DepthRung {
  usd: number;
  /** USDC actually received for that much of the token. */
  receivedUsd: number | null;
  /** Percentage of value lost getting out at this size. */
  lossPct: number | null;
  routed: boolean;
}

export interface DepthResult {
  mint: string;
  /** False when Jupiter has no route at any size: there is no market. */
  tradable: boolean;
  /** Reason Jupiter gave when untradable, e.g. TOKEN_NOT_TRADABLE. */
  reason: string | null;
  /** Implied USD price of one raw-unit-adjusted token. */
  priceUsd: number | null;
  rungs: DepthRung[];
  /** Largest size exitable inside 5% loss. Null when nothing is. */
  maxExitUsd: number | null;
  checkedAt: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface QuoteResponse {
  outAmount?: string;
  priceImpactPct?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Ask Jupiter for a quote, and say which kind of "no" came back.
 *
 * `unreachable` means the question never got answered: the socket failed, the
 * rate limiter said no, the gateway was down. That is not evidence about the
 * market and must never be recorded as one. Conflating it with a real
 * TOKEN_NOT_TRADABLE is how tokens with deep, obvious liquidity -- TSLAx, SPYx,
 * NFLXx -- ended up cached as having no DEX route at all, on the strength of
 * "fetch failed".
 *
 * Retries first, because most of these are transient and a second ask usually
 * gets a real answer.
 */
async function quote(
  inputMint: string,
  outputMint: string,
  amount: string,
  attempts = 3,
): Promise<QuoteResponse & { unreachable?: boolean }> {
  const url = `${QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=5000`;
  let last = "";
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      // 429 and 5xx are the venue refusing to answer, not an answer.
      if (res.status === 429 || res.status >= 500) {
        last = `HTTP ${res.status}`;
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        continue;
      }
      const body = (await res.json()) as QuoteResponse;
      if (!res.ok) return { error: body.error ?? `HTTP ${res.status}`, errorCode: body.errorCode };
      return body;
    } catch (e) {
      last = e instanceof Error ? e.message : "fetch failed";
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  return { error: last || "unreachable", unreachable: true };
}

/**
 * Measure how much of a token can actually be sold.
 *
 * Price is discovered by probing a $1 buy, then each rung sells the token
 * quantity that $1-price implies. A token with no route fails the first probe,
 * which is itself the most important result we produce.
 */
export async function measureDepth(mint: string, decimals: number): Promise<DepthResult> {
  const checkedAt = new Date().toISOString();

  // Quoting an asset against itself always fails. Saying "USDC has no market"
  // because we asked Jupiter to swap USDC for USDC would be absurd.
  if (mint === USDC) {
    return {
      mint,
      tradable: true,
      reason: null,
      priceUsd: 1,
      rungs: LADDER_USD.map((usd) => ({ usd, receivedUsd: usd, lossPct: 0, routed: true })),
      maxExitUsd: LADDER_USD[LADDER_USD.length - 1] ?? null,
      checkedAt,
    };
  }
  const empty: DepthResult = {
    mint,
    tradable: false,
    reason: null,
    priceUsd: null,
    rungs: LADDER_USD.map((usd) => ({ usd, receivedUsd: null, lossPct: null, routed: false })),
    maxExitUsd: null,
    checkedAt,
  };

  const probe = await quote(USDC, mint, "1000000"); // $1 of USDC
  if (!probe.outAmount || Number(probe.outAmount) <= 0) {
    return { ...empty, reason: probe.errorCode ?? probe.error ?? "no route" };
  }

  const rawPerUsd = Number(probe.outAmount);
  const priceUsd = 10 ** decimals / rawPerUsd;

  const rungs: DepthRung[] = [];
  let maxExitUsd: number | null = null;

  for (const usd of LADDER_USD) {
    await sleep(THROTTLE_MS);
    const amount = Math.floor(rawPerUsd * usd).toString();
    const sell = await quote(mint, USDC, amount);

    if (!sell.outAmount || Number(sell.outAmount) <= 0) {
      rungs.push({ usd, receivedUsd: null, lossPct: null, routed: false });
      continue;
    }

    const receivedUsd = Number(sell.outAmount) / 1e6;
    const lossPct = ((usd - receivedUsd) / usd) * 100;
    rungs.push({ usd, receivedUsd, lossPct, routed: true });
    if (lossPct <= 5) maxExitUsd = usd;
  }

  return { mint, tradable: true, reason: null, priceUsd, rungs, maxExitUsd, checkedAt };
}

/** Cheap tradability probe: one call, no ladder. Used for universe-wide sweeps. */
export async function probeTradable(
  mint: string,
): Promise<{ tradable: boolean | null; reason: string | null }> {
  // The quote asset is trivially tradable; asking Jupiter to swap it for itself
  // would report the opposite.
  if (mint === USDC) return { tradable: true, reason: null };

  const probe = await quote(USDC, mint, "1000000");
  if (probe.outAmount && Number(probe.outAmount) > 0) return { tradable: true, reason: null };
  // Jupiter never answered. Saying "no market" here would be inventing a fact.
  if (probe.unreachable) return { tradable: null, reason: probe.error ?? "unreachable" };
  return { tradable: false, reason: probe.errorCode ?? probe.error ?? "no route" };
}

export { THROTTLE_MS };
