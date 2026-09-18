/**
 * One continuous recording, driven by the narration.
 *
 * The voice is generated first and its line lengths are known, so this does not
 * guess: each action runs while its line is being spoken, and the offset the
 * line actually started at is written out for the mixdown to place the audio.
 *
 * Everything happens in a single browser context. Recording each scene in its
 * own context is what produced the black gaps -- every context begins with an
 * empty canvas and ends abruptly, and stitching those together shows every one
 * of those seams.
 *
 *   node media/record.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "https://claim-puce-kappa.vercel.app";
const TIMING = JSON.parse(readFileSync("media/timing.json", "utf8"));
const GAP = 0.45;
const OUT = "media/final";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AAPLX = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const WALLET = "4PZySiky6z5J5Zb469TeRxNwGVT6cbWsBoeCd6qAScbR";

/** Hand the browser one smooth scroll and let it animate natively. */
async function to(page, y) {
  await page.evaluate((v) => window.scrollTo({ top: v, behavior: "smooth" }), y);
}

const browser = await chromium.launch({ headless: true });
const created = Date.now();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  colorScheme: "dark",
});
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

// Everything recorded before this instant is loading, and gets trimmed.
const t0 = Date.now();
const lead = (t0 - created) / 1000;
const offsets = [];

const acts = {
  hold: async () => {},
  // The portal's content only lands at ~1700; below that the camera is still
  // zooming through the letter and the frame is empty green.
  enter: async () => { await to(page, 900); },
  portal: async () => { await to(page, 1720); },
  portal2: async () => { await to(page, 2010); },
  search: async () => {
    await to(page, 0);
    await sleep(700);
    const box = page.locator('input[name="q"]');
    await box.click();
    await box.fill("");
    await box.type("spacex", { delay: 95 });
    await page.locator(".search button").click();
    await page.waitForLoadState("networkidle");
  },
  grades: async () => { await to(page, 260); },
  grades2: async () => { await to(page, 640); },
  evidence: async () => { await to(page, 1500); },
  evidence2: async () => { await to(page, 1860); },
  reference: async () => { await to(page, 2150); },
  moves: async () => { await to(page, 300); },
  review: async () => {
    await page.locator(".actionable-list a.switch-button").first().click();
    await page.waitForLoadState("networkidle");
    await sleep(500);
    await to(page, 520);
  },
  wallet: async () => {
    await to(page, 900);
    await sleep(500);
    const b = page.locator("button.switch-button", { hasText: "Connect wallet" }).first();
    if (await b.count()) await b.click();
  },
  walletHold: async () => {},
  buy: async () => {
    await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await sleep(400);
  },
  buyScroll: async () => { await to(page, 700); await sleep(1400); await to(page, 1500); },
  compromise: async () => {
    await page.goto(`${BASE}/switch?from=${USDC}&to=${AAPLX}`, { waitUntil: "networkidle" });
    await sleep(600);
    await to(page, 700);
  },
  scanType: async () => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await sleep(300);
    const box = page.locator('input[name="q"]');
    await box.click();
    await box.type(WALLET, { delay: 18 });
    await page.locator(".search button").click();
    await page.waitForLoadState("networkidle");
  },
  scanShow: async () => { await to(page, 560); await sleep(1600); await to(page, 1400); },
  api: async () => {
    await page.goto(`${BASE}/api/claim/PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh`, {
      waitUntil: "networkidle",
    });
  },
  apiHold: async () => {},
};

for (const line of TIMING) {
  const at = (Date.now() - t0) / 1000;
  offsets.push({ id: line.id, at: Number(at.toFixed(3)), dur: line.dur });
  const started = Date.now();
  try {
    await (acts[line.act] ?? acts.hold)();
  } catch (e) {
    console.log(`  ${line.id} ${line.act}: ${e.message.slice(0, 70)}`);
  }
  const spent = (Date.now() - started) / 1000;
  const wait = line.dur + GAP - spent;
  if (wait > 0) await sleep(wait * 1000);
  console.log(`  ${line.id} ${line.act.padEnd(11)} at ${at.toFixed(1)}s`);
}

await sleep(900);
await ctx.close();
await browser.close();

const f = readdirSync(OUT).find((x) => x.endsWith(".webm"));
renameSync(join(OUT, f), join(OUT, "raw.webm"));
writeFileSync("media/offsets.json", JSON.stringify({ lead, offsets }, null, 1));
console.log(`\nlead ${lead.toFixed(2)}s, ${offsets.length} lines -> media/final/raw.webm`);
