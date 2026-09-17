import { PublicKey } from "@solana/web3.js";
import { rpc } from "../onchain/rpc.js";

/**
 * Pyth price feeds, read from chain.
 *
 * Claim answers what a claim is and whether you can exit it. It has never
 * answered whether the token is priced like the thing it claims to represent,
 * and that is a real hole: a token can have impeccable structure and still
 * trade far from the asset.
 *
 * Pyth closes it directly. Alongside the underlying equity it publishes feeds
 * for the tokens themselves, and — most usefully — redemption-ratio feeds that
 * price a token in units of the share it tracks:
 *
 *   Equity.US.AAPL/USD     the real Apple share
 *   Crypto.AAPLX/USD       the xStocks token
 *   Crypto.AAPLX/AAPL.RR   the token priced in shares. 1.0 means it tracks.
 *
 * The .RR feed IS the premium or discount, published rather than inferred.
 *
 * Prices are read from Pyth's on-chain price accounts rather than the HTTP API,
 * which now requires credentials. Reading accounts needs none, costs nothing,
 * and is the same mechanism Claim already uses for mints.
 */

/** Pyth's price receiver program on Solana mainnet. */
const RECEIVER_PROGRAM = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";

/**
 * Where the feed id sits inside a PriceUpdateV2 account.
 *
 * Eight bytes of discriminator, a 32-byte write authority, one byte of
 * verification level, then the id. Deriving the account address from a seed
 * was the wrong approach -- the addresses that produced do not exist, while
 * the accounts plainly do: the program owns 11,424 of them. Asking the chain
 * which account carries a given feed is both simpler and correct.
 */
const FEED_ID_OFFSET = 41;

const FEED_SEARCH = "https://hermes.pyth.network/v2/price_feeds";

export interface PythPrice {
  feedId: string;
  price: number;
  /** Pyth's own uncertainty band. A wide band means do not lean on the number. */
  confidence: number;
  exponent: number;
  publishTime: string;
  ageSeconds: number;
}

function toBase58(hex: string): string {
  return new PublicKey(Buffer.from(hex.replace(/^0x/, ""), "hex")).toBase58();
}

/**
 * Read the freshest account carrying each feed.
 *
 * A feed has many update accounts, posted by different callers at different
 * times, and most are stale -- the Apple feed had twelve, one of them seven
 * weeks old. Taking the newest is the difference between a live price and a
 * number from July.
 */
export async function readPrices(feedIds: string[]): Promise<Map<string, PythPrice>> {
  const out = new Map<string, PythPrice>();
  const now = Date.now();

  for (const feedId of feedIds) {
    const id = feedId.replace(/^0x/, "");
    let accounts: { pubkey: string; account: { data: [string, string] } }[];
    try {
      accounts = await rpc("getProgramAccounts", [
        RECEIVER_PROGRAM,
        {
          encoding: "base64",
          filters: [{ memcmp: { offset: FEED_ID_OFFSET, bytes: toBase58(id) } }],
        },
      ]);
    } catch {
      continue; // a failed read is not a missing price
    }

    let best: PythPrice | null = null;
    for (const a of accounts) {
      const b = Buffer.from(a.account.data[0], "base64");
      if (b.length < FEED_ID_OFFSET + 52) continue;
      const p = FEED_ID_OFFSET + 32;
      const exponent = b.readInt32LE(p + 16);
      const publish = Number(b.readBigInt64LE(p + 20)) * 1000;
      const parsed: PythPrice = {
        feedId: id,
        price: Number(b.readBigInt64LE(p)) * 10 ** exponent,
        confidence: Number(b.readBigUInt64LE(p + 8)) * 10 ** exponent,
        exponent,
        publishTime: new Date(publish).toISOString(),
        ageSeconds: Math.round((now - publish) / 1000),
      };
      if (!best || parsed.ageSeconds < best.ageSeconds) best = parsed;
    }
    if (best) out.set(id, best);
  }

  return out;
}

export interface FeedRef {
  id: string;
  symbol: string;
}

/**
 * Find Pyth's feeds for a symbol. Discovery is public even though price reads
 * are not, so the mapping can be built without credentials.
 */
export async function findFeeds(query: string): Promise<FeedRef[]> {
  const res = await fetch(`${FEED_SEARCH}?query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { id?: string; attributes?: { symbol?: string } }[];
  if (!Array.isArray(body)) return [];
  return body
    .filter((f) => f.id && f.attributes?.symbol)
    .map((f) => ({ id: f.id!, symbol: f.attributes!.symbol! }));
}

/**
 * The three feeds that matter for a tokenized equity, when they exist:
 * the underlying share, the token, and the ratio between them.
 */
export interface FeedSet {
  underlying?: FeedRef;
  token?: FeedRef;
  ratio?: FeedRef;
}

export function classifyFeeds(feeds: FeedRef[], tokenSymbol: string, underlyingSymbol: string): FeedSet {
  const t = tokenSymbol.toUpperCase();
  const u = underlyingSymbol.toUpperCase();
  return {
    underlying: feeds.find((f) => f.symbol.toUpperCase() === `EQUITY.US.${u}/USD`),
    token: feeds.find((f) => f.symbol.toUpperCase() === `CRYPTO.${t}/USD`),
    ratio: feeds.find((f) => f.symbol.toUpperCase().endsWith(".RR") && f.symbol.toUpperCase().startsWith(`CRYPTO.${t}/`)),
  };
}
