/**
 * CLI: resolve a company to every claim on it.
 *
 *   npm run find -- spacex
 *   npm run find -- apple
 */
import { search, type ResolvedCompany } from "../lib/search.js";
import { daysUntilExpiry, EXPIRY } from "../lib/ingest/manual.js";

const STRUCTURE_LABEL: Record<string, string> = {
  direct_entitlement: "Direct entitlement",
  custodied_entitlement: "Custodied entitlement",
  securitized_exposure: "Securitized exposure",
  spv_interest: "SPV interest",
  synthetic: "Synthetic",
  unbacked: "Unbacked",
};

const REDEMPTION_LABEL: Record<string, string> = {
  portable_to_brokerage: "Portable to a brokerage",
  issuer_redemption: "Redeem with the issuer",
  mandatory_conversion: "Must convert before a deadline",
  secondary_only: "Secondary market only",
};

function render(company: ResolvedCompany) {
  const bar = "-".repeat(72);
  console.log(`\n${bar}`);
  console.log(`${company.name}${company.underlyingSymbol ? `  (${company.underlyingSymbol})` : ""}`);
  if (company.underlyingIsin) console.log(`underlying ISIN: ${company.underlyingIsin}`);
  console.log(
    `${company.tokens.length} token${company.tokens.length === 1 ? "" : "s"} on Solana` +
      (company.contested ? "  --  COMPETING CLAIM STRUCTURES" : ""),
  );
  console.log(bar);

  for (const { token, issuer, onchain } of company.tokens) {
    console.log(`\n  ${token.symbol}   ${token.name}`);
    console.log(`    mint           ${token.mint}`);
    console.log(`    issuer         ${issuer?.name ?? "unknown"}`);
    console.log(
      `    structure      ${issuer ? (STRUCTURE_LABEL[issuer.structure.value] ?? issuer.structure.value) : "-"}`,
    );
    console.log(
      `    exit           ${issuer ? (REDEMPTION_LABEL[issuer.redemption.value] ?? issuer.redemption.value) : "-"}`,
    );
    console.log(
      `    holder rights  ${issuer ? (issuer.shareholderRights.value ? "yes" : "no") : "-"}`,
    );

    if (token.tokenIsin && token.tokenIsin !== token.underlyingIsin) {
      console.log(`    token ISIN     ${token.tokenIsin}  (a different security from the share)`);
    }

    const expiry = EXPIRY[token.mint];
    if (expiry) {
      const days = daysUntilExpiry(token.mint);
      console.log(`    !! EXPIRES     ${expiry.deadline}  (${days} days)`);
      console.log(`       ${expiry.action}`);
    }

    if (onchain) {
      const powers: string[] = [];
      if (onchain.permanentDelegate) powers.push("permanent delegate");
      if (onchain.pausable) powers.push(onchain.pausable.paused ? "PAUSED NOW" : "pausable");
      if ((onchain.transferFee?.basisPoints ?? 0) > 0) {
        powers.push(`${onchain.transferFee!.basisPoints / 100}% transfer fee`);
      }
      if (onchain.transferHook?.programId) powers.push("transfer hook");
      console.log(`    issuer powers  ${powers.length ? powers.join(", ") : "none"}`);
      console.log(
        `    control keys   ${onchain.distinctAuthorities.length}` +
          (onchain.distinctAuthorities.length === 1 ? "  (single point of control)" : ""),
      );
      if (onchain.multiplierTrap) {
        const naive = Number(onchain.scaledUiAmount?.multiplier ?? 1);
        const real = Number(onchain.effectiveMultiplier);
        console.log(
          `    !! BALANCE     naive readers show ${((naive / real - 1) * 100).toFixed(1)}% vs reality`,
        );
      }
    } else {
      console.log(`    issuer powers  (no on-chain data)`);
    }
  }
  console.log();
}

const query = process.argv.slice(2).join(" ");
if (!query) {
  console.error("usage: npm run find -- <company or ticker>");
  process.exit(1);
}

const results = search(query);
if (results.length === 0) {
  console.log(`\nNo tokenized equity found for "${query}".\n`);
  process.exit(0);
}
results.forEach(render);
