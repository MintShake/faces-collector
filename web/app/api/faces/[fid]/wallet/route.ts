import { NextRequest, NextResponse } from "next/server";

const ID_REGISTRY = "0x00000000Fc6c5F01Fc30151999387Bb99A9f489b";
const OP_RPC = "https://mainnet.optimism.io";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  const { fid } = await params;
  const numericFid = Number(fid);

  if (!Number.isInteger(numericFid) || numericFid <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid FID" }, { status: 400 });
  }

  // Try Neynar first — returns both custody and verified addresses.
  const neynarKey = process.env.NEYNAR_API_KEY;
  if (neynarKey) {
    try {
      const res = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${numericFid}`,
        { headers: { accept: "application/json", "x-api-key": neynarKey }, next: { revalidate: 300 } }
      );
      if (res.ok) {
        const data = await res.json() as { users?: NeynarUser[] };
        const user = data.users?.[0];
        if (user) {
          const addresses = [
            ...(user.verified_addresses?.eth_addresses ?? []),
            ...(user.verifications ?? []),
            user.custody_address
          ].filter((a): a is string => typeof a === "string" && a.startsWith("0x"));

          return NextResponse.json({ ok: true, addresses, custody: user.custody_address });
        }
      }
    } catch { /* fall through */ }
  }

  // Fallback: read custody address on-chain from Farcaster's ID Registry on Optimism.
  try {
    const custody = await getCustodyAddress(numericFid);
    if (custody && custody !== "0x0000000000000000000000000000000000000000") {
      return NextResponse.json({ ok: true, addresses: [custody], custody });
    }
  } catch { /* fall through */ }

  return NextResponse.json({ ok: false, error: "Could not resolve wallet for this FID" }, { status: 404 });
}

async function getCustodyAddress(fid: number): Promise<string | null> {
  // custodyOf(uint256) selector = first 4 bytes of keccak256("custodyOf(uint256)")
  const selector = "0x65269e47";
  const paddedFid = fid.toString(16).padStart(64, "0");
  const data = selector + paddedFid;

  const res = await fetch(OP_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: ID_REGISTRY, data }, "latest"]
    }),
    next: { revalidate: 3600 }
  });

  const json = await res.json() as { result?: string };
  const result = json.result;

  if (!result || result === "0x") return null;

  // Result is a 32-byte padded address — take the last 20 bytes.
  return "0x" + result.slice(-40);
}

type NeynarUser = {
  custody_address: string;
  verifications?: string[];
  verified_addresses?: { eth_addresses?: string[] };
};
