/**
 * Finding and connecting the visitor's wallet.
 *
 * This file exists because wallet connection fails in ways that are invisible
 * from the outside. Wallets inject at different globals, several can fight over
 * the same one, and the errors they return are frequently a bare
 * "Unexpected error" that says nothing about what to do next.
 *
 * So the approach here is to stop guessing: detect every provider present, show
 * the visitor what was found, let them choose when there is more than one, and
 * report exactly what the wallet said. A legible failure someone can act on
 * beats a confident message that is wrong.
 */

export interface SolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  isTrust?: boolean;
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey?: { toString(): string } }>;
  disconnect?(): Promise<void>;
  request?(args: { method: string; params?: unknown }): Promise<unknown>;
  signAndSendTransaction(tx: unknown): Promise<{ signature: string }>;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
    solflare?: SolanaProvider;
    backpack?: SolanaProvider;
    trustwallet?: { solana?: SolanaProvider };
    phantom?: { solana?: SolanaProvider };
  }
}

export interface FoundWallet {
  provider: SolanaProvider;
  name: string;
  /** Where it was found, shown to the visitor when connection goes wrong. */
  where: string;
}

function nameOf(p: SolanaProvider, fallback: string): string {
  if (p.isPhantom) return "Phantom";
  if (p.isSolflare) return "Solflare";
  if (p.isBackpack) return "Backpack";
  if (p.isTrust) return "Trust";
  return fallback;
}

/**
 * Every provider currently present, deduplicated.
 *
 * Deduplication is by object identity: a single wallet commonly appears at more
 * than one global, and offering the same wallet twice would be confusing.
 */
export function findWallets(): FoundWallet[] {
  if (typeof window === "undefined") return [];

  const candidates: [SolanaProvider | undefined, string, string][] = [
    [window.phantom?.solana, "Phantom", "window.phantom.solana"],
    [window.backpack, "Backpack", "window.backpack"],
    [window.solflare, "Solflare", "window.solflare"],
    [window.trustwallet?.solana, "Trust", "window.trustwallet.solana"],
    [window.solana, "your wallet", "window.solana"],
  ];

  const found: FoundWallet[] = [];
  const seen = new Set<SolanaProvider>();

  for (const [provider, fallback, where] of candidates) {
    if (!provider || typeof provider.connect !== "function") continue;
    if (seen.has(provider)) continue;
    seen.add(provider);
    found.push({ provider, name: nameOf(provider, fallback), where });
  }
  return found;
}

export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export interface MobileWallet {
  name: string;
  /** Universal link that opens this page inside the wallet's own browser. */
  href: string;
}

/**
 * Wallets reachable from a mobile browser, via their universal links.
 *
 * On a phone nothing injects into Safari or Chrome, so the only route to a
 * wallet is its own in-app browser. Each link carries the current URL so the
 * visitor lands back on the same switch rather than the wallet's home screen.
 *
 * Only wallets with a documented and stable browse link are listed. Guessing a
 * deep-link format produces a dead tap, which is worse than not offering it.
 */
export function mobileWallets(): MobileWallet[] {
  const url = typeof window !== "undefined" ? window.location.href : "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const target = encodeURIComponent(url);
  const ref = encodeURIComponent(origin);

  return [
    { name: "Phantom", href: `https://phantom.app/ul/browse/${target}?ref=${ref}` },
    { name: "Solflare", href: `https://solflare.com/ul/v1/browse/${target}?ref=${ref}` },
  ];
}

/**
 * Connect, trying the second path when the first fails.
 *
 * Some wallets expose connection through `request({ method: "connect" })` and
 * return a bare "Unexpected error" from `connect()`, particularly when another
 * extension is contending for the same global. Trying both costs nothing and
 * turns a dead end into a connection.
 */
export async function connectWallet(found: FoundWallet): Promise<string> {
  const p = found.provider;

  // Already connected from a previous visit: reuse rather than prompting again.
  if (p.isConnected && p.publicKey) return p.publicKey.toString();

  try {
    const res = await p.connect();
    const key = res?.publicKey ?? p.publicKey;
    if (key) return key.toString();
    throw new Error("The wallet connected but returned no address.");
  } catch (first) {
    if (typeof p.request !== "function") throw first;
    try {
      await p.request({ method: "connect" });
      if (p.publicKey) return p.publicKey.toString();
      throw first;
    } catch {
      throw first;
    }
  }
}

/**
 * Turn a wallet error into something true and useful.
 *
 * Reporting every failure as "declined" is wrong: a locked wallet, a wrong
 * network, contending extensions and a dismissed prompt are different problems
 * with different fixes. Telling someone they declined something they never saw
 * is worse than saying nothing.
 */
export function explainWalletError(e: unknown, detected: FoundWallet[] = []): string {
  const message = e instanceof Error ? e.message : String(e ?? "");
  const code = (e as { code?: number })?.code;

  if (code === 4001 || /user rejected|user denied|rejected the request/i.test(message)) {
    return "You dismissed the wallet prompt. Nothing was sent, and nothing was signed.";
  }
  if (/locked|unlock/i.test(message)) {
    return "Your wallet is locked. Unlock it, then try again.";
  }

  // Phantom's catch-all. It means the wallet answered but the handshake failed,
  // and by far the most common cause is more than one extension contending for
  // the same global.
  if (/unexpected error/i.test(message)) {
    const others = detected.length > 1 ? ` Claim can see ${detected.length} wallets here (${detected.map((d) => d.name).join(", ")}), which is the usual cause.` : "";
    return `The wallet returned "Unexpected error", which means it answered but the handshake failed.${others} Try: unlock the wallet, disable other wallet extensions, then reload. Everything except signing works without connecting at all.`;
  }
  if (/not found|undefined is not|no provider/i.test(message)) {
    return "The wallet did not respond. If more than one wallet extension is enabled, disable the others and reload.";
  }
  return message
    ? `The wallet returned: ${message}`
    : "The wallet closed without answering. Nothing was sent.";
}
