import type { OnChainState } from "../types.js";

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TOKEN_LEGACY = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

interface ParsedExtension {
  extension: string;
  state: Record<string, unknown>;
}

function ext(extensions: ParsedExtension[], name: string): Record<string, unknown> | null {
  return extensions.find((e) => e.extension === name)?.state ?? null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} failed: HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`RPC ${method} error: ${json.error.message}`);
  if (json.result === undefined) throw new Error(`RPC ${method} returned no result`);
  return json.result;
}

interface AccountValue {
  owner: string;
  data: { parsed: { info: Record<string, unknown> } };
}

/**
 * Read a mint's full authority and extension state.
 *
 * This is the heart of Claim. Everything here is free, public, and verifiable by
 * anyone against the same RPC — which is the point. We never assert a power
 * exists without being able to show the account field it came from.
 */
export function parseMint(mint: string, value: AccountValue | null): OnChainState | null {
  if (!value) return null;

  // An account exists at plenty of addresses that are not token mints: wallets,
  // programs, PDAs. For those the RPC returns `data` as a [base64, encoding]
  // tuple rather than a parsed object, so reaching for .parsed.info throws.
  // Treat anything we cannot parse as "not a mint" instead of crashing.
  const data = value.data as unknown;
  if (
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data) ||
    !("parsed" in data) ||
    typeof (data as { parsed?: unknown }).parsed !== "object" ||
    (data as { parsed?: { info?: unknown } }).parsed?.info === undefined
  ) {
    return null;
  }

  const info = value.data.parsed.info;
  // A token account is also "parsed" but is not a mint. Mints have decimals.
  if (typeof info.decimals !== "number") return null;
  const extensions = (info.extensions as ParsedExtension[] | undefined) ?? [];

  const permanent = ext(extensions, "permanentDelegate");
  const pausable = ext(extensions, "pausableConfig");
  const hook = ext(extensions, "transferHook");
  const fee = ext(extensions, "transferFeeConfig");
  const scaled = ext(extensions, "scaledUiAmountConfig");
  const metadata = ext(extensions, "tokenMetadata");

  const newerFee = fee?.newerTransferFee as
    | { transferFeeBasisPoints?: number; maximumFee?: string | number }
    | undefined;

  const state: OnChainState = {
    mint,
    program:
      value.owner === TOKEN_2022
        ? "Token-2022"
        : value.owner === TOKEN_LEGACY
          ? "SPL Token"
          : value.owner,
    decimals: Number(info.decimals ?? 0),
    supplyRaw: String(info.supply ?? "0"),
    mintAuthority: str(info.mintAuthority),
    freezeAuthority: str(info.freezeAuthority),
    permanentDelegate: permanent ? str(permanent.delegate) : null,
    pausable: pausable
      ? { authority: str(pausable.authority), paused: Boolean(pausable.paused) }
      : null,
    transferHook: hook
      ? { authority: str(hook.authority), programId: str(hook.programId) }
      : null,
    transferFee: newerFee
      ? {
          basisPoints: Number(newerFee.transferFeeBasisPoints ?? 0),
          maximumFee: String(newerFee.maximumFee ?? "0"),
        }
      : null,
    scaledUiAmount: scaled
      ? {
          authority: str(scaled.authority),
          multiplier: String(scaled.multiplier ?? "1"),
          newMultiplier: String(scaled.newMultiplier ?? "1"),
          newMultiplierEffectiveTimestamp: Number(scaled.newMultiplierEffectiveTimestamp ?? 0),
        }
      : null,
    distinctAuthorities: [],
    name: metadata ? (str(metadata.name) ?? undefined) : undefined,
    symbol: metadata ? (str(metadata.symbol) ?? undefined) : undefined,
    fetchedAt: new Date().toISOString(),
  };

  state.distinctAuthorities = collectAuthorities(state, extensions);
  return state;
}

/**
 * Every distinct key holding any authority over this mint.
 *
 * A single key holding all of them means one signature can mint, freeze, seize,
 * pause, retax and rewrite the balance display. That is a measurable governance
 * property, and as far as we can tell nobody has published it before.
 */
function collectAuthorities(state: OnChainState, extensions: ParsedExtension[]): string[] {
  const keys = new Set<string>();
  const add = (k: string | null | undefined) => {
    if (k) keys.add(k);
  };

  add(state.mintAuthority);
  add(state.freezeAuthority);
  add(state.permanentDelegate);
  add(state.pausable?.authority);
  add(state.transferHook?.authority);
  add(state.scaledUiAmount?.authority);

  for (const e of extensions) {
    add(str(e.state.authority));
    add(str(e.state.updateAuthority));
    add(str(e.state.withdrawWithheldAuthority));
  }

  return [...keys].sort();
}

/** The multiplier actually in force right now, accounting for scheduled updates. */
export function effectiveMultiplier(state: OnChainState, now = Date.now()): string {
  const s = state.scaledUiAmount;
  if (!s) return "1";
  const effectiveAt = s.newMultiplierEffectiveTimestamp * 1000;
  return effectiveAt > 0 && effectiveAt <= now ? s.newMultiplier : s.multiplier;
}

/**
 * True when reading the `multiplier` field naively gives the wrong answer.
 *
 * Live example at time of writing: PreStocks SPACEX reports multiplier "1" while
 * the effective value is "5" (a 5-for-1 split whose timestamp has passed), so a
 * naive integrator displays one fifth of the holder's real balance.
 */
export function hasMultiplierTrap(state: OnChainState, now = Date.now()): boolean {
  const s = state.scaledUiAmount;
  if (!s) return false;
  return effectiveMultiplier(state, now) !== s.multiplier;
}

export async function fetchMint(mint: string): Promise<OnChainState | null> {
  const result = await rpc<{ value: AccountValue | null }>("getAccountInfo", [
    mint,
    { encoding: "jsonParsed" },
  ]);
  return parseMint(mint, result.value);
}

/** Batch reader. getMultipleAccounts caps at 100 per call. */
export async function fetchMints(mints: string[]): Promise<Map<string, OnChainState>> {
  const out = new Map<string, OnChainState>();
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100);
    const result = await rpc<{ value: (AccountValue | null)[] }>("getMultipleAccounts", [
      batch,
      { encoding: "jsonParsed" },
    ]);
    batch.forEach((mint, idx) => {
      const parsed = parseMint(mint, result.value[idx] ?? null);
      if (parsed) out.set(mint, parsed);
    });
    if (i + 100 < mints.length) await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}
