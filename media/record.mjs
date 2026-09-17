/**
 * Record the product being used, one scene per file.
 *
 * Two things the first attempt got wrong and this fixes.
 *
 * The page is a 940px reading column. Recording it in a 1920px viewport put it
 * in the middle of half a screen of empty background, which is why it looked
 * small. The viewport is now sized to the column and rendered at 2x, so the
 * content fills the frame and the text stays sharp when it scales to 1080p.
 *
 * And scenes are separate files. Re-recording one because a scroll landed badly
 * should not cost the other eight.
 *
 *   node media/record.mjs [baseUrl] [onlyScene]
 */
import { chromium } from "playwright";
import { mkdirSync, renameSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "https://claim-puce-kappa.vercel.app";
const ONLY = process.argv[3] ?? null;
const DIR = "media/seg";
mkdirSync(DIR, { recursive: true });

// Sized to the reading column, not to a monitor.
const VW = 1280, VH = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Scroll at a readable pace. Fast enough not to feel stuck, slow enough to read. */
/**
 * Scroll the way the browser does it, not the way a script does.
 *
 * Stepping the scroll position from node is a CDP round trip per frame, and at
 * sixty a second the page visibly stutters -- that is the lag, and it was in
 * the recorder rather than in the site. Handing the browser a single smooth
 * scroll lets it animate natively at its own refresh rate.
 */
async function glide(page, toY, ms = 900) {
  await page.evaluate(
    ([y]) => window.scrollTo({ top: y, behavior: "smooth" }),
    [toY],
  );
  await sleep(ms + 120);
}

const scenes = {
  // The opening. Scrolling through the letter is the argument, so it plays --
  // but swiftly, because a title sequence that outstays its welcome is the
  // first thing a judge skips.
  "01-open": async (page) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await sleep(1800);
    await glide(page, VH * 2.3, 2600);
    await sleep(1600);
  },

  // Using it: type a company, press Check.
  "02-search": async (page) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelector("#top")?.scrollIntoView());
    await sleep(700);
    const box = page.locator('input[name="q"]');
    await box.click();
    await box.type("spacex", { delay: 110 });
    await sleep(600);
    await page.locator('.search button').click();
    await page.waitForLoadState("networkidle");
    await sleep(2000);
  },

  // The verdict: four tokens on one company, four grades.
  "03-grades": async (page) => {
    await page.goto(`${BASE}/?q=spacex`, { waitUntil: "networkidle" });
    await glide(page, 300, 500);
    await sleep(2200);
    await glide(page, 900, 900);
    await sleep(2400);
  },

  // The evidence behind a grade.
  "04-evidence": async (page) => {
    await page.goto(`${BASE}/?q=spacex`, { waitUntil: "networkidle" });
    await glide(page, 1750, 900);
    await sleep(2600);
    await glide(page, 2350, 800);
    await sleep(2400);
  },

  // The action: a switch, reviewed.
  "05-review": async (page) => {
    await page.goto(`${BASE}/?q=spacex`, { waitUntil: "networkidle" });
    await glide(page, 560, 600);
    await sleep(1200);
    const review = page.locator('.actionable-list a.switch-button').first();
    await review.click();
    await page.waitForLoadState("networkidle");
    await sleep(2400);
    await glide(page, 700, 800);
    await sleep(2200);
  },

  // Connecting: the chooser, not one hardcoded wallet.
  "06-wallet": async (page) => {
    await page.goto(`${BASE}/?q=spacex`, { waitUntil: "networkidle" });
    await glide(page, 620, 600);
    await sleep(900);
    await page.locator('button.switch-button', { hasText: "Connect wallet" }).first().click();
    await sleep(2600);
  },

  // Buying: Claim picks the token across every reachable company.
  "07-buy": async (page) => {
    await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
    await sleep(2200);
    await glide(page, 620, 900);
    await sleep(2400);
    await glide(page, 1500, 1100);
    await sleep(2200);
  },

  // The compromise, stated before a wallet opens.
  "08-compromise": async (page) => {
    const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const aaplx = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
    await page.goto(`${BASE}/switch?from=${usdc}&to=${aaplx}`, { waitUntil: "networkidle" });
    await sleep(1800);
    await glide(page, 760, 900);
    await sleep(2800);
  },

  // A whole wallet, graded.
  "09-wallet-scan": async (page) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelector("#top")?.scrollIntoView());
    await sleep(500);
    const box = page.locator('input[name="q"]');
    await box.click();
    await box.type("4PZySiky6z5J5Zb469TeRxNwGVT6cbWsBoeCd6qAScbR", { delay: 22 });
    await page.locator('.search button').click();
    await page.waitForLoadState("networkidle");
    await sleep(2200);
    await glide(page, 620, 900);
    await sleep(2400);
    await glide(page, 1500, 1000);
    await sleep(2000);
  },

  // The same verdict, machine readable.
  "10-api": async (page) => {
    await page.goto(`${BASE}/api/claim/PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh`, { waitUntil: "networkidle" });
    await sleep(2600);
  },
};

const browser = await chromium.launch({ headless: true });
for (const [name, fn] of Object.entries(scenes)) {
  if (ONLY && name !== ONLY) continue;
  const tmp = join(DIR, `_tmp_${name}`);
  mkdirSync(tmp, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    colorScheme: "dark",
    // The first paint of a navigation is the browser's own white canvas. It is
    // unavoidable while recording starts with the context, so every scene is
    // given a lead-in that the build trims off.
    deviceScaleFactor: 1,
    // The record size must equal the viewport. Given a larger canvas Playwright
    // does not scale the page up to fill it -- it draws the page at its native
    // size in the corner, which is what put the whole product in one quadrant.
    // Capture at the column's size and let ffmpeg scale the finished frame.
    recordVideo: { dir: tmp, size: { width: VW, height: VH } },
  });
  const page = await ctx.newPage();
  await page.goto("about:blank");
  await page.evaluate(() => { document.documentElement.style.background = "#16130E"; });
  await sleep(1200);
  try { await fn(page); } catch (e) { console.log(`  ${name}: ${e.message}`); }
  await ctx.close();
  const f = readdirSync(tmp).find((x) => x.endsWith(".webm"));
  renameSync(join(tmp, f), join(DIR, `${name}.webm`));
  rmSync(tmp, { recursive: true, force: true });
  console.log(`  ${name}`);
}
await browser.close();
console.log("scenes in", DIR);
