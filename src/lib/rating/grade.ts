import type { Issuer, OnChainState } from "../types.js";
import type { TokenRecord } from "../ingest/types.js";
import type { DepthResult } from "../market/depth.js";
import { checkAuthenticity, type AuthenticityResult } from "../authenticity.js";
import { daysUntilExpiry, EXPIRY } from "../ingest/manual.js";

/**
 * Claim grading.
 *
 * A grade is a summary of findings, never a number pulled from nowhere. Every
 * finding names the evidence it rests on so a reader can check it: an account
 * field they can query, or a source they can open. We are describing structure,
 * not giving investment or legal advice, and the output should read that way.
 */

export type Severity = "critical" | "warning" | "note" | "good";

export interface Finding {
  severity: Severity;
  /** One sentence a non-specialist understands. */
  message: string;
  /** Where this came from: an on-chain field, or a URL. */
  evidence: string;
  source?: string;
}

/** A through F. Not a recommendation; a summary of what the holder actually has. */
export type Grade = "A" | "B" | "C" | "D" | "F";

export interface ClaimRating {
  mint: string;
  symbol: string;
  /**
   * null when the token is not a tokenized equity at all.
   *
   * Refusing to grade is the honest outcome for a stablecoin or a memecoin.
   * Awarding it an F would imply Claim assessed an equity claim and found it
   * wanting, which is not what happened.
   */
  grade: Grade | null;
  /** False when the token is outside what Claim assesses. */
  inScope: boolean;
  /** The single sentence that belongs on a card. */
  headline: string;
  findings: Finding[];
  authenticity: AuthenticityResult;
  /**
   * How the grade was reached.
   *
   * A letter grade with no visible arithmetic is just an opinion with a
   * typeface. This exposes the score and the thresholds so anyone can check the
   * grade follows from the findings, and disagree with a specific weight rather
   * than the whole verdict.
   */
  scoring: {
    score: number;
    thresholds: { F: number; D: number; C: number; B: number };
    reasons: { points: number; because: string }[];
  };
}

const STRUCTURE_SCORE: Record<string, number> = {
  direct_entitlement: 0,
  custodied_entitlement: 1,
  securitized_exposure: 2,
  spv_interest: 4,
  synthetic: 4,
  unbacked: 6,
};

const STRUCTURE_TEXT: Record<string, string> = {
  direct_entitlement: "You are a recognised holder of the actual security.",
  custodied_entitlement:
    "Backed 1:1 by shares in regulated custody; the token wraps a security entitlement.",
  securitized_exposure:
    "A certificate against the issuing entity, not the company. If the issuer fails, your claim is against the issuer.",
  spv_interest:
    "An interest in a vehicle that holds the shares. If the company has not consented to the transfer, the claim may not be recognised.",
  synthetic: "Price exposure only. No shares change hands at any point.",
  unbacked: "No demonstrable backing.",
};

const REDEMPTION_TEXT: Record<string, string> = {
  portable_to_brokerage: "Transferable out to a traditional brokerage as real shares.",
  issuer_redemption: "Redeemable with the issuer, subject to eligibility and minimums.",
  mandatory_conversion: "Must be converted before a deadline or it stops being worth anything.",
  secondary_only: "No redemption. The open market is the only way out.",
};

export interface RatingInput {
  token: TokenRecord;
  issuer: Issuer | null;
  onchain: OnChainState | null;
  depth?: DepthResult | null;
}

/** Grade boundaries, stated once so they can be quoted and argued with. */
export const THRESHOLDS = { F: 10, D: 7, C: 4, B: 2 } as const;

export function gradeClaim({ token, issuer, onchain, depth }: RatingInput): ClaimRating {
  const findings: Finding[] = [];
  const reasons: { points: number; because: string }[] = [];
  let penalty = 0;

  const charge = (points: number, because: string) => {
    penalty += points;
    reasons.push({ points, because });
  };

  const authenticity = onchain
    ? checkAuthenticity(onchain, issuer?.id ?? null)
    : { verdict: "plausible" as const, reasons: [], redFlags: ["no on-chain data"] };

  // ---- out of scope: a real token, just not a tokenized equity
  if (authenticity.verdict === "not_an_equity") {
    return {
      mint: token.mint,
      symbol: token.symbol,
      grade: null,
      inScope: false,
      headline:
        "This is a real token, but it is not a tokenized equity, so Claim has nothing to assess.",
      findings: [
        {
          severity: "note",
          message:
            "Claim only rates tokens that represent a claim on a company's shares. This one does not present itself as one.",
          evidence: authenticity.redFlags.join("; ") || "no equity machinery, no equity claim",
        },
      ],
      authenticity,
      scoring: { score: 0, thresholds: THRESHOLDS, reasons: [] },
    };
  }

  // ---- authenticity first: if it is not the real token, nothing else matters
  if (authenticity.verdict === "structurally_impossible") {
    findings.push({
      severity: "critical",
      message:
        "This mint cannot function as a tokenized equity. It is not the asset it appears to be.",
      evidence: authenticity.redFlags.join("; "),
    });
    charge(10, "the mint cannot function as a tokenized equity");
  } else if (authenticity.verdict === "canonical") {
    findings.push({
      severity: "good",
      message: "Matches the issuer's canonical mint pattern and carries real issuance machinery.",
      evidence: authenticity.reasons.join("; "),
    });
  }

  // ---- legal structure
  if (issuer) {
    const structure = issuer.structure.value;
    charge(STRUCTURE_SCORE[structure] ?? 3, `claim structure: ${structure}`);
    findings.push({
      severity: structure === "spv_interest" || structure === "unbacked" ? "critical"
        : structure === "securitized_exposure" ? "warning" : "good",
      message: STRUCTURE_TEXT[structure] ?? structure,
      evidence: `${issuer.name}, ${issuer.legalEntity.value}`,
      source: issuer.structure.source,
    });

    findings.push({
      severity: issuer.redemption.value === "mandatory_conversion" ? "critical"
        : issuer.redemption.value === "secondary_only" ? "warning" : "note",
      message: REDEMPTION_TEXT[issuer.redemption.value] ?? issuer.redemption.value,
      evidence: issuer.redemption.note ?? issuer.redemption.value,
      source: issuer.redemption.source,
    });

    if (!issuer.shareholderRights.value) {
      findings.push({
        severity: "note",
        message: "No shareholder rights. You get price exposure, not ownership.",
        evidence: issuer.shareholderRights.note ?? "issuer documentation",
        source: issuer.shareholderRights.source,
      });
    }
  } else {
    charge(5, "no identified issuer");
    findings.push({
      severity: "critical",
      message: "No identified issuer. Nobody has been shown to owe the holder anything.",
      evidence: "mint does not match any known issuer",
    });
  }

  // ---- a deadline that destroys value if ignored
  const expiry = EXPIRY[token.mint];
  if (expiry) {
    const days = daysUntilExpiry(token.mint);
    charge(4, "a deadline destroys the token if missed");
    findings.push({
      severity: "critical",
      message: `Expires in ${days} days. ${expiry.action}`,
      evidence: `deadline ${expiry.deadline}`,
      source: expiry.source,
    });
  }

  // ---- powers the issuer holds over the holder
  if (onchain) {
    if (onchain.permanentDelegate) {
      findings.push({
        severity: "warning",
        message: "A permanent delegate can move or burn these tokens from any wallet, including yours.",
        evidence: `permanentDelegate = ${onchain.permanentDelegate}`,
      });
      charge(1, "an authority can seize from any wallet");
    } else {
      // Worth saying out loud. Most tokenized equities on Solana retain this
      // power; an issuer that gives it up deserves the credit.
      findings.push({
        severity: "good",
        message: "No permanent delegate. The issuer cannot take these tokens out of your wallet.",
        evidence: "no permanentDelegate extension on the mint",
      });
    }
    if (onchain.pausable?.paused) {
      charge(6, "transfers are paused right now");
      findings.push({
        severity: "critical",
        message: "Transfers are paused right now. You cannot move this token.",
        evidence: `pausableConfig.paused = true`,
      });
    }
    const fee = onchain.transferFee?.basisPoints ?? 0;
    if (fee > 0) {
      charge(2, "every transfer is taxed");
      const uncapped = Number(onchain.transferFee?.maximumFee ?? 0) >= 1.8e19;
      findings.push({
        severity: "warning",
        message: `Every transfer is taxed ${fee / 100}%${uncapped ? ", with no cap" : ""}.`,
        evidence: `transferFeeConfig.transferFeeBasisPoints = ${fee}`,
      });
    }
    if (onchain.distinctAuthorities.length === 1) {
      charge(3, "one key controls every power over the mint");
      findings.push({
        severity: "critical",
        message:
          "One key controls everything: minting, freezing, seizing, pausing and the balance display.",
        evidence: `single authority ${onchain.distinctAuthorities[0]}`,
      });
    }
    if (onchain.transferHook?.programId) {
      charge(1, "a transfer hook can block transfers");
      findings.push({
        severity: "note",
        message: "A transfer hook program runs on every transfer and can block it.",
        evidence: `transferHook.programId = ${onchain.transferHook.programId}`,
      });
    }
  }

  // ---- can you actually get out
  //
  // Absence of a DEX route is not automatically a trap. Some issuers run no AMM
  // liquidity at all and expect holders to mint and redeem with them directly.
  // For those, "no Jupiter route" is a fact about the exit model, not a failure.
  // Only when redemption is closed to the holder does it become a cage.
  const redemptionOpen =
    issuer?.redemption.value === "issuer_redemption" ||
    issuer?.redemption.value === "portable_to_brokerage";

  if (depth) {
    if (!depth.tradable && redemptionOpen) {
      findings.push({
        severity: "note",
        message:
          "No DEX route. This issuer expects you to redeem with them directly rather than sell on the open market, so check you are eligible before buying.",
        evidence: `Jupiter: ${depth.reason ?? "no route"}`,
        source: issuer?.redemption.source,
      });
    } else if (!depth.tradable) {
      charge(5, "no market and no open redemption");
      findings.push({
        severity: "critical",
        message:
          "No market and no open redemption. There is no demonstrated way to convert this back to cash.",
        evidence: `Jupiter: ${depth.reason ?? "no route"}`,
      });
    } else if (depth.maxExitUsd === null) {
      charge(4, "under $1,000 can be sold within 5%");
      findings.push({
        severity: "critical",
        message: "Less than $1,000 can be sold without losing more than 5%.",
        evidence: `quote ladder at ${depth.checkedAt}`,
      });
    } else {
      const worst = depth.rungs[depth.rungs.length - 1];
      findings.push({
        severity: depth.maxExitUsd >= 100_000 ? "good" : "warning",
        message: `About $${depth.maxExitUsd.toLocaleString()} can be sold inside 5% slippage.${
          worst?.lossPct != null ? ` Exiting $1M would cost ${worst.lossPct.toFixed(0)}%.` : ""
        }`,
        evidence: `live Jupiter quotes at ${depth.checkedAt}`,
      });
      if (depth.maxExitUsd < 10_000) charge(2, "thin exit depth below $10,000");
    }
  }

  // ---- correctness hazard
  if (onchain && token.decimals !== null) {
    const scaled = onchain.scaledUiAmount;
    if (scaled) {
      const effectiveAt = scaled.newMultiplierEffectiveTimestamp * 1000;
      const effective = effectiveAt > 0 && effectiveAt <= Date.now() ? scaled.newMultiplier : scaled.multiplier;
      if (effective !== scaled.multiplier) {
        const ratio = Number(scaled.multiplier) / Number(effective);
        findings.push({
          severity: "warning",
          message: `Apps that read the multiplier field naively show ${(ratio * 100).toFixed(0)}% of your real balance.`,
          evidence: `multiplier ${scaled.multiplier}, effective ${effective}`,
        });
      }
    }
  }

  const grade: Grade =
    penalty >= THRESHOLDS.F ? "F"
    : penalty >= THRESHOLDS.D ? "D"
    : penalty >= THRESHOLDS.C ? "C"
    : penalty >= THRESHOLDS.B ? "B"
    : "A";

  return {
    mint: token.mint,
    symbol: token.symbol,
    grade,
    inScope: true,
    headline: headlineFor(grade, findings),
    findings: findings.sort((a, b) => order(a.severity) - order(b.severity)),
    authenticity,
    scoring: { score: penalty, thresholds: THRESHOLDS, reasons },
  };
}

function order(s: Severity): number {
  return { critical: 0, warning: 1, note: 2, good: 3 }[s];
}

function headlineFor(grade: Grade, findings: Finding[]): string {
  const critical = findings.find((f) => f.severity === "critical");
  if (critical) return critical.message;
  const warning = findings.find((f) => f.severity === "warning");
  if (warning) return warning.message;
  return grade === "A"
    ? "A real security entitlement with a route back to the traditional system."
    : "No critical issues found.";
}
