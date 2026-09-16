/**
 * Claim — type definitions.
 *
 * The central thesis: a token that tracks a company's share price is not
 * necessarily a claim on that company's shares. The legal structure behind the
 * token decides what you actually own, and those structures are not equivalent.
 */

/**
 * Legal structure categories, following the post-Anthropic/OpenAI framework for
 * tokenised equity exposure. Ordered strongest to weakest claim.
 *
 * Source: https://aurum.law/newsroom/Pre-IPO-Secondary-Tokenisation-After-Anthropic-and-OpenAI
 */
export type ClaimStructure =
  /** Registered/recognised holder of the actual security. Strongest. */
  | "direct_entitlement"
  /** Shares custodied 1:1 by a regulated broker-dealer; token is a wrapper over
   *  a security entitlement, redeemable for the underlying. */
  | "custodied_entitlement"
  /** Issuer holds the shares; you hold a certificate/note against the ISSUER,
   *  not the company. Counterparty risk sits with the issuer. */
  | "securitized_exposure"
  /** You own an interest in a vehicle that holds (or claims to hold) shares.
   *  Void if the company has not consented to the transfer. */
  | "spv_interest"
  /**
   * A loan participation right, not equity at all.
   *
   * The holder is a creditor in a lending arrangement that references a
   * company, with no ownership, voting or dividend rights. Repayment depends on
   * the lender divesting the underlying exposure, so there is no redemption on
   * demand and no share behind the token to claim.
   */
  | "loan_participation"
  /** Perp, forward or CFD. No share transfer occurs at any point. */
  | "synthetic"
  /** No demonstrable backing. */
  | "unbacked";

/** How a holder converts back to value, in descending order of strength. */
export type RedemptionPath =
  /** Transferable into the traditional system (ACATS/DTCC) as real shares. */
  | "portable_to_brokerage"
  /** Redeemable with the issuer for cash or shares, subject to eligibility. */
  | "issuer_redemption"
  /** Must be swapped on-chain before a deadline or the token dies. */
  | "mandatory_conversion"
  /** Secondary market only. If liquidity is gone, so is your exit. */
  | "secondary_only";

export interface SourcedFact<T> {
  value: T;
  /** Every non-obvious assertion must carry a source. No exceptions. */
  source: string;
  /** ISO date the fact was verified by a human or a script. */
  verifiedAt: string;
  note?: string;
}

/**
 * Structures whose tokens are denominated in the underlying share.
 *
 * A custodied entitlement, a tracker certificate and an SPV interest all claim
 * a per-share relationship, so their prices are comparable to each other and to
 * the stock. A loan participation is not: Tessera's own metadata calls T-SpaceX
 * a "Stablecoin Loan Token" giving "economic exposure" and states no share
 * ratio anywhere. Putting its price beside a per-share price would compare
 * different units and read as a 4x premium that does not exist.
 */
export const SHARE_DENOMINATED: ReadonlySet<ClaimStructure> = new Set([
  "direct_entitlement",
  "custodied_entitlement",
  "securitized_exposure",
  "spv_interest",
]);

export function isShareDenominated(structure: ClaimStructure | null | undefined): boolean {
  return structure ? SHARE_DENOMINATED.has(structure) : false;
}

export interface Issuer {
  id: string;
  name: string;
  /** Legal entity that actually owes the holder something. */
  legalEntity: SourcedFact<string>;
  jurisdiction: SourcedFact<string>;
  /** Regulatory posture, in plain words. */
  regulatoryStatus: SourcedFact<string>;
  structure: SourcedFact<ClaimStructure>;
  redemption: SourcedFact<RedemptionPath>;
  /** Does the holder get dividends and corporate actions? */
  corporateActions: SourcedFact<boolean>;
  /** Does holding confer shareholder rights (voting, information)? */
  shareholderRights: SourcedFact<boolean>;
  /** Known mint-address prefix, where the issuer uses a vanity prefix. */
  mintPrefix?: string;
  homepage: string;
  docs?: string;
}

/** Token-2022 mint state as read from chain. All of this is verifiable. */
export interface OnChainState {
  mint: string;
  program: "Token-2022" | "SPL Token" | string;
  decimals: number;
  supplyRaw: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  /** An authority that can move or burn tokens from ANY holder's account. */
  permanentDelegate: string | null;
  pausable: { authority: string | null; paused: boolean } | null;
  transferHook: { authority: string | null; programId: string | null } | null;
  /** A fee skimmed from every transfer, in basis points. */
  transferFee: { basisPoints: number; maximumFee: string } | null;
  scaledUiAmount: {
    authority: string | null;
    multiplier: string;
    newMultiplier: string;
    newMultiplierEffectiveTimestamp: number;
  } | null;
  /** Distinct keys holding any authority over this mint. 1 = single point of control. */
  distinctAuthorities: string[];
  name?: string;
  symbol?: string;
  fetchedAt: string;
}
