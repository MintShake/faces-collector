import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { rateLimit } from "@/lib/rate-limit";

const WETH   = "0x4200000000000000000000000000000000000006";
const USDC   = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // native USDC on Base
const FACES  = "0xa199Ab829b992FD357E40F1E91be724D7273aa82";
const SWAP_ROUTER_02 = "0x2626664c2603336E57B271c5C0b26F421741e481";
const BASE_RPC = "https://mainnet.base.org";
const SLIPPAGE = 0.02; // 2%

const routerInterface = new ethers.Interface([
  // ETH/WETH → token (payable, value = ETH amount)
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  // ERC-20 → token multi-hop (not payable, approval required)
  "function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params) returns (uint256 amountOut)",
]);

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, {
    namespace: "token:swap-quote",
    limit: 60,
    windowSeconds: 60
  });

  if (limited) {
    return limited;
  }

  const { searchParams } = new URL(req.url);
  const fid    = Number(searchParams.get("fid"));
  const amount = Number(searchParams.get("amount")); // desired FACES tokens
  const inputToken = (searchParams.get("inputToken") ?? "eth").toLowerCase(); // "eth" | "usdc"

  if (!fid || !amount || amount <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid params" }, { status: 400 });
  }

  // Resolve recipient wallet.
  const host  = req.headers.get("host") ?? "localhost:3000";
  const proto = process.env.VERCEL_URL ? "https" : "http";
  const walletData = await fetch(`${proto}://${host}/api/faces/${fid}/wallet`, { next: { revalidate: 300 } })
    .then((r) => r.json() as Promise<{ ok: boolean; addresses?: string[] }>)
    .catch(() => ({ ok: false as const }));

  if (!walletData.ok || !walletData.addresses?.[0]) {
    return NextResponse.json({ ok: false, error: "No wallet found for FID" }, { status: 404 });
  }
  const recipientAddress = walletData.addresses[0];

  // Fetch FACES price from DexScreener.
  const dexData = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${FACES}`,
    { next: { revalidate: 30 } }
  ).then((r) => r.json() as Promise<{ pairs?: DexPair[] }>)
    .catch(() => ({ pairs: [] as DexPair[] }));

  const pair = dexData.pairs?.find((p) => p.chainId === "base") ?? dexData.pairs?.[0];

  if (!pair?.priceUsd) {
    return NextResponse.json(
      { ok: false, error: "No liquidity pool found for FACES. Add liquidity on Uniswap V3 (Base) first." },
      { status: 503 }
    );
  }

  const priceUsd    = parseFloat(pair.priceUsd);
  const priceNative = pair.priceNative ? parseFloat(pair.priceNative) : null;

  // Minimum FACES the recipient must receive (slippage%).
  const amountOutMinimum = (BigInt(amount) * 10n ** 18n * BigInt(Math.floor((1 - SLIPPAGE) * 100))) / 100n;

  if (inputToken === "usdc") {
    // USDC is a stablecoin ≈ $1, so cost ≈ amount × priceUsd.
    const usdcToSpend = priceUsd * amount * (1 + SLIPPAGE);
    const amountIn    = BigInt(Math.ceil(usdcToSpend * 1e6)); // USDC has 6 decimals

    // Try direct USDC/FACES pool first; fall back to USDC→WETH→FACES multi-hop.
    const facesPoolFee  = pair.pairAddress ? (await getPoolFee(pair.pairAddress)) ?? 10000 : 10000;
    const usdcWethFee   = 500; // USDC/WETH 0.05% is the canonical pool on Base

    // Build multi-hop path: USDC → WETH → FACES
    const path = encodePath([USDC, WETH, FACES], [usdcWethFee, facesPoolFee]);

    const calldata = routerInterface.encodeFunctionData("exactInput", [{
      path,
      recipient: recipientAddress,
      amountIn,
      amountOutMinimum,
    }]);

    return NextResponse.json({
      ok: true,
      inputToken: "usdc",
      to: SWAP_ROUTER_02,
      calldata,
      value: "0x0",          // no ETH — ERC-20 swap
      approveToken: USDC,
      approveAmount: "0x" + amountIn.toString(16),
      usdcToSpend: usdcToSpend.toFixed(4),
      recipientAddress,
      priceUsd,
    });
  }

  // Default: ETH → FACES via exactInputSingle.
  if (!priceNative) {
    return NextResponse.json(
      { ok: false, error: "No ETH price available for this token." },
      { status: 503 }
    );
  }

  const ethToSpend = priceNative * amount * (1 + SLIPPAGE);
  const amountIn   = BigInt(Math.ceil(ethToSpend * 1e18));

  const facesPoolFee = pair.pairAddress ? (await getPoolFee(pair.pairAddress)) ?? 10000 : 10000;

  const calldata = routerInterface.encodeFunctionData("exactInputSingle", [{
    tokenIn: WETH,
    tokenOut: FACES,
    fee: facesPoolFee,
    recipient: recipientAddress,
    amountIn,
    amountOutMinimum,
    sqrtPriceLimitX96: 0,
  }]);

  return NextResponse.json({
    ok: true,
    inputToken: "eth",
    to: SWAP_ROUTER_02,
    calldata,
    value: "0x" + amountIn.toString(16),
    approveToken: null,
    approveAmount: null,
    ethToSpend: ethToSpend.toFixed(10),
    recipientAddress,
    fee: facesPoolFee,
    priceUsd,
  });
}

// Encode a multi-hop path: [addr0, addr1, ...] with fee tiers between each pair.
function encodePath(addresses: string[], fees: number[]): string {
  let path = addresses[0].replace(/^0x/, "").toLowerCase();
  for (let i = 0; i < fees.length; i++) {
    path += fees[i].toString(16).padStart(6, "0"); // fee is uint24 = 3 bytes
    path += addresses[i + 1].replace(/^0x/, "").toLowerCase();
  }
  return "0x" + path;
}

async function getPoolFee(poolAddress: string): Promise<number | null> {
  try {
    const res = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: poolAddress, data: "0xddca3f43" }, "latest"], // fee()
      }),
      next: { revalidate: 86400 },
    });
    const json = (await res.json()) as { result?: string };
    if (!json.result || json.result === "0x") return null;
    return parseInt(json.result, 16);
  } catch {
    return null;
  }
}

type DexPair = {
  chainId: string;
  pairAddress: string;
  priceNative?: string;
  priceUsd?: string;
};
