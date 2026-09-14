/**
 * Probe: the SpaceX case.
 *
 * One company. Three tokens on Solana. Three completely different claims.
 * This script proves the engine end to end against live mainnet data.
 */
import { fetchMints, effectiveMultiplier, hasMultiplierTrap } from "../lib/onchain/mint.js";
import { issuerForMint } from "../data/issuers.js";

const SPACEX_TOKENS = [
  "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb", // Backpack Securities
  "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8", // xStocks / Backed
  "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh", // PreStocks
];

const bar = "=".repeat(74);

function uiSupply(raw: string, decimals: number, multiplier: string): string {
  const n = Number(raw) / 10 ** decimals;
  return (n * Number(multiplier)).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const states = await fetchMints(SPACEX_TOKENS);

console.log(`\n${bar}\nCLAIM — SpaceX on Solana\n${bar}`);

for (const mint of SPACEX_TOKENS) {
  const s = states.get(mint);
  if (!s) {
    console.log(`\n${mint}\n  NOT FOUND`);
    continue;
  }
  const issuer = issuerForMint(mint);
  const eff = effectiveMultiplier(s);
  const trap = hasMultiplierTrap(s);

  console.log(`\n${s.symbol ?? "?"} — ${s.name ?? "?"}`);
  console.log(`  mint             ${mint}`);
  console.log(`  issuer           ${issuer?.name ?? "UNKNOWN"}`);
  console.log(`  structure        ${issuer?.structure.value ?? "-"}`);
  console.log(`  redemption       ${issuer?.redemption.value ?? "-"}`);
  console.log(`  shareholder rts  ${issuer ? (issuer.shareholderRights.value ? "yes" : "no") : "-"}`);
  console.log(`  program          ${s.program}  (decimals ${s.decimals})`);
  console.log(`  supply           ${uiSupply(s.supplyRaw, s.decimals, eff)}`);

  console.log(`  -- powers over your tokens --`);
  console.log(`  permanent deleg. ${s.permanentDelegate ?? "none"}`);
  console.log(
    `  pausable         ${s.pausable ? `yes (paused=${s.pausable.paused})` : "no"}`,
  );
  console.log(
    `  transfer fee     ${
      s.transferFee
        ? `${s.transferFee.basisPoints / 100}% ${
            s.transferFee.maximumFee === "18446744073709551615" ||
            Number(s.transferFee.maximumFee) >= 1.8e19
              ? "(UNCAPPED)"
              : `(max ${s.transferFee.maximumFee})`
          }`
        : "none"
    }`,
  );
  console.log(`  transfer hook    ${s.transferHook?.programId ?? "none"}`);
  console.log(
    `  authority keys   ${s.distinctAuthorities.length}${
      s.distinctAuthorities.length === 1 ? "  <-- SINGLE POINT OF CONTROL" : ""
    }`,
  );

  if (s.scaledUiAmount) {
    console.log(`  -- balance display --`);
    console.log(`  multiplier field ${s.scaledUiAmount.multiplier}`);
    console.log(`  effective        ${eff}`);
    if (trap) {
      const factor = Number(eff) / Number(s.scaledUiAmount.multiplier);
      console.log(
        `  !! TRAP          naive integrators display ${(1 / factor).toFixed(2)}x the real balance`,
      );
    }
  }
}

console.log(`\n${bar}`);
const traps = SPACEX_TOKENS.filter((m) => {
  const s = states.get(m);
  return s && hasMultiplierTrap(s);
});
const single = SPACEX_TOKENS.filter((m) => states.get(m)?.distinctAuthorities.length === 1);
const fees = SPACEX_TOKENS.filter((m) => (states.get(m)?.transferFee?.basisPoints ?? 0) > 0);

console.log(`tokens read              ${states.size}/${SPACEX_TOKENS.length}`);
console.log(`with a transfer fee      ${fees.length}`);
console.log(`with single-key control  ${single.length}`);
console.log(`with a multiplier trap   ${traps.length}`);
console.log(`${bar}\n`);
