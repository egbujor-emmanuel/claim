"use client";

import { useState } from "react";
import {
  findWallet,
  isMobile,
  phantomDeepLink,
  explainWalletError,
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

type Stage = "idle" | "connecting" | "quoting" | "ready" | "signing" | "sent" | "error";

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

  const connect = async () => {
    const found = findWallet();

    if (!found) {
      // On mobile nothing injects into Safari or Chrome. Saying "no wallet
      // found" there would be false and would read as a broken product.
      setMessage(
        isMobile()
          ? "Mobile browsers cannot reach a wallet directly. Open this page inside your wallet's own browser, or keep reading — everything except signing works without one."
          : "No Solana wallet found in this browser. Phantom, Solflare or Backpack will work. Everything except signing works without one.",
      );
      setStage("error");
      return;
    }

    setStage("connecting");
    setMessage(null);
    try {
      const res = await found.provider.connect();
      setWallet(res.publicKey.toString());
      setWalletName(found.name);
      setStage("idle");
    } catch (e) {
      setMessage(explainWalletError(e));
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
    const found = findWallet();
    if (!found || !wallet) return;
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
      setStage("sent");
    } catch (e) {
      setMessage(explainWalletError(e));
      setStage("error");
    }
  };

  const outUi = quote ? Number(quote.out) / Math.pow(10, decimals) : null;

  return (
    <div className="switch-exec">
      {!wallet ? (
        <>
          <button type="button" className="switch-button" onClick={connect}>
            {stage === "connecting" ? "Connecting…" : "Connect wallet to switch"}
          </button>
          <p className="switch-hint">
            Connecting is read-only and costs nothing. Claim never holds a key and never submits
            a transaction — your wallet does, only if you approve it.
          </p>
          {isMobile() ? (
            <p className="switch-hint">
              On a phone? Wallets cannot be reached from Safari or Chrome.{" "}
              <a href={phantomDeepLink()}>Open this page in Phantom</a> to sign, or carry on
              reading here — everything except signing works without a wallet.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="switch-hint mono">
            {walletName} connected · {wallet.slice(0, 6)}…{wallet.slice(-4)}
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
                disabled={stage === "signing"}
              >
                {stage === "signing" ? "Waiting for your wallet…" : `Switch to ${toSymbol}`}
              </button>
            </div>
          ) : null}
        </>
      )}

      {stage === "sent" && signature ? (
        <p className="switch-sent">
          Sent.{" "}
          <a
            href={`https://solscan.io/tx/${signature}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            View on Solscan
          </a>
        </p>
      ) : null}

      {message ? <p className="switch-error">{message}</p> : null}
    </div>
  );
}
