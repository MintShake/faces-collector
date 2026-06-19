"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useWeb3ModalProvider } from "@web3modal/ethers/react";
import { useFacesAuth } from "./auth-context";

const FACES_TOKEN = "0xa199ab829b992fd357e40f1e91be724d7273aa82";
const USDC_TOKEN  = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const FACES_CAIP19 = `eip155:8453/erc20:${FACES_TOKEN}`;
const USDC_CAIP19  = `eip155:8453/erc20:${USDC_TOKEN}`;
const TOKEN_DECIMALS = 18n;
const USDC_DECIMALS = 6n;
const PRESETS = [10, 25, 50, 100];
const BASE_CHAIN_ID = "0x2105"; // 8453

type Status = "idle" | "approving" | "pending" | "sent" | "error";

type SwapQuote = {
  ok: true;
  inputToken: "eth" | "usdc";
  to: string;
  calldata: string;
  value: string;
  approveToken: string | null;
  approveAmount: string | null;
  ethToSpend?: string;
  usdcToSpend?: string;
  recipientAddress: string;
  priceUsd: number | null;
};

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type TransactionRequest = {
  from: string;
  to: string;
  data: string;
  value?: string;
};

type LabeledAddress = {
  address: string;
  label: string;
  isVerified: boolean;
};

export function TipButton({ fid, recipientName }: { fid: number; recipientName: string }) {
  const { identity, isMiniApp, openConnect, openWalletModal } = useFacesAuth();
  const { walletProvider } = useWeb3ModalProvider();

  const [open, setOpen]         = useState(false);
  const [amount, setAmount]     = useState(100);
  const [status, setStatus]     = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>();
  const [successMsg, setSuccessMsg] = useState<string>();

  // Resolved sender — may come from miniapp provider or Web3Modal.
  const [senderAddress, setSenderAddress]   = useState<string | undefined>();
  const [ethProvider, setEthProvider]       = useState<EthereumProvider | undefined>();
  const [providerLoading, setProviderLoading] = useState(false);

  const [tokenPrice, setTokenPrice]             = useState<number>();
  const [recipientAddress, setRecipientAddress] = useState<string>();
  const [labeledAddresses, setLabeledAddresses] = useState<LabeledAddress[]>([]);
  const [addressLoading, setAddressLoading]     = useState(false);

  const [facesBalance, setFacesBalance] = useState<bigint | null>(null);
  const [usdcBalance, setUsdcBalance]   = useState<bigint | null>(null);

  const [swapQuote, setSwapQuote]     = useState<SwapQuote | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [preferUsdc, setPreferUsdc]   = useState(false);

  const swapAbort = useRef<AbortController | null>(null);

  // ── resolve provider & sender address when panel opens ────────────────────

  useEffect(() => {
    if (!open) return;
    setProviderLoading(true);

    async function resolve() {
      if (isMiniApp) {
        if (identity?.kind === "farcaster") {
          const res = await fetch(`/api/faces/${identity.fid}/wallet`);
          const data = await res.json() as { ok: boolean; addresses?: string[] };
          if (data.ok && data.addresses?.[0]) {
            setSenderAddress(data.addresses[0].toLowerCase());
          }
        }
      } else if (identity?.kind === "wallet") {
        const provider = (walletProvider ?? getInjected()) as EthereumProvider | undefined;
        if (provider) {
          setSenderAddress(identity.address.toLowerCase());
          setEthProvider(provider);
        }
      }
    }

    resolve().catch(() => {}).finally(() => setProviderLoading(false));
  }, [open, isMiniApp, identity, walletProvider]);

  // ── fetch recipient wallet ─────────────────────────────────────────────────

  useEffect(() => {
    if (!open || recipientAddress) return;
    setAddressLoading(true);
    fetch(`/api/faces/${fid}/wallet`)
      .then((r) => r.json())
      .then((data: { ok: boolean; addresses?: string[]; labeled?: LabeledAddress[] }) => {
        if (data.ok && data.addresses?.[0]) {
          setRecipientAddress(data.addresses[0]);
          setLabeledAddresses(data.labeled ?? []);
        } else if (!isMiniApp) {
          setErrorMsg("This profile hasn't linked a wallet to Farcaster.");
        }
      })
      .catch(() => {
        if (!isMiniApp) setErrorMsg("Could not look up wallet address.");
      })
      .finally(() => setAddressLoading(false));
  }, [isMiniApp, open, fid, recipientAddress]);

  // ── token price ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${FACES_TOKEN}`)
      .then((r) => r.json())
      .then((data: { pairs?: Array<{ priceUsd?: string }> }) => {
        const p = parseFloat(data.pairs?.[0]?.priceUsd ?? "");
        if (!isNaN(p)) setTokenPrice(p);
      })
      .catch(() => {});
  }, [open]);

  // ── balances — always via Base RPC, FC wallet doesn't support eth_call ───

  useEffect(() => {
    if (!open || !senderAddress) return;
    const addr = senderAddress.replace(/^0x/i, "").toLowerCase().padStart(64, "0");

    Promise.all([
      rpcCall(FACES_TOKEN, "0x70a08231" + addr),
      rpcCall(USDC_TOKEN,  "0x70a08231" + addr),
    ]).then(([facesHex, usdcHex]) => {
      setFacesBalance(BigInt(facesHex || "0x0"));
      setUsdcBalance(BigInt(usdcHex  || "0x0"));
    }).catch(() => {});
  }, [open, senderAddress]);

  // ── swap quote ─────────────────────────────────────────────────────────────

  const rawFacesAmount = BigInt(amount) * 10n ** TOKEN_DECIMALS;
  const needsToBuy = senderAddress !== undefined && facesBalance !== null && facesBalance < rawFacesAmount;

  useEffect(() => {
    if (isMiniApp || !open || !needsToBuy || !recipientAddress) return;
    swapAbort.current?.abort();
    const ctrl = new AbortController();
    swapAbort.current = ctrl;
    setSwapLoading(true);
    setSwapQuote(null);
    const inputToken = preferUsdc ? "usdc" : "eth";
    fetch(`/api/faces/token/swap-quote?fid=${fid}&amount=${amount}&inputToken=${inputToken}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: SwapQuote | { ok: false; error: string }) => {
        if (data.ok) setSwapQuote(data as SwapQuote);
      })
      .catch((e) => { if (e.name !== "AbortError") setSwapQuote(null); })
      .finally(() => setSwapLoading(false));
    return () => ctrl.abort();
  }, [isMiniApp, open, needsToBuy, amount, fid, recipientAddress, preferUsdc]);

  // ── derived display ────────────────────────────────────────────────────────

  const facesReadable = facesBalance !== null ? Number(facesBalance / 10n ** 16n) / 100 : null;
  const usdcReadable  = usdcBalance  !== null ? Number(usdcBalance  / 10n ** 4n)  / 100 : null;
  const usdFor = (n: number) => tokenPrice ? `≈ $${(n * tokenPrice).toFixed(2)}` : null;
  const canUseUsdc = usdcBalance !== null && usdcBalance > 0n;
  const missingFaces = needsToBuy && facesReadable !== null
    ? Math.max(0, amount - facesReadable)
    : 0;

  const costHint = swapQuote?.inputToken === "usdc" && swapQuote.usdcToSpend
    ? `~${swapQuote.usdcToSpend} USDC`
    : swapQuote?.inputToken === "eth" && swapQuote.ethToSpend
    ? `~${trimEth(swapQuote.ethToSpend)} ETH`
    : null;

  // ── send ──────────────────────────────────────────────────────────────────

  async function resolveActiveWallet() {
    if (isMiniApp) {
      const provider = await sdk.wallet.getEthereumProvider();
      if (!provider) return undefined;
      const eth = provider as unknown as EthereumProvider;
      const accounts = await requestAccounts(eth, true);
      if (!accounts[0]) return undefined;
      const address = accounts[0].toLowerCase();
      setSenderAddress(address);
      setEthProvider(eth);
      return { ethProvider: eth, senderAddress: address };
    }

    const provider = (walletProvider ?? getInjected()) as EthereumProvider | undefined;
    if (!provider) return undefined;
    const accounts = await requestAccounts(provider, true);
    if (!accounts[0]) return undefined;
    const address = accounts[0].toLowerCase();
    setSenderAddress(address);
    setEthProvider(provider);
    return { ethProvider: provider, senderAddress: address };
  }

  async function handleSend() {
    if (!identity) { openConnect(); return; }

    setSuccessMsg(undefined);

    if (isMiniApp) {
      await handleMiniAppTip();
      return;
    }

    const activeWallet = await resolveActiveWallet().catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (isDisconnectedProviderError(msg)) {
        setErrorMsg("Wallet disconnected. Reconnect your wallet, then try the tip again.");
      } else {
        setErrorMsg(msg.length < 120 ? msg : "Wallet connection failed. Reconnect and try again.");
      }
      setStatus("error");
      return undefined;
    });

    if (!activeWallet) {
      if (isMiniApp) {
        setErrorMsg("Wallet not available in this Farcaster client.");
      } else {
        openWalletModal();
      }
      return;
    }

    if (!recipientAddress) {
      setErrorMsg("No wallet address found for this profile.");
      setStatus("error");
      return;
    }

    setStatus("pending");
    setErrorMsg(undefined);

    try {
      // FC wallet is already on Base and doesn't support chain switching.
      if (!isMiniApp) await switchToBase(activeWallet.ethProvider);

      // Re-check FACES balance via Base RPC (FC wallet doesn't support eth_call).
      const balData = "0x70a08231" + activeWallet.senderAddress.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
      const balHex  = await rpcCall(FACES_TOKEN, balData);
      const currentBalance = BigInt(balHex || "0x0");
      setFacesBalance(currentBalance);

      let txHash: string | undefined;

      if (currentBalance >= rawFacesAmount) {
        const result = await sendTransactionWithBalanceFallback({
          ethProvider: activeWallet.ethProvider,
          transaction: { from: activeWallet.senderAddress, to: FACES_TOKEN, data: encodeERC20Transfer(recipientAddress, rawFacesAmount) },
          recipientAddress,
          expectedDelta: rawFacesAmount
        });
        txHash = result.txHash;
      } else {
        let quote = swapQuote;
        if (!quote) {
          const inputToken = preferUsdc && canUseUsdc ? "usdc" : "eth";
          const res  = await fetch(`/api/faces/token/swap-quote?fid=${fid}&amount=${amount}&inputToken=${inputToken}`);
          const data = await res.json() as SwapQuote | { ok: false; error: string };
          if (!data.ok) throw new Error((data as { error: string }).error ?? "Swap quote failed");
          quote = data as SwapQuote;
        }

        if (quote.approveToken && quote.approveAmount) {
          const allowanceData = "0xdd62ed3e"
            + activeWallet.senderAddress.replace(/^0x/i, "").toLowerCase().padStart(64, "0")
            + quote.to.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
          const allowHex  = await rpcCall(quote.approveToken, allowanceData);
          const allowance = BigInt(allowHex || "0x0");
          const needed    = BigInt(quote.approveAmount);

          if (allowance < needed) {
            setStatus("approving");
            const approveData = "0x095ea7b3"
              + quote.to.replace(/^0x/i, "").toLowerCase().padStart(64, "0")
              + needed.toString(16).padStart(64, "0");
            await activeWallet.ethProvider.request({
              method: "eth_sendTransaction",
              params: [{ from: activeWallet.senderAddress, to: quote.approveToken, data: approveData }],
            });
            setStatus("pending");
          }
        }

        const result = await sendTransactionWithBalanceFallback({
          ethProvider: activeWallet.ethProvider,
          transaction: { from: activeWallet.senderAddress, to: quote.to, data: quote.calldata, value: quote.value },
          recipientAddress,
          expectedDelta: (rawFacesAmount * 98n) / 100n
        });
        txHash = result.txHash;
      }

      const tipMessage = buildTipMessage({
        amount,
        recipientName,
        senderName: senderDisplayName(identity, activeWallet.senderAddress),
      });

      setStatus("sent");
      setOpen(false);
      setSuccessMsg(`Tip sent to ${recipientName}.`);
      void recordTipActivity({
        fid,
        recipientName,
        amount,
        actorAddress: activeWallet.senderAddress,
        txHash,
        message: tipMessage
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
        setStatus("idle");
      } else if (isDisconnectedProviderError(msg)) {
        setErrorMsg("Wallet disconnected. Reconnect your wallet, then try the tip again.");
        setStatus("error");
      } else {
        setErrorMsg(msg.length < 120 ? msg : "Transaction failed — check your wallet and try again.");
        setStatus("error");
      }
    }
  }

  async function recordTipActivity(input: {
    fid: number;
    recipientName: string;
    amount: number;
    actorAddress?: string;
    txHash?: string;
    message: string;
  }) {
    try {
      const response = await fetch("/api/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectFid: input.fid,
          subjectDisplayName: input.recipientName,
          amount: input.amount,
          actorAddress: input.actorAddress,
          txHash: input.txHash,
          message: input.message
        }),
      });
      if (!response.ok) throw new Error(await response.text());
    } catch {
      setErrorMsg("Tip sent, but Faces could not update activity yet.");
    }
  }

  async function handleMiniAppTip() {
    if (identity?.kind !== "farcaster") {
      openConnect();
      return;
    }

    setStatus("pending");
    setErrorMsg(undefined);

    try {
      if (!recipientAddress) {
        throw new Error("No wallet address found for this profile.");
      }

      const activeWallet = await resolveActiveWallet();
      if (!activeWallet) {
        throw new Error("Farcaster wallet is not available in this client.");
      }

      const balance = await getFacesBalance(activeWallet.senderAddress).catch(() => null);
      if (balance !== null) {
        setFacesBalance(balance);
        if (balance < rawFacesAmount) {
          throw new Error("Not enough FACES. Tap Get FACES first, then try the tip again.");
        }
      }

      const result = await sendTransactionWithBalanceFallback({
        ethProvider: activeWallet.ethProvider,
        transaction: {
          from: activeWallet.senderAddress,
          to: FACES_TOKEN,
          data: encodeERC20Transfer(recipientAddress, rawFacesAmount)
        },
        recipientAddress,
        expectedDelta: rawFacesAmount
      });

      const tipMessage = buildTipMessage({
        amount,
        recipientName,
        senderName: senderDisplayName(identity, activeWallet.senderAddress),
      });

      setStatus("sent");
      setOpen(false);
      setSuccessMsg(`Tip sent to ${recipientName}.`);
      void recordTipActivity({
        fid,
        recipientName,
        amount,
        actorAddress: activeWallet.senderAddress,
        txHash: result.txHash,
        message: tipMessage
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
        setStatus("idle");
      } else {
        setErrorMsg(msg.length < 120 ? msg : "Tip failed. Check your Farcaster wallet and try again.");
        setStatus("error");
      }
    }
  }

  async function handleMiniAppBuyFaces() {
    if (identity?.kind !== "farcaster") {
      openConnect();
      return;
    }

    setStatus("pending");
    setErrorMsg(undefined);

    try {
      const swapResult = await sdk.actions.swapToken({
        sellToken: USDC_CAIP19,
        buyToken: FACES_CAIP19,
        sellAmount: estimateUsdcSellAmount(amount, tokenPrice),
      });

      if (!swapResult.success) {
        throw new Error(swapResult.error?.message ?? "Swap was not completed.");
      }

      const senderWallet = senderAddress ?? await fetchPrimaryWallet(identity.fid).catch(() => undefined);
      if (senderWallet) {
        setSenderAddress(senderWallet);
        const refreshed = await getFacesBalance(senderWallet).catch(() => null);
        if (refreshed !== null) setFacesBalance(refreshed);
      }

      setStatus("idle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
        setStatus("idle");
      } else {
        setErrorMsg(msg.length < 120 ? msg : "Could not open the FACES swap. Try buying FACES in your Farcaster wallet.");
        setStatus("error");
      }
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (status === "sent") {
    return (
      <span className="tipSent">
        {successMsg ?? `Tip sent to ${recipientName}.`}
        {errorMsg && <small>{errorMsg}</small>}
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" className="tipButton" onClick={() => setOpen(true)}>
        Tip Faces token
      </button>
    );
  }

  const loading = providerLoading || addressLoading;

  const sendLabel = () => {
    if (status === "approving") return "Approving USDC…";
    if (status === "pending")   return isMiniApp ? "Opening wallet…" : needsToBuy ? "Buying & sending…" : "Sending…";
    if (needsToBuy && swapLoading) return "Getting price…";
    if (needsToBuy && !swapQuote && !swapLoading) return "Need more FACES";
    return isMiniApp ? `Tip ${amount.toLocaleString()} FACES` : `Send ${amount.toLocaleString()} FACES`;
  };

  return (
    <div className="tipPanel">
      <div className="tipHeader">
        <span>Tip <strong>{recipientName}</strong></span>
        {tokenPrice && <span className="tipPrice">1 FACES = ${tokenPrice.toFixed(6)}</span>}
      </div>

      {loading && <p className="tipHint">Loading…</p>}

      {!loading && !senderAddress && !isMiniApp && (
        <p className="tipHint">
          <button type="button" className="inlineLink" onClick={openConnect}>Connect a wallet</button> to send tokens.
        </p>
      )}

      {(recipientAddress || isMiniApp) && (
        <>
          {recipientAddress && labeledAddresses.length > 1 ? (
            <div className="tipAddressRow">
              <span className="tipAddressLabel">Send to:</span>
              <select
                className="tipAddressSelect"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
              >
                {labeledAddresses.map((l) => (
                  <option key={l.address} value={l.address}>
                    {l.label} · {l.address.slice(0, 6)}…{l.address.slice(-4)}
                  </option>
                ))}
              </select>
            </div>
          ) : recipientAddress ? (
            <p className="tipHint">
              {labeledAddresses[0]?.label ?? "Sending to"}{" "}
              <strong>{recipientAddress.slice(0, 6)}…{recipientAddress.slice(-4)}</strong>
              {labeledAddresses[0]?.isVerified && <span className="tipVerifiedBadge"> ✓</span>}
            </p>
          ) : (
            <p className="tipHint">Farcaster will route this tip to the profile wallet.</p>
          )}

          <div className="tipBalances">
            {facesReadable !== null && (
              <span className={facesReadable >= amount ? "tipBalancePill ok" : "tipBalancePill low"}>
                {facesReadable.toLocaleString()} FACES
              </span>
            )}
            {usdcReadable !== null && usdcReadable > 0 && (
              <span className="tipBalancePill">
                ${usdcReadable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
              </span>
            )}
          </div>

          {needsToBuy && canUseUsdc && (
            <div className="tipInputToggle">
              <button type="button" className={!preferUsdc ? "tipToggleBtn active" : "tipToggleBtn"} onClick={() => setPreferUsdc(false)}>ETH</button>
              <button type="button" className={preferUsdc ? "tipToggleBtn active" : "tipToggleBtn"} onClick={() => setPreferUsdc(true)}>USDC</button>
            </div>
          )}

          <div className="tipPresets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={amount === p ? "tipPreset active" : "tipPreset"}
                onClick={() => setAmount(p)}
                aria-label={`Tip ${p.toLocaleString()} FACES`}
              >
                <span>{p.toLocaleString()} FACES</span>
                {usdFor(p) && <small>{usdFor(p)}</small>}
              </button>
            ))}
          </div>
        </>
      )}

      {errorMsg && <p className="tipError">{errorMsg}</p>}

      {!loading && (
        <>
          {!isMiniApp && needsToBuy && costHint && (
            <p className="tipCostHint">Estimated purchase: {costHint}</p>
          )}
          {!isMiniApp && needsToBuy && !costHint && !swapLoading && (
            <p className="tipCostHint warning">
              You need {missingFaces.toLocaleString(undefined, { maximumFractionDigits: 2 })} more FACES. Buying is not available yet, so add FACES to your wallet and send again.
            </p>
          )}
          <div className="tipActions">
            {isMiniApp && (
              <button
                type="button"
                className="secondaryButton"
                onClick={handleMiniAppBuyFaces}
                disabled={status === "pending" || status === "approving"}
              >
                Get FACES
              </button>
            )}
            <button
              type="button"
              className="primaryButton"
              onClick={handleSend}
              disabled={status === "pending" || status === "approving" || (!isMiniApp && (swapLoading || (needsToBuy && !swapQuote && !swapLoading)))}
            >
              {sendLabel()}
            </button>
            <button type="button" className="textButton"
              onClick={() => { setOpen(false); setStatus("idle"); setErrorMsg(undefined); }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function encodeERC20Transfer(to: string, amount: bigint): string {
  return "0xa9059cbb"
    + to.replace(/^0x/i, "").toLowerCase().padStart(64, "0")
    + amount.toString(16).padStart(64, "0");
}

async function switchToBase(eth: EthereumProvider) {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_ID }] });
  } catch (err) {
    if ((err as { code?: number }).code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: BASE_CHAIN_ID, chainName: "Base", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://mainnet.base.org"], blockExplorerUrls: ["https://basescan.org"] }],
      });
    } else { throw err; }
  }
}

async function requestAccounts(eth: EthereumProvider, canPrompt: boolean) {
  const existing = await eth.request({ method: "eth_accounts" }).catch(() => []) as string[];
  if (existing[0] || !canPrompt) return existing;
  return await eth.request({ method: "eth_requestAccounts" }) as string[];
}

async function rpcCall(to: string, data: string): Promise<string> {
  const res = await fetch("https://mainnet.base.org", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const json = await res.json() as { result?: string };
  return json.result ?? "0x0";
}

async function sendTransactionWithBalanceFallback({
  ethProvider,
  transaction,
  recipientAddress,
  expectedDelta
}: {
  ethProvider: EthereumProvider;
  transaction: TransactionRequest;
  recipientAddress: string;
  expectedDelta: bigint;
}) {
  const before = await getFacesBalance(recipientAddress);
  const result = await ethProvider.request({
    method: "eth_sendTransaction",
    params: [transaction],
  });
  const txHash = typeof result === "string" && /^0x[a-fA-F0-9]{64}$/.test(result) ? result : undefined;

  try {
    await waitForRecipientBalanceIncrease(recipientAddress, before, expectedDelta);
  } catch {
    // Some hosts return before indexers/RPC catch up. Keep the tx hash and let
    // the activity log show the tip instead of trapping the user in pending.
  }

  return { txHash };
}

async function waitForRecipientBalanceIncrease(recipientAddress: string, before: bigint, expectedDelta: bigint) {
  const deadline = Date.now() + 90_000;
  const target = before + expectedDelta;

  while (Date.now() < deadline) {
    await delay(3_000);
    const current = await getFacesBalance(recipientAddress).catch(() => before);

    if (current >= target) {
      return;
    }
  }

  throw new Error("Transaction submitted, but Faces could not confirm the received balance yet. Check your wallet activity and try refreshing.");
}

async function getFacesBalance(address: string) {
  const data = "0x70a08231" + address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
  return BigInt(await rpcCall(FACES_TOKEN, data) || "0x0");
}

async function fetchPrimaryWallet(fid: number) {
  const res = await fetch(`/api/faces/${fid}/wallet`);
  const data = await res.json() as { ok: boolean; addresses?: string[] };
  return data.ok ? data.addresses?.[0]?.toLowerCase() : undefined;
}

function estimateUsdcSellAmount(facesAmount: number, tokenPrice?: number) {
  if (!tokenPrice || tokenPrice <= 0) return undefined;
  const dollars = Math.max(0.01, facesAmount * tokenPrice * 1.2);
  return BigInt(Math.ceil(dollars * Number(10n ** USDC_DECIMALS))).toString();
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getInjected(): EthereumProvider | undefined {
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum;
}

function trimEth(s: string): string {
  const n = parseFloat(s);
  return isNaN(n) ? s : n.toPrecision(4).replace(/\.?0+$/, "");
}

function senderDisplayName(identity: ReturnType<typeof useFacesAuth>["identity"], address: string) {
  if (identity?.kind === "farcaster") {
    return identity.username ? `@${identity.username}` : identity.displayName ?? `FID ${identity.fid}`;
  }

  return shortenAddress(address);
}

function buildTipMessage(input: { amount: number; recipientName: string; senderName: string }) {
  return `${input.recipientName} received ${input.amount.toLocaleString()} FACES as a tip test from the Faces mini app by ${input.senderName}.`;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function isDisconnectedProviderError(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("provider is disconnected") ||
    lower.includes("disconnected from all chains") ||
    lower.includes("code: 4900") ||
    lower.includes("4900");
}
