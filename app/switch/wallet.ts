/**
 * Finding the visitor's wallet.
 *
 * Wallets inject themselves in more than one place and this matters more than
 * it should: checking only `window.solana` misses modern Phantom, which injects
 * at `window.phantom.solana`, and misses Backpack entirely. A visitor with a
 * wallet installed being told there isn't one is the worst possible failure,
 * because they conclude the product is broken rather than that we looked in the
 * wrong place.
 *
 * On mobile, nothing injects into Safari or Chrome. A wallet is only reachable
 * inside that wallet's own in-app browser, so on mobile the honest move is to
 * say so and offer a deep link rather than report a missing wallet.
 */

export interface SolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  publicKey?: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction(tx: unknown): Promise<{ signature: string }>;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
    solflare?: SolanaProvider;
    backpack?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
  }
}

export interface FoundWallet {
  provider: SolanaProvider;
  name: string;
}

/** Every place a Solana wallet is known to announce itself. */
export function findWallet(): FoundWallet | null {
  if (typeof window === "undefined") return null;

  const candidates: [SolanaProvider | undefined, string][] = [
    [window.phantom?.solana, "Phantom"],
    [window.backpack, "Backpack"],
    [window.solflare, "Solflare"],
    [window.solana, window.solana?.isPhantom ? "Phantom" : "your wallet"],
  ];

  for (const [provider, name] of candidates) {
    if (provider && typeof provider.connect === "function") return { provider, name };
  }
  return null;
}

export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Open this page inside Phantom's in-app browser.
 *
 * The only route to a wallet from mobile Safari or Chrome. Built from the
 * current URL so the visitor lands back on the same switch they were reading.
 */
export function phantomDeepLink(): string {
  const url = typeof window !== "undefined" ? window.location.href : "";
  return `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(
    typeof window !== "undefined" ? window.location.origin : "",
  )}`;
}

/**
 * Turn a wallet error into something true and useful.
 *
 * Reporting every failure as "declined" is wrong: a locked wallet, a wrong
 * network, or an unsupported method are all different problems with different
 * fixes, and telling someone they declined something they never saw is worse
 * than saying nothing.
 */
export function explainWalletError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e ?? "");
  const code = (e as { code?: number })?.code;

  // 4001 is the wallet standard's user-rejection code.
  if (code === 4001 || /user rejected|user denied|rejected the request/i.test(message)) {
    return "You dismissed the wallet prompt. Nothing was sent, and nothing was signed.";
  }
  if (/locked|unlock/i.test(message)) {
    return "Your wallet is locked. Unlock it and try again.";
  }
  if (/not found|undefined is not|no provider/i.test(message)) {
    return "The wallet did not respond. If you have more than one wallet extension enabled, try disabling the others and reloading.";
  }
  return message
    ? `The wallet returned: ${message}`
    : "The wallet closed without answering. Nothing was sent.";
}
