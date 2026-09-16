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
const RECEIVER_PROGRAM = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

/** Sponsored feeds live in shard 0. */
const SHARD = 0;

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

/**
 * Derive the price account for a feed.
 *
 * Accounts are PDAs of [shard as u16 LE, feed id] under the receiver program,
 * so no registry lookup is needed to find one.
 */
export function priceAccountFor(feedIdHex: string): PublicKey {
  const id = feedIdHex.startsWith("0x") ? feedIdHex.slice(2) : feedIdHex;
  const shard = Buffer.alloc(2);
  shard.writeUInt16LE(SHARD, 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [shard, Buffer.from(id, "hex")],
    RECEIVER_PROGRAM,
  );
  return pda;
}

/**
 * PriceUpdateV2 layout:
 *   8 discriminator | 32 write authority | 1 verification level
 *   then PriceFeedMessage: 32 feed id | 8 price i64 | 8 conf u64 | 4 expo i32
 *   | 8 publish time i64 | ...
 */
function parsePriceAccount(data: Buffer): PythPrice | null {
  if (data.length < 8 + 32 + 1 + 32 + 8 + 8 + 4 + 8) return null;
  let o = 8 + 32 + 1;
  const feedId = data.subarray(o, o + 32).toString("hex");
  o += 32;
  const rawPrice = data.readBigInt64LE(o);
  o += 8;
  const rawConf = data.readBigUInt64LE(o);
  o += 8;
  const exponent = data.readInt32LE(o);
  o += 4;
  const publishTime = Number(data.readBigInt64LE(o));

  const scale = Math.pow(10, exponent);
  return {
    feedId,
    price: Number(rawPrice) * scale,
    confidence: Number(rawConf) * scale,
    exponent,
    publishTime: new Date(publishTime * 1000).toISOString(),
    ageSeconds: Math.max(0, Math.round(Date.now() / 1000 - publishTime)),
  };
}

interface AccountValue {
  data: [string, string];
}

/** Read several feeds at once. Missing feeds are simply absent from the map. */
export async function readPrices(feedIds: string[]): Promise<Map<string, PythPrice>> {
  const out = new Map<string, PythPrice>();
  if (feedIds.length === 0) return out;

  const accounts = feedIds.map((id) => priceAccountFor(id).toBase58());

  for (let i = 0; i < accounts.length; i += 100) {
    const batch = accounts.slice(i, i + 100);
    const result = await rpc<{ value: (AccountValue | null)[] }>("getMultipleAccounts", [
      batch,
      { encoding: "base64" },
    ]);
    result.value.forEach((account, idx) => {
      if (!account?.data?.[0]) return;
      const parsed = parsePriceAccount(Buffer.from(account.data[0], "base64"));
      const requested = feedIds[i + idx];
      if (parsed && requested) out.set(requested, parsed);
    });
    if (i + 100 < accounts.length) await new Promise((r) => setTimeout(r, 200));
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
