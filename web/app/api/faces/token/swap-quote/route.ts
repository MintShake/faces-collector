import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const WETH = "0x4200000000000000000000000000000000000006";
const FACES_TOKEN = "0xa199Ab829b992FD357E40F1E91be724D7273aa82";
const SWAP_ROUTER_02 = "0x2626664c2603336E57B271c5C0b26F421741e481";
const BASE_RPC = "https://mainnet.base.org";
const SLIPPAGE = 0.02; // 2%

// SwapRouter02 removes `deadline` from the struct (unlike original ISwapRouter).
const routerInterface = new ethers.Interface([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)"
]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fid = Number(searchParams.get("fid"));
  const amount = Number(searchParams.get("amount")); // desired FACES

  if (!fid || !amount || amount <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid params" }, { status: 400 });
  }

  // Resolve recipient wallet.
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = process.env.VERCEL_URL ? "https" : "http";
  const walletUrl = `${proto}://${host}/api/faces/${fid}/wallet`;
  const walletData = await fetch(walletUrl, { next: { revalidate: 300 } })
    .then((r) => r.json() as Promise<{ ok: boolean; addresses?: string[] }>)
    .catch(() => ({ ok: false as const }));

  if (!walletData.ok || !walletData.addresses?.[0]) {
    return NextResponse.json({ ok: false, error: "No wallet found for FID" }, { status: 404 });
  }
  const recipientAddress = walletData.addresses[0];

  // Get token price and pool address from DexScreener.
  const dexData = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${FACES_TOKEN}`,
    { next: { revalidate: 30 } }
  ).then((r) => r.json() as Promise<{ pairs?: DexPair[] }>)
    .catch(() => ({ pairs: [] as DexPair[] }));

  const pair =
    dexData.pairs?.find((p) => p.chainId === "base") ?? dexData.pairs?.[0];

  if (!pair?.priceNative) {
    return NextResponse.json({ ok: false, error: "Could not fetch token price" }, { status: 503 });
  }

  const priceNative = parseFloat(pair.priceNative);

  // Determine pool fee tier from the pool contract.
  let fee = 10000; // default 1% — common for newer tokens
  if (pair.pairAddress) {
    const poolFee = await getPoolFee(pair.pairAddress);
    if (poolFee !== null) fee = poolFee;
  }

  // ETH to spend: desired amount × price per token × (1 + slippage).
  // exactInputSingle uses a fixed ETH input, so we add buffer.
  const ethToSpend = priceNative * amount * (1 + SLIPPAGE);
  const amountIn = BigInt(Math.ceil(ethToSpend * 1e18));

  // Minimum FACES the recipient must receive (accept up to slippage% less).
  const amountOutMinimum = (BigInt(amount) * 10n ** 18n * BigInt(Math.floor((1 - SLIPPAGE) * 100))) / 100n;

  const calldata = routerInterface.encodeFunctionData("exactInputSingle", [
    {
      tokenIn: WETH,
      tokenOut: FACES_TOKEN,
      fee,
      recipient: recipientAddress,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0,
    },
  ]);

  return NextResponse.json({
    ok: true,
    to: SWAP_ROUTER_02,
    calldata,
    value: "0x" + amountIn.toString(16),
    ethToSpend: ethToSpend.toFixed(10),
    recipientAddress,
    fee,
    priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : null,
  });
}

async function getPoolFee(poolAddress: string): Promise<number | null> {
  try {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      // fee() selector = 0xddca3f43
      params: [{ to: poolAddress, data: "0xddca3f43" }, "latest"],
    });
    const res = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      next: { revalidate: 86400 }, // fee tiers never change
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
