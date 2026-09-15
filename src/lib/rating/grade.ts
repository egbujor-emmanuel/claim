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
  grade: Grade;
  /** The single sentence that belongs on a card. */
  headline: string;
  findings: Finding[];
  authenticity: AuthenticityResult;
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

export function gradeClaim({ token, issuer, onchain, depth }: RatingInput): ClaimRating {
  const findings: Finding[] = [];
  let penalty = 0;

  const authenticity = onchain
    ? checkAuthenticity(onchain, issuer?.id ?? null)
    : { verdict: "plausible" as const, reasons: [], redFlags: ["no on-chain data"] };

  // ---- authenticity first: if it is not the real token, nothing else matters
  if (authenticity.verdict === "structurally_impossible") {
    findings.push({
      severity: "critical",
      message:
        "This mint cannot function as a tokenized equity. It is not the asset it appears to be.",
      evidence: authenticity.redFlags.join("; "),
    });
    penalty += 10;
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
    penalty += STRUCTURE_SCORE[structure] ?? 3;
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
    penalty += 5;
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
    penalty += 4;
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
      penalty += 1;
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
      penalty += 6;
      findings.push({
        severity: "critical",
        message: "Transfers are paused right now. You cannot move this token.",
        evidence: `pausableConfig.paused = true`,
      });
    }
    const fee = onchain.transferFee?.basisPoints ?? 0;
    if (fee > 0) {
      penalty += 2;
      const uncapped = Number(onchain.transferFee?.maximumFee ?? 0) >= 1.8e19;
      findings.push({
        severity: "warning",
        message: `Every transfer is taxed ${fee / 100}%${uncapped ? ", with no cap" : ""}.`,
        evidence: `transferFeeConfig.transferFeeBasisPoints = ${fee}`,
      });
    }
    if (onchain.distinctAuthorities.length === 1) {
      penalty += 3;
      findings.push({
        severity: "critical",
        message:
          "One key controls everything: minting, freezing, seizing, pausing and the balance display.",
        evidence: `single authority ${onchain.distinctAuthorities[0]}`,
      });
    }
    if (onchain.transferHook?.programId) {
      penalty += 1;
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
      penalty += 5;
      findings.push({
        severity: "critical",
        message:
          "No market and no open redemption. There is no demonstrated way to convert this back to cash.",
        evidence: `Jupiter: ${depth.reason ?? "no route"}`,
      });
    } else if (depth.maxExitUsd === null) {
      penalty += 4;
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
      if (depth.maxExitUsd < 10_000) penalty += 2;
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
    penalty >= 10 ? "F" : penalty >= 7 ? "D" : penalty >= 4 ? "C" : penalty >= 2 ? "B" : "A";

  return {
    mint: token.mint,
    symbol: token.symbol,
    grade,
    headline: headlineFor(grade, findings),
    findings: findings.sort((a, b) => order(a.severity) - order(b.severity)),
    authenticity,
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
