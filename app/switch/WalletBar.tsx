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
 * Connect a wallet from the scan page.
 *
 * Connecting used to live only on the review page, behind a per-card button
 * that most cards do not have, so a holder whose top positions were all
 * unroutable had nowhere to connect and nothing to press. This puts it where
 * they already are.
 *
 * It reads nothing and signs nothing. Claim never holds a key; connecting only
 * lets the wallet be the one that signs later, on the review page.
 */
export function WalletBar({ hasReviews = false }: { hasReviews?: boolean }) {
  const [detected, setDetected] = useState<FoundWallet[]>([]);
  const [choices, setChoices] = useState<WalletChoice[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  const [name, setName] = useState("wallet");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDetected(findWallets());
    setChoices(walletChoices());
  }, []);

  const connect = async (found: FoundWallet) => {
    setBusy(true);
    setMessage(null);
    try {
      setWallet(await connectWallet(found));
      setName(found.name);
      setChoosing(false);
    } catch (e) {
      setMessage(explainWalletError(e, detected));
    } finally {
      setBusy(false);
    }
  };

  if (wallet) {
    // Connecting has to lead somewhere. Telling a holder to "open a review
    // above" on a page where every move is blocked points at nothing, and on
    // any page the more useful next step is to read what they actually hold.
    return (
      <div className="wallet-connected">
        <p className="switch-hint mono">
          {name} connected · {wallet.slice(0, 6)}…{wallet.slice(-4)}
        </p>
        <a className="switch-button" href={`/?q=${wallet}`}>
          Grade everything in this wallet
        </a>
        {hasReviews ? (
          <p className="switch-hint">
            Or open a review above to switch one position.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="wallet-bar">
      {!choosing ? (
        <>
          <button type="button" className="switch-button" onClick={() => setChoosing(true)}>
            Connect wallet
          </button>
          <p className="switch-hint">
            Connecting is read-only and costs nothing. Claim never holds a key and never submits
            a transaction — your wallet does, only if you approve it.
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
                  disabled={busy}
                >
                  <span>{c.name}</span>
                  <span className="wallet-state">{busy ? "connecting…" : "detected"}</span>
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
        </div>
      )}
      {message ? <p className="switch-error">{message}</p> : null}
    </div>
  );
}
