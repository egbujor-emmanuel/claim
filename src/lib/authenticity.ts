import type { OnChainState } from "./types.js";

/**
 * Structural authenticity checks.
 *
 * Counterfeit tokenized stocks exist on Solana today. Searching Jupiter for
 * "QQQon" returns nine tokens, eight of which are not Ondo's; one impostor
 * claiming to be "NVIDIA (Ondo Tokenized)" is a pump.fun mint with a one-billion
 * fixed supply and no extensions at all.
 *
 * The check here is deliberately NOT "is this on our allowlist". An allowlist is
 * only as good as its maintainer. Instead we ask whether the mint is
 * structurally capable of being what it claims. A real tokenized equity has to
 * carry the machinery that makes it one: an authority that can mint and redeem
 * against custody, a pause control for regulatory halts, and a scaled-UI
 * multiplier to express splits and dividends. A memecoin with a fixed supply and
 * a metadata pointer cannot do any of that, whatever its name says.
 *
 * This is evidence a user can check themselves, not a reputation score.
 */

export type Verdict =
  | "canonical"
  | "plausible"
  | "structurally_impossible"
  /**
   * Not a tokenized equity at all, and never claimed to be one.
   *
   * USDC is not a counterfeit Apple share; it is a stablecoin. Grading it on an
   * equity scale and calling it "not the asset it appears to be" would be both
   * false and the fastest way to lose a reader's trust. Out of scope is an
   * honest answer.
   */
  | "not_an_equity";

export interface AuthenticityResult {
  verdict: Verdict;
  /** Human-readable reasons, each one checkable against the mint account. */
  reasons: string[];
  /** Signals that actively indicate a counterfeit. */
  redFlags: string[];
}

/**
 * On-chain mint authorities that identify an issuer.
 *
 * This is the strongest available test: an address either was minted by the
 * issuer's authority or it was not. Nothing is inferred from the address shape.
 * Each was confirmed by reading every known mint for that issuer and observing
 * a single shared authority.
 */
export const ISSUER_MINT_AUTHORITIES: Record<string, string> = {
  ondo: "9foMHsSDq7nMg4WPusSz9eY7tyxyukqborA8GyU5cUxD",
  backed: "7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj",
  prestocks: "WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc",
};

/**
 * Permanent delegates that identify an issuer.
 *
 * Backpack Securities gives every token its own mint authority -- 1,138 distinct
 * keys across 1,138 tokens, which is unusually good isolation -- so the mint
 * authority cannot identify them. Their shared permanent delegate can. Different
 * issuers, different fingerprints; both are read from chain.
 */
export const ISSUER_PERMANENT_DELEGATES: Record<string, string> = {
  backpack: "2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a",
  backed: "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq",
};

/**
 * Vanity markers, used only as a weaker secondary signal for issuers where we
 * have not established a single mint authority.
 */
export const ISSUER_MINT_MARKERS: Record<string, { prefix?: string; suffix?: string }> = {
  backed: { prefix: "Xs" },
  prestocks: { prefix: "Pre" },
  ondo: { suffix: "ondo" },
};

/** Language a token uses when it presents itself as a tokenized equity. */
const EQUITY_CLAIM_WORDS = [
  "tokenized", "tokenised", "xstock", "stock", "equity", "share",
  "securities", "pre-ipo", "preipo",
];

function presentsAsEquity(state: OnChainState, claimedIssuerId: string | null): boolean {
  if (claimedIssuerId) return true;
  const text = `${state.name ?? ""} ${state.symbol ?? ""}`.toLowerCase();
  return EQUITY_CLAIM_WORDS.some((w) => text.includes(w));
}

/** Known launchpad suffixes. Not proof of fraud, but a tokenized equity is never one. */
const LAUNCHPAD_SUFFIXES = ["pump", "bonk", "moon"];

/**
 * Extensions a genuine tokenized equity needs in order to function.
 * An issuer must be able to halt transfers and to express corporate actions.
 */
function hasEquityMachinery(state: OnChainState): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!state.pausable) missing.push("pausable (no way to halt on a regulatory event)");
  if (!state.scaledUiAmount) missing.push("scaledUiAmount (no way to express splits or dividends)");
  if (!state.mintAuthority) missing.push("mint authority (supply is fixed; cannot issue or redeem)");
  return { ok: missing.length === 0, missing };
}

/**
 * Structures that must carry full equity machinery to be credible.
 *
 * A token that claims to wrap custodied shares needs a way to pause on a
 * regulatory event and a way to express splits and dividends. A loan
 * participation or a synthetic has neither of those things to express, and
 * demanding them would brand an honestly-described loan product a counterfeit.
 */
const REQUIRES_EQUITY_MACHINERY = new Set([
  "direct_entitlement",
  "custodied_entitlement",
  "securitized_exposure",
]);

export function checkAuthenticity(
  state: OnChainState,
  claimedIssuerId: string | null,
  claimedStructure?: string,
): AuthenticityResult {
  const reasons: string[] = [];
  const redFlags: string[] = [];

  if (state.program !== "Token-2022") {
    redFlags.push(
      `uses ${state.program}, not Token-2022; every real tokenized equity on Solana is Token-2022`,
    );
  }

  // Only judged against the machinery its own stated structure implies.
  const machineryMatters =
    claimedStructure === undefined || REQUIRES_EQUITY_MACHINERY.has(claimedStructure);
  const machinery = hasEquityMachinery(state);
  if (machineryMatters && !machinery.ok) {
    for (const m of machinery.missing) redFlags.push(`missing ${m}`);
  } else if (machinery.ok) {
    reasons.push("carries the full issuance, pause and corporate-action machinery");
  } else {
    reasons.push(
      `does not carry equity machinery, which is consistent with its stated structure (${claimedStructure})`,
    );
  }

  const lower = state.mint.toLowerCase();
  const launchpad = LAUNCHPAD_SUFFIXES.find((s) => lower.endsWith(s));
  if (launchpad) {
    redFlags.push(`mint address ends in "${launchpad}", the marker of a launchpad token`);
  }

  // Strongest test first: does the mint carry the issuer's on-chain fingerprint?
  let authorityVerified = false;
  let hasFingerprint = false;
  if (claimedIssuerId) {
    const expectedMint = ISSUER_MINT_AUTHORITIES[claimedIssuerId];
    const expectedDelegate = ISSUER_PERMANENT_DELEGATES[claimedIssuerId];
    hasFingerprint = Boolean(expectedMint || expectedDelegate);

    if (expectedMint && state.mintAuthority === expectedMint) {
      authorityVerified = true;
      reasons.push(
        `minted by the issuer's own authority (${expectedMint}), verified on chain rather than inferred`,
      );
    } else if (expectedDelegate && state.permanentDelegate === expectedDelegate) {
      authorityVerified = true;
      reasons.push(
        `carries the issuer's permanent delegate (${expectedDelegate}), verified on chain rather than inferred`,
      );
    } else if (hasFingerprint) {
      redFlags.push(
        `does not carry this issuer's on-chain fingerprint; expected mint authority ${expectedMint ?? "n/a"} or delegate ${expectedDelegate ?? "n/a"}`,
      );
    }
  }

  // Weaker secondary signal, only where no on-chain fingerprint is established.
  let markerMatches = false;
  if (claimedIssuerId && !hasFingerprint) {
    const marker = ISSUER_MINT_MARKERS[claimedIssuerId];
    if (marker) {
      const prefixOk = marker.prefix ? state.mint.startsWith(marker.prefix) : true;
      const suffixOk = marker.suffix ? state.mint.endsWith(marker.suffix) : true;
      markerMatches = prefixOk && suffixOk;
      if (markerMatches) {
        const shape = marker.prefix
          ? `starts with "${marker.prefix}"`
          : `ends with "${marker.suffix}"`;
        reasons.push(`mint ${shape}, matching the issuer's canonical vanity address`);
      } else {
        redFlags.push(
          `mint does not match the vanity pattern this issuer uses for canonical mints`,
        );
      }
    }
  }

  const claimsToBeEquity = presentsAsEquity(state, claimedIssuerId);

  let verdict: Verdict;
  // Missing machinery only makes something a counterfeit if it claimed to be an
  // equity in the first place. Otherwise it is simply a different kind of token.
  if (machineryMatters && !machinery.ok && !claimsToBeEquity) verdict = "not_an_equity";
  else if (machineryMatters && !machinery.ok) verdict = "structurally_impossible";
  else if (authorityVerified) verdict = "canonical";
  else if (redFlags.length > 0) verdict = "plausible";
  else if (markerMatches) verdict = "canonical";
  else verdict = "plausible";

  return { verdict, reasons, redFlags };
}

export function verdictLabel(v: Verdict): string {
  switch (v) {
    case "canonical":
      return "Canonical — minted by the issuer's own authority and carrying the right machinery";
    case "plausible":
      return "Unverified — structurally capable, but not confirmed against the issuer";
    case "structurally_impossible":
      return "Not what it claims — this mint presents itself as a tokenized equity but cannot function as one";
    case "not_an_equity":
      return "Not a tokenized equity — a real token, but outside what Claim assesses";
  }
}
