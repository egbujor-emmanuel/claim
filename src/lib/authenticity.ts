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

export type Verdict = "canonical" | "plausible" | "structurally_impossible";

export interface AuthenticityResult {
  verdict: Verdict;
  /** Human-readable reasons, each one checkable against the mint account. */
  reasons: string[];
  /** Signals that actively indicate a counterfeit. */
  redFlags: string[];
}

/** Vanity suffixes and prefixes issuers use to mark their canonical mints. */
export const ISSUER_MINT_MARKERS: Record<string, { prefix?: string; suffix?: string }> = {
  backed: { prefix: "Xs" },
  prestocks: { prefix: "Pre" },
  ondo: { suffix: "ondo" },
};

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

export function checkAuthenticity(
  state: OnChainState,
  claimedIssuerId: string | null,
): AuthenticityResult {
  const reasons: string[] = [];
  const redFlags: string[] = [];

  if (state.program !== "Token-2022") {
    redFlags.push(
      `uses ${state.program}, not Token-2022; every real tokenized equity on Solana is Token-2022`,
    );
  }

  const machinery = hasEquityMachinery(state);
  if (!machinery.ok) {
    for (const m of machinery.missing) redFlags.push(`missing ${m}`);
  } else {
    reasons.push("carries the full issuance, pause and corporate-action machinery");
  }

  const lower = state.mint.toLowerCase();
  const launchpad = LAUNCHPAD_SUFFIXES.find((s) => lower.endsWith(s));
  if (launchpad) {
    redFlags.push(`mint address ends in "${launchpad}", the marker of a launchpad token`);
  }

  // Does the mint carry the claimed issuer's vanity marker?
  let markerMatches = false;
  if (claimedIssuerId) {
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

  let verdict: Verdict;
  if (redFlags.length > 0 && !machinery.ok) verdict = "structurally_impossible";
  else if (redFlags.length > 0) verdict = "plausible";
  else if (markerMatches && machinery.ok) verdict = "canonical";
  else verdict = "plausible";

  return { verdict, reasons, redFlags };
}

export function verdictLabel(v: Verdict): string {
  switch (v) {
    case "canonical":
      return "Canonical — matches the issuer's own mint pattern and carries the right machinery";
    case "plausible":
      return "Unverified — structurally capable, but not confirmed against the issuer";
    case "structurally_impossible":
      return "Not what it claims — this mint cannot function as a tokenized equity";
  }
}
