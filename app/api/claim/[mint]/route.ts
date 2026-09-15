import { NextResponse } from "next/server";
import { byMint, loadUniverse } from "@/src/lib/search.js";
import { rateToken, depthFor } from "@/src/lib/rating/index.js";

/**
 * GET /api/claim/{mint}
 *
 * The risk record for one tokenized equity, free and unauthenticated.
 *
 * Any protocol accepting these as collateral needs to know whether the issuer
 * can seize or freeze the position, whether it can be liquidated at size, and
 * whether the claim behind it is a security entitlement or a vehicle interest.
 * Nothing published this before, so it is published here.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params;

  const universe = loadUniverse();
  const company = byMint(mint, universe);

  if (!company) {
    return NextResponse.json(
      {
        error: "unknown_mint",
        message:
          "This mint is not in the indexed universe. That is not a safety verdict: it may be an issuer we do not cover yet, or it may not be a tokenized equity at all.",
        mint,
      },
      { status: 404 },
    );
  }

  const resolved = company.tokens.find((t) => t.token.mint === mint);
  if (!resolved) {
    return NextResponse.json({ error: "unknown_mint", mint }, { status: 404 });
  }

  const rating = rateToken(resolved);
  const depth = depthFor(mint);
  const chain = resolved.onchain;
  const issuer = resolved.issuer;

  return NextResponse.json(
    {
      mint,
      symbol: resolved.token.symbol,
      name: resolved.token.name,

      company: {
        id: company.id,
        name: company.name,
        underlyingSymbol: company.underlyingSymbol,
        underlyingIsin: company.underlyingIsin,
        /** Other tokens referencing the same security. */
        alternatives: company.tokens
          .filter((t) => t.token.mint !== mint)
          .map((t) => ({
            mint: t.token.mint,
            symbol: t.token.symbol,
            issuer: t.issuer?.name ?? null,
            structure: t.issuer?.structure.value ?? null,
          })),
        contested: company.contested,
      },

      grade: rating.grade,
      headline: rating.headline,
      findings: rating.findings,
      authenticity: rating.authenticity,

      claim: issuer
        ? {
            issuer: issuer.name,
            legalEntity: issuer.legalEntity.value,
            jurisdiction: issuer.jurisdiction.value,
            structure: issuer.structure.value,
            redemption: issuer.redemption.value,
            shareholderRights: issuer.shareholderRights.value,
            corporateActions: issuer.corporateActions.value,
            sources: {
              structure: issuer.structure.source,
              redemption: issuer.redemption.source,
              legalEntity: issuer.legalEntity.source,
            },
          }
        : null,

      onchain: chain
        ? {
            program: chain.program,
            decimals: chain.decimals,
            supplyRaw: chain.supplyRaw,
            /** An authority that can move or burn from any holder's account. */
            permanentDelegate: chain.permanentDelegate,
            pausable: chain.pausable,
            transferFeeBasisPoints: chain.transferFee?.basisPoints ?? 0,
            transferHookProgram: chain.transferHook?.programId ?? null,
            /** One key holding every authority is a single point of control. */
            distinctAuthorities: chain.distinctAuthorities,
            multiplier: chain.scaledUiAmount?.multiplier ?? null,
            effectiveMultiplier: chain.effectiveMultiplier,
            /** True when reading `multiplier` naively gives a wrong balance. */
            multiplierTrap: chain.multiplierTrap,
            fetchedAt: chain.fetchedAt,
          }
        : null,

      exit: depth
        ? {
            tradable: depth.tradable,
            reason: depth.reason,
            maxExitWithin5PctUsd: depth.maxExitUsd,
            ladder: depth.rungs,
            checkedAt: depth.checkedAt,
          }
        : null,

      generatedAt: universe.generatedAt,
      disclaimer:
        "Sourced descriptions of legal structure and on-chain state. Not legal or investment advice. Every on-chain field is verifiable against any public Solana RPC.",
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
