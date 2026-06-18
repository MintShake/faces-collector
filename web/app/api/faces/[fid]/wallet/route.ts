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

  // 1. Neynar — returns custody + verified ETH addresses.
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
          return buildResponse(
            user.custody_address,
            [
              ...(user.verified_addresses?.eth_addresses ?? []),
              ...(user.verifications ?? []),
            ]
          );
        }
      }
    } catch { /* fall through */ }
  }

  // 2. Warpcast public API — no key required.
  try {
    const res = await fetch(
      `https://api.warpcast.com/v2/user?fid=${numericFid}`,
      { next: { revalidate: 300 } }
    );
    if (res.ok) {
      const data = await res.json() as { result?: { user?: WarpcastUser } };
      const user = data.result?.user;
      if (user) {
        return buildResponse(
          user.custodyAddress,
          user.verifications ?? []
        );
      }
    }
  } catch { /* fall through */ }

  // 3. On-chain IdRegistry — custody address only.
  try {
    const custody = await getCustodyAddress(numericFid);
    if (custody && custody !== "0x0000000000000000000000000000000000000000") {
      return NextResponse.json({
        ok: true,
        addresses: [custody],
        labeled: [{ address: custody, label: "Custody address", isVerified: false }],
        custody,
      });
    }
  } catch { /* fall through */ }

  return NextResponse.json({ ok: false, error: "Could not resolve wallet for this FID" }, { status: 404 });
}

function buildResponse(custodyRaw: string | undefined, verifiedRaw: (string | undefined)[]) {
  // Normalise to lowercase for dedup.
  const custody = custodyRaw?.toLowerCase();
  const verified = verifiedRaw
    .map((a) => a?.toLowerCase())
    .filter((a): a is string => typeof a === "string" && a.startsWith("0x"));

  const addresses = [...new Set([...verified, ...(custody ? [custody] : [])])];

  const labeled: LabeledAddress[] = [
    ...verified.map((a) => ({
      address: a,
      label: "Verified wallet",
      isVerified: true,
    })),
    ...(custody && !verified.includes(custody)
      ? [{ address: custody, label: "Custody address", isVerified: false }]
      : []),
  ].filter((l, i, arr) => arr.findIndex((x) => x.address === l.address) === i);

  return NextResponse.json({ ok: true, addresses, labeled, custody: custody ?? null });
}

async function getCustodyAddress(fid: number): Promise<string | null> {
  const selector = "0x65269e47"; // custodyOf(uint256)
  const data = selector + fid.toString(16).padStart(64, "0");

  const res = await fetch(OP_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: ID_REGISTRY, data }, "latest"],
    }),
    next: { revalidate: 3600 },
  });

  const json = await res.json() as { result?: string };
  const result = json.result;
  if (!result || result === "0x") return null;
  return "0x" + result.slice(-40);
}

type NeynarUser = {
  custody_address: string;
  verifications?: string[];
  verified_addresses?: { eth_addresses?: string[] };
};

type WarpcastUser = {
  custodyAddress: string;
  verifications?: string[];
};

type LabeledAddress = {
  address: string;
  label: string;
  isVerified: boolean;
};
