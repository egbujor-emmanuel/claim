"use client";

import { useEffect, useState } from "react";
import {
  walletChoices,
  connectWallet,
  isMobile,
  findWallets,
  explainWalletError,
  type FoundWallet,
  type WalletChoice,
} from "./wallet";

/**
 * The signing handoff.
 *
 * Claim builds the transaction and hands it to the visitor's own wallet. It
 * never holds a key, never funds anything, and never submits on anyone's
 * behalf — the wallet decides. That is also why this is the only file in the
 * project that touches a wallet at all.
 *
 * The amount is entered by the holder rather than defaulted to their full
 * balance. Defaulting to "everything" on a page that has just told someone
 * their holding is bad would be pushing, and the point is to inform a decision,
 * not to make it for them.
 */

type Stage =
  | "idle" | "connecting" | "quoting" | "ready"
  | "signing" | "confirming" | "sent" | "failed" | "error";

/**
 * Ask the chain what happened, until it answers.
 *
 * Polls rather than assuming: a transaction is usually visible within a few
 * seconds, and a timeout is reported as "unknown" rather than as either
 * outcome, because not knowing is not the same as failing.
 */
async function confirm(
  signature: string,
): Promise<{ state: "confirmed" | "failed" | "dropped" | "unknown"; error: string }> {
  // A blockhash is valid for roughly 60-90 seconds. Giving up sooner than that
  // reports "I do not know" about a transaction that had not finished having
  // its chance.
  const deadline = Date.now() + 95_000;
  let everSeen = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`/api/tx/${signature}`, { cache: "no-store" });
      const body = (await res.json()) as { state?: string; error?: string };
      if (body.state === "confirmed") return { state: "confirmed", error: "" };
      if (body.state === "failed") return { state: "failed", error: body.error ?? "The chain rejected it." };
      if (body.state === "pending") everSeen = true;
    } catch {
      // A failed read is not a failed transaction; keep asking.
    }
    await new Promise((r) => setTimeout(r, 2500));
  }

  // Never visible to any validator for a minute and a half means it was not
  // included at all, rather than included and still settling. The usual cause
  // is a wallet that cannot cover the fee, so the node drops it before it ever
  // reaches a block -- which is also why a block explorer sits on "verifying"
  // forever: it is looking for something that was never written.
  if (!everSeen) {
    return {
      state: "dropped",
      error:
        "It never reached the chain. The wallet signed and submitted it, but no validator " +
        "included it, so nothing happened and nothing was charged. That is what an empty " +
        "wallet looks like from here: without SOL for the network fee, or without enough of " +
        "the token being sold, the transaction is dropped before it can be written. A block " +
        "explorer will sit on “verifying” for the same reason — there is nothing to find.",
    };
  }
  return { state: "unknown", error: "" };
}

export function SwitchClient({
  fromMint,
  toMint,
  fromSymbol,
  toSymbol,
  decimals,
}: {
  fromMint: string;
  toMint: string;
  fromSymbol: string;
  toSymbol: string;
  decimals: number;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string>("wallet");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<{ out: string; impact: number | null } | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [funds, setFunds] = useState<{ uiAmount: number; canPayFee: boolean } | null>(null);

  // Detected once on the client. Wallets inject before hydration, and
  // re-scanning on every render would fight React's rendering model.
  const [detected, setDetected] = useState<FoundWallet[]>([]);
  const [choices, setChoices] = useState<WalletChoice[]>([]);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    setDetected(findWallets());
    setChoices(walletChoices());
  }, []);

  const connect = async (found: FoundWallet) => {
    setStage("connecting");
    setMessage(null);
    try {
      const address = await connectWallet(found);
      setWallet(address);
      setWalletName(found.name);
      setStage("idle");

      // What they hold decides whether any of this can work. Reading it now
      // means the page can say so before a signature rather than after a
      // transaction disappears.
      try {
        const r = await fetch(`/api/balance/${address}/${fromMint}`, { cache: "no-store" });
        const b = (await r.json()) as { uiAmount?: number; canPayFee?: boolean };
        if (typeof b.uiAmount === "number") {
          setFunds({ uiAmount: b.uiAmount, canPayFee: Boolean(b.canPayFee) });
        }
      } catch {
        // Unknown funding is not empty funding; say nothing.
      }
    } catch (e) {
      setMessage(explainWalletError(e, detected));
      setStage("error");
    }
  };

  const getQuote = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Enter how much you want to switch.");
      setStage("error");
      return;
    }
    setStage("quoting");
    setMessage(null);
    try {
      const raw = BigInt(Math.floor(value * Math.pow(10, decimals))).toString();
      const res = await fetch(
        `/api/switch?from=${fromMint}&to=${toMint}&amount=${raw}`,
      );
      const body = (await res.json()) as {
        outAmount?: string;
        priceImpactPct?: number | null;
        error?: string;
      };
      if (!res.ok || !body.outAmount) {
        setMessage(body.error ?? "No route available for that size right now.");
        setStage("error");
        return;
      }
      setQuote({ out: body.outAmount, impact: body.priceImpactPct ?? null });
      setStage("ready");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not get a quote.");
      setStage("error");
    }
  };

  const execute = async () => {
    const found = detected.find((d) => d.name === walletName) ?? detected[0];
    if (!found || !wallet) return;

    // Refuse to build something that cannot land. Signing a doomed transaction
    // costs nothing but produces a signature that no validator ever includes,
    // which looks exactly like a broken product.
    const want = Number(amount);
    if (funds && Number.isFinite(want)) {
      if (funds.uiAmount < want) {
        setMessage(
          `This wallet holds ${funds.uiAmount.toLocaleString("en-US", { maximumFractionDigits: 6 })} ` +
            `${fromSymbol}, which is less than the ${want} you asked to switch. Nothing was signed.`,
        );
        setStage("error");
        return;
      }
      if (!funds.canPayFee) {
        setMessage(
          "This wallet has no SOL to pay the network fee, so the transaction would be dropped " +
            "before it reached a block. Nothing was signed.",
        );
        setStage("error");
        return;
      }
    }
    const p = found.provider;
    setStage("signing");
    setMessage(null);
    try {
      const value = Number(amount);
      const raw = BigInt(Math.floor(value * Math.pow(10, decimals))).toString();
      const res = await fetch("/api/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromMint, to: toMint, amount: raw, wallet }),
      });
      const body = (await res.json()) as { swapTransaction?: string; error?: string };
      if (!res.ok || !body.swapTransaction) {
        setMessage(body.error ?? "Could not build the transaction.");
        setStage("error");
        return;
      }

      // Hand the transaction to the wallet. Claim does not sign or submit.
      const { VersionedTransaction } = await import("@solana/web3.js");
      const tx = VersionedTransaction.deserialize(
        Uint8Array.from(atob(body.swapTransaction), (c) => c.charCodeAt(0)),
      );
      const sent = await p.signAndSendTransaction(tx);
      setSignature(sent.signature);

      // A signature is a receipt for submission, not for success. A swap with
      // nothing to fund it fails on chain and still returns one, so announcing
      // "sent" here would tell a holder their position moved when it did not.
      setStage("confirming");
      const outcome = await confirm(sent.signature);
      if (outcome.state === "confirmed") {
        setStage("sent");
      } else if (outcome.state === "failed" || outcome.state === "dropped") {
        setMessage(outcome.error);
        setStage("failed");
      } else {
        setMessage(
          "The transaction reached the chain but had not settled after 95 seconds, which is " +
            "unusual. The signature below is real — Solscan has the final word on it.",
        );
        setStage("failed");
      }
    } catch (e) {
      setMessage(explainWalletError(e, detected));
      setStage("error");
    }
  };

  const outUi = quote ? Number(quote.out) / Math.pow(10, decimals) : null;

  return (
    <div className="switch-exec">
      {/*
        Rendered before the wallet is connected, not after. A warning screen is
        only reassuring if it was predicted; arriving at it unannounced is what
        makes a new tool look unsafe. It also has to be in the server-rendered
        page so it is there for anyone reading before they click anything.
      */}
      <p className="switch-hint">
        Your wallet will warn that it does not recognise this site. That warning is about the
        domain, not the transaction — Claim is new and unlisted. What you are signing is three
        instructions: a compute budget, the token account for {toSymbol} if you do not have one,
        and a Jupiter swap. It grants no approval that outlives it and no permission over anything
        else you hold. Check it in the wallet before you approve.
      </p>
      {!wallet ? (
        <>
          {!choosing ? (
            <>
              <button
                type="button"
                className="switch-button"
                onClick={() => setChoosing(true)}
              >
                Connect wallet
              </button>
              <p className="switch-hint">
                Connecting is read-only and costs nothing. Claim never holds a key and never
                submits a transaction — your wallet does, only if you approve it.
              </p>
            </>
          ) : (
            <div className="wallet-picker">
              <p className="wallet-picker-title">Choose a wallet</p>
              <div className="wallet-list">
                {choices.map((c) =>
                  c.found ? (
                    <button
                      key={c.name}
                      type="button"
                      className="wallet-option"
                      onClick={() => connect(c.found!)}
                      disabled={stage === "connecting"}
                    >
                      <span>{c.name}</span>
                      <span className="wallet-state">
                        {stage === "connecting" ? "connecting…" : "detected"}
                      </span>
                    </button>
                  ) : isMobile() && c.mobileHref ? (
                    <a key={c.name} className="wallet-option" href={c.mobileHref}>
                      <span>{c.name}</span>
                      <span className="wallet-state">open app</span>
                    </a>
                  ) : (
                    <a
                      key={c.name}
                      className="wallet-option wallet-absent"
                      href={c.installUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <span>{c.name}</span>
                      <span className="wallet-state">not installed</span>
                    </a>
                  ),
                )}
              </div>
              <p className="switch-hint">
                {isMobile()
                  ? "On a phone a wallet is only reachable inside its own browser, so these open the app. Everything except signing works without one."
                  : "Any of these work. Everything except signing works without connecting at all."}
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="switch-hint mono">
            {walletName} connected · {wallet.slice(0, 6)}…{wallet.slice(-4)}
            {funds ? (
              <>
                {" · holds "}
                {funds.uiAmount.toLocaleString("en-US", { maximumFractionDigits: 6 })} {fromSymbol}
                {funds.canPayFee ? "" : " · no SOL for fees"}
              </>
            ) : null}
          </p>

          <label className="switch-amount">
            <span>How much {fromSymbol} to switch</span>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
            />
          </label>

          <button type="button" className="switch-button" onClick={getQuote}>
            {stage === "quoting" ? "Getting a quote…" : "Get a quote"}
          </button>



          {quote && outUi !== null ? (
            <div className="switch-quote">
              You would receive approximately <strong>{outUi.toLocaleString("en-US", { maximumFractionDigits: 4 })} {toSymbol}</strong>
              {quote.impact !== null ? ` · price impact ${quote.impact.toFixed(2)}%` : null}
              <button
                type="button"
                className="switch-button"
                onClick={execute}
                disabled={stage === "signing" || stage === "confirming"}
              >
                {stage === "signing"
                  ? "Waiting for your wallet…"
                  : stage === "confirming"
                    ? "Confirming on chain…"
                    : `Switch to ${toSymbol}`}
              </button>
            </div>
          ) : null}
        </>
      )}

      {stage === "confirming" ? (
        <p className="switch-hint">
          Submitted. Waiting for the chain to confirm it — this takes a few seconds, and Claim
          will say plainly whether it landed.
        </p>
      ) : null}

      {stage === "sent" && signature ? (
        <p className="switch-sent">
          Confirmed on chain.{" "}
          <a href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noreferrer noopener">
            View on Solscan
          </a>
        </p>
      ) : null}

      {stage === "failed" && signature ? (
        <p className="switch-error">
          <strong>It did not go through.</strong> {message}{" "}
          <a href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noreferrer noopener">
            View on Solscan
          </a>
        </p>
      ) : null}

      {message && stage !== "failed" ? <p className="switch-error">{message}</p> : null}
    </div>
  );
}
