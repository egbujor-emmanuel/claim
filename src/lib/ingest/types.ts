/**
 * Normalised shapes shared by every issuer adapter.
 *
 * Each issuer publishes a different schema. Adapters translate into these types
 * so the rating engine never needs to know which issuer it is looking at.
 */

export interface TokenRecord {
  mint: string;
  /** Ticker of the TOKEN, e.g. SPCXx. Not the underlying company ticker. */
  symbol: string;
  name: string;
  issuerId: string;

  /** Ticker of the real security, e.g. SPCX. */
  underlyingSymbol: string | null;
  /** ISIN of the real security, e.g. US84615Q1031. */
  underlyingIsin: string | null;
  /**
   * ISIN of the TOKEN itself, where the issuer registers one.
   *
   * When this differs from underlyingIsin, the token is legally a different
   * instrument from the share. SPCXx is CH1564487366 while SpaceX stock is
   * US84615Q1031 — same exposure, different security.
   */
  tokenIsin: string | null;

  decimals: number | null;
  /** Issuer-declared trading halt, distinct from an on-chain pause. */
  halted: boolean;

  /** Primary-market access, as published by the issuer. */
  issuance: boolean;
  redemption: boolean;
  /** Minimum primary-market order in USD, where published. */
  minOrderUsd: number | null;

  sourceUrl: string;
  fetchedAt: string;
}

export interface Company {
  /** Stable key: underlying ISIN when available, else underlying ticker. */
  id: string;
  name: string;
  underlyingSymbol: string | null;
  underlyingIsin: string | null;
  tokens: TokenRecord[];
}

export interface Adapter {
  issuerId: string;
  fetchTokens(): Promise<TokenRecord[]>;
}
