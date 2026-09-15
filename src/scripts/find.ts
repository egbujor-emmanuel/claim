/**
 * CLI: resolve a company to every claim on it, graded.
 *
 *   npm run find -- spacex
 *   npm run find -- apple
 */
import { search } from "../lib/search.js";
import { rateCompany, type RatedCompany } from "../lib/rating/index.js";
import type { Finding, Severity } from "../lib/rating/grade.js";

const MARK: Record<Severity, string> = {
  critical: "!!",
  warning: " !",
  note: "  ",
  good: " +",
};

function renderFinding(f: Finding) {
  console.log(`      ${MARK[f.severity]} ${f.message}`);
  console.log(`         evidence: ${f.evidence}`);
  if (f.source) console.log(`         source:   ${f.source}`);
}

function render(company: RatedCompany) {
  const bar = "=".repeat(76);
  console.log(`\n${bar}`);
  console.log(`${company.name}${company.underlyingSymbol ? `   (${company.underlyingSymbol})` : ""}`);
  if (company.underlyingIsin) console.log(`underlying security: ${company.underlyingIsin}`);

  const n = company.tokens.length;
  console.log(
    `${n} token${n === 1 ? "" : "s"} on Solana` +
      (company.contested ? "   --  THESE CONFER DIFFERENT LEGAL CLAIMS" : ""),
  );
  console.log(bar);

  // Worst grade first: the thing a holder most needs to see.
  const ordered = [...company.tokens].sort((a, b) => {
    const ga = company.ratings[a.token.mint]?.grade ?? "F";
    const gb = company.ratings[b.token.mint]?.grade ?? "F";
    return gb.localeCompare(ga);
  });

  for (const resolved of ordered) {
    const rating = company.ratings[resolved.token.mint];
    if (!rating) continue;
    const { token, issuer } = resolved;

    console.log(`\n  [${rating.grade}]  ${token.symbol}   ${token.name}`);
    console.log(`       ${rating.headline}`);
    console.log(`       mint   ${token.mint}`);
    console.log(`       issuer ${issuer?.name ?? "unknown"}`);
    console.log();
    rating.findings.forEach(renderFinding);
  }

  console.log(
    `\n  Structure descriptions are sourced, not legal advice. Every on-chain\n` +
      `  field above is readable from any public Solana RPC.\n`,
  );
}

const query = process.argv.slice(2).join(" ");
if (!query) {
  console.error("usage: npm run find -- <company or ticker>");
  process.exitCode = 1;
} else {
  const results = search(query, 3);
  if (results.length === 0) {
    console.log(`\nNo tokenized equity found for "${query}".\n`);
  } else {
    results.map(rateCompany).forEach(render);
  }
}
