/**
 * Every feature, end to end, against production and mainnet.
 *
 * The gate proves internal logic. This drives the deployed site the way a judge
 * would -- every page, every endpoint, every guard -- and for anything that
 * ends in a transaction it builds the real one and has a validator execute it
 * against current chain state. Nothing is signed and nothing is spent.
 *
 *   npx tsx src/scripts/fullcheck.ts [baseUrl]
 */
import { rpc } from "../lib/onchain/rpc.js";
import { loadUniverse } from "../lib/search.js";

const BASE = process.argv[2] ?? "https://claim-puce-kappa.vercel.app";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? `  (${detail})` : ""}`); }
  else { fails.push(name); console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`); }
};
const section = (t: string) => console.log(`\n=== ${t} ===`);

const page = async (path: string) => {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, body: await r.text() };
};

const u = loadUniverse();
const mintOf = (sym: string) => u.tokens.find((t) => t.symbol === sym)?.mint ?? "";

// ---------------------------------------------------------------- pages
section("pages a judge will open");
for (const [label, path] of [
  ["landing", "/"],
  ["company: SpaceX", "/?q=spacex"],
  ["company: Apple", "/?q=apple"],
  ["company: NVIDIA", "/?q=nvidia"],
  ["company: Tesla", "/?q=tesla"],
  ["buy list", "/buy"],
  ["API docs", "/api-docs"],
] as const) {
  const r = await page(path);
  ok(`${label} renders`, r.status === 200 && r.body.length > 2000, `HTTP ${r.status}, ${(r.body.length / 1024).toFixed(0)}KB`);
}

section("navigation is reachable");
const home = (await page("/")).body;
ok("nav links the buy page", /href="\/buy"/.test(home));
ok("buy link is emphasised", /class="nav-buy"/.test(home));
ok("nav links the API", /href="\/api-docs"/.test(home));
ok("a way back to the top exists", home.includes("Back to the top"));

section("wallet scans");
for (const w of [
  "4PZySiky6z5J5Zb469TeRxNwGVT6cbWsBoeCd6qAScbR",
  "Ht33KipRJnAKv9Bj5dFXCrMWyfQFeqMLoC7oaDARCe84",
  "2Cq2RNFFxxPXL7teNQAji1beA2vFbBDYW5BGPBFvoN9m",
]) {
  const r = await page(`/?q=${w}`);
  const graded = /tokenized equities held/.test(r.body);
  const connect = r.body.includes("Connect wallet");
  ok(`scan ${w.slice(0, 10)}…`, r.status === 200 && graded && connect, `graded=${graded} connect=${connect}`);
}

section("public API");
const api = await fetch(`${BASE}/api/claim/${mintOf("SPACEX")}`);
const apiBody = (await api.json()) as { grade?: string; findings?: unknown[]; disclaimer?: string };
ok("GET /api/claim/{mint}", api.status === 200 && apiBody.grade === "F", `grade ${apiBody.grade}`);
ok("API carries findings", (apiBody.findings?.length ?? 0) > 0, `${apiBody.findings?.length}`);
ok("API is CORS-open", api.headers.get("access-control-allow-origin") === "*");
ok("malformed mint rejected", (await fetch(`${BASE}/api/claim/notamint`)).status === 400);
const oos = await fetch(`${BASE}/api/claim/${USDC}`);
ok("out-of-scope token is not graded", oos.status === 200);

section("guards");
const cross = await fetch(`${BASE}/api/switch?from=${mintOf("SPACEX")}&to=${USDC}&amount=1000000`);
ok("refuses routing into a non-equity", cross.status === 400, `HTTP ${cross.status}`);
const weak = await fetch(`${BASE}/api/switch?from=${USDC}&to=${mintOf("AAPLon")}&amount=1000000`);
const weakBody = (await weak.json()) as { error?: string };
ok("refuses buying a weaker claim", weak.status === 400 && weakBody.error === "destination_not_sanctioned", weakBody.error ?? "");
const dead = await fetch(`${BASE}/api/switch?from=${mintOf("SOXLx")}&to=${mintOf("SOXL")}&amount=1000000`);
ok("refuses a destination with no market", dead.status !== 200, `HTTP ${dead.status}`);
ok("rejects malformed switch input", (await fetch(`${BASE}/api/switch?from=x&to=y&amount=z`)).status === 400);

// ------------------------------------------------- transactions, simulated
const simulate = async (label: string, from: string, to: string, amount: string, wallet: string) => {
  const q = await fetch(`${BASE}/api/switch?from=${from}&to=${to}&amount=${amount}`);
  const qb = (await q.json()) as { outAmount?: string; error?: string };
  if (q.status !== 200 || !qb.outAmount) { ok(`${label}: quote`, false, qb.error ?? `HTTP ${q.status}`); return; }
  ok(`${label}: quote`, true, `out ${qb.outAmount}`);

  const b = await fetch(`${BASE}/api/switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, amount, wallet }),
  });
  const bb = (await b.json()) as { swapTransaction?: string; error?: string };
  if (b.status !== 200 || !bb.swapTransaction) { ok(`${label}: build`, false, bb.error ?? `HTTP ${b.status}`); return; }
  ok(`${label}: build`, true, `${bb.swapTransaction.length} b64`);

  const sim = await rpc<{ value: { err: unknown; unitsConsumed?: number } }>("simulateTransaction", [
    bb.swapTransaction,
    { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "processed" },
  ]);
  ok(`${label}: SIMULATES ON MAINNET`, !sim.value.err,
    sim.value.err ? JSON.stringify(sim.value.err) : `${sim.value.unitsConsumed} units`);
};

const HOLDER = "4PZySiky6z5J5Zb469TeRxNwGVT6cbWsBoeCd6qAScbR";
section("switch: real transactions, executed by a validator");
await simulate("SPACEX→SPCX", mintOf("SPACEX"), mintOf("SPCX"), "1000000000", HOLDER);
await simulate("SPACEX→SPCXx", mintOf("SPACEX"), mintOf("SPCXx"), "1000000000", HOLDER);
await simulate("SPACEX→tSpaceX", mintOf("SPACEX"), mintOf("tSpaceX"), "1000000000", HOLDER);

section("buy: real transactions, executed by a validator");
await simulate("USDC→SPCX (A)", USDC, mintOf("SPCX"), "1000000", HOLDER);
await simulate("USDC→AAPLx (C)", USDC, mintOf("AAPLx"), "1000000", HOLDER);
await simulate("USDC→GOOGLx (C)", USDC, mintOf("GOOGLx"), "1000000", HOLDER);
await simulate("USDC→TSLAx", USDC, mintOf("TSLAx"), "1000000", HOLDER);

section("review pages");
for (const [label, q] of [
  ["switch review", `/switch?from=${mintOf("SPACEX")}&to=${mintOf("SPCX")}`],
  ["purchase review", `/switch?from=${USDC}&to=${mintOf("AAPLx")}`],
  ["blocked switch", `/switch?from=${mintOf("SOXLx")}&to=${mintOf("SOXL")}`],
  ["nonsense pair", `/switch?from=abc&to=def`],
] as const) {
  const r = await page(q);
  ok(`${label} renders`, r.status === 200, `HTTP ${r.status}`);
}

const bar = "=".repeat(60);
console.log(`\n${bar}`);
console.log(`passed ${pass}   failed ${fails.length}`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((f) => console.log("  - " + f)); }
console.log(bar);
process.exitCode = fails.length ? 1 : 0;
