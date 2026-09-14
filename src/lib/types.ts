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
