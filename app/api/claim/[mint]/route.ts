import { NextResponse } from "next/server";
import { loadUniverse } from "@/src/lib/search.js";
import { depthFor } from "@/src/lib/rating/index.js";
import { analyseMint } from "@/src/lib/live.js";

/**
 * GET /api/claim/{mint}
 *
 * The risk record for one tokenized equity, free and unauthenticated.
 *
 * Any protocol accepting these as collateral needs to know whether the issuer
 * can seize or freeze the position, whether it can be liquidated at size, and
 * whether the claim behind it is a security entitlement or a vehicle interest.
 *
 * Mints outside the indexed universe are not refused. They are read live from
 * chain and identified by their on-chain fingerprint, because an unknown
 * address is exactly when someone most needs an answer.
 */

const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params;

  if (!MINT_PATTERN.test(mint)) {
    return NextResponse.json(
      {
        error: "invalid_address",
        message: "That is not a base58 Solana address.",
        mint,
      },
      { status: 400 },
    );
  }

  const universe = loadUniverse();

  let analysis;
  try {
    analysis = await analyseMint(mint);
  } catch (e) {
    return NextResponse.json(
      {
        error: "upstream_unavailable",
        message:
          "Could not read this mint from Solana RPC. This is a failure to answer, not a verdict about the token.",
        detail: e instanceof Error ? e.message : String(e),
        mint,
      },
      { status: 503 },
    );
  }

  if (analysis.error) {
    return NextResponse.json(
      { error: "not_a_mint", message: analysis.error, mint },
      { status: 404 },
    );
  }

  const { rating, company, indexed } = analysis;
  const resolved = company?.tokens.find((t) => t.token.mint === mint) ?? null;
  const chain = resolved?.onchain ?? null;
  const issuer = resolved?.issuer ?? null;
  const depth = depthFor(mint);

  return NextResponse.json(
    {
      mint,
      symbol: rating?.symbol ?? null,
      name: resolved?.token.name ?? null,

      /**
       * false means this mint was read live rather than from the indexed
       * universe. The structural verdict is just as real; there is simply no
       * issuer catalogue entry or competing-token list behind it.
       */
      indexed,

      company: company
        ? {
            id: company.id,
            name: company.name,
            underlyingSymbol: company.underlyingSymbol,
            underlyingIsin: company.underlyingIsin,
            alternatives: company.tokens
              .filter((t) => t.token.mint !== mint)
              .map((t) => ({
                mint: t.token.mint,
                symbol: t.token.symbol,
                issuer: t.issuer?.name ?? null,
                structure: t.issuer?.structure.value ?? null,
              })),
            contested: company.contested,
          }
        : null,

      grade: rating?.grade ?? null,
      /** False when the token is not a tokenized equity and was not graded. */
      inScope: rating?.inScope ?? false,
      headline: rating?.headline ?? null,
      findings: rating?.findings ?? [],
      authenticity: rating?.authenticity ?? null,

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
            permanentDelegate: chain.permanentDelegate,
            pausable: chain.pausable,
            transferFeeBasisPoints: chain.transferFee?.basisPoints ?? 0,
            transferHookProgram: chain.transferHook?.programId ?? null,
            distinctAuthorities: chain.distinctAuthorities,
            multiplier: chain.scaledUiAmount?.multiplier ?? null,
            effectiveMultiplier: chain.effectiveMultiplier,
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

      /** When the indexed universe was last rebuilt. Judge staleness yourself. */
      universeGeneratedAt: universe.generatedAt,
      universeAgeHours: Math.round(
        (Date.now() - Date.parse(universe.generatedAt)) / 3_600_000,
      ),
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
