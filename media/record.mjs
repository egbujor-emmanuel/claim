/**
 * Record the product doing what it does, with nobody narrating over a still.
 *
 * The brief: open on the homepage, scroll through the letter, then show every
 * feature. Scrolling is done in small steps rather than jumps because the
 * opening is a pinned scroll sequence -- a jump skips the animation that is the
 * whole point of the first shot.
 *
 *   node media/record.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "https://claim-puce-kappa.vercel.app";
const OUT = "media/raw";
mkdirSync(OUT, { recursive: true });

const W = 1920, H = 1080;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Scroll like a person: many small steps, so pinned animations actually play. */
async function glide(page, toY, steps = 60, pause = 28) {
  const from = await page.evaluate(() => window.scrollY);
  for (let i = 1; i <= steps; i++) {
    const y = from + ((toY - from) * i) / steps;
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await sleep(pause);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: W, height: H } },
  reducedMotion: "no-preference",
});
const page = await context.newPage();

const scene = async (label, fn) => {
  console.log(`  ${label}`);
  await fn();
};

// 1. The opening: the word, then scrolling through the letter into the field.
await scene("open on the homepage", async () => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(2600);
});

await scene("scroll through the letter", async () => {
  const h = await page.evaluate(() => document.body.scrollHeight);
  await glide(page, Math.min(h * 0.32, H * 2.4), 110, 34);
  await sleep(2200);
});

// 2. The claim: four SpaceX tokens, four legal relationships.
await scene("SpaceX: four tokens, four claims", async () => {
  await page.goto(`${BASE}/?q=spacex`, { waitUntil: "networkidle" });
  await sleep(2400);
  await glide(page, 520, 45, 26);
  await sleep(2600);
  await glide(page, 1400, 55, 26);
  await sleep(2800);
  await glide(page, 2400, 55, 26);
  await sleep(2600);
});

// 3. Buying: Claim picks the token, and says when that is a compromise.
await scene("buy a company", async () => {
  await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
  await sleep(2600);
  await glide(page, 700, 50, 26);
  await sleep(2400);
  await glide(page, 1600, 55, 26);
  await sleep(2400);
});

// 4. A purchase review, where the compromise is stated before a wallet opens.
await scene("purchase review", async () => {
  const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const aaplx = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
  await page.goto(`${BASE}/switch?from=${usdc}&to=${aaplx}`, { waitUntil: "networkidle" });
  await sleep(2600);
  await glide(page, 900, 50, 26);
  await sleep(3000);
});

// 5. A wallet, graded worst first, with what can be acted on at the top.
await scene("scan a real wallet", async () => {
  await page.goto(`${BASE}/?q=4PZySiky6z5J5Zb469TeRxNwGVT6cbWsBoeCd6qAScbR`, { waitUntil: "networkidle" });
  await sleep(3000);
  await glide(page, 800, 50, 26);
  await sleep(2600);
  await glide(page, 1900, 60, 26);
  await sleep(2600);
});

// 6. The public API: the same verdict, machine readable.
await scene("public API", async () => {
  await page.goto(`${BASE}/api/claim/PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh`, { waitUntil: "networkidle" });
  await sleep(3400);
});

await context.close();
await browser.close();
console.log("raw video written to", OUT);
