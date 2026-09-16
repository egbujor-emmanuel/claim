/**
 * A Solana RPC caller that survives the public endpoint.
 *
 * api.mainnet-beta.solana.com throttles aggressively and returns 429 without
 * warning under any real traffic. During testing it refused
 * getTokenLargestAccounts outright. A wallet scan that dies on a rate limit in
 * front of someone is worse than one that takes an extra second, so calls
 * retry with backoff and fall through to any additional endpoints configured.
 *
 * Set SOLANA_RPC_URL to a dedicated endpoint (Helius and QuickNode both have
 * free tiers). Additional comma-separated fallbacks can go in
 * SOLANA_RPC_FALLBACKS. Nothing here needs a key to work; a key only buys
 * headroom.
 */

const PUBLIC_MAINNET = "https://api.mainnet-beta.solana.com";

function endpoints(): string[] {
  const primary = process.env.SOLANA_RPC_URL?.trim();
  const extra = (process.env.SOLANA_RPC_FALLBACKS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Deduplicated, primary first, public endpoint always last as a backstop.
  return [...new Set([primary, ...extra, PUBLIC_MAINNET].filter((x): x is string => Boolean(x)))];
}

export const RPC_URL = process.env.SOLANA_RPC_URL?.trim() || PUBLIC_MAINNET;

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export class RpcError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Call an RPC method, retrying transient failures and rotating endpoints.
 *
 * A rate limit is not an answer about the chain, so it is never allowed to
 * surface as one. If every endpoint is exhausted the error says plainly that
 * we could not read, rather than reporting an absence of data.
 */
export async function rpc<T>(
  method: string,
  params: unknown[],
  { attempts = 3 }: { attempts?: number } = {},
): Promise<T> {
  const urls = endpoints();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const url = urls[attempt % urls.length]!;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });

      if (!res.ok) {
        lastError = new RpcError(`${method}: HTTP ${res.status}`, res.status);
        if (!RETRYABLE.has(res.status)) throw lastError;
        await sleep(400 * Math.pow(2, attempt));
        continue;
      }

      const json = (await res.json()) as { result?: T; error?: { message: string; code?: number } };

      if (json.error) {
        // Rate limits arrive inside a 200 body too.
        const rateLimited = /too many requests|rate limit/i.test(json.error.message);
        lastError = new RpcError(`${method}: ${json.error.message}`);
        if (!rateLimited) throw lastError;
        await sleep(600 * Math.pow(2, attempt));
        continue;
      }

      if (json.result === undefined) {
        lastError = new RpcError(`${method}: no result`);
        throw lastError;
      }

      return json.result;
    } catch (e) {
      if (e instanceof RpcError && e.status !== undefined && !RETRYABLE.has(e.status)) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
      await sleep(400 * Math.pow(2, attempt));
    }
  }

  throw new RpcError(
    `Could not read ${method} from Solana after ${attempts} attempts across ${urls.length} endpoint(s): ${lastError?.message ?? "unknown"}. This is a failure to read, not a finding about the chain.`,
  );
}
