import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/api";
import { appendActivityEvent, getActivityLog } from "@/lib/social";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const events = await getActivityLog();
  return NextResponse.json({ events }, { headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, {
    namespace: "activity:post",
    limit: 20,
    windowSeconds: 60
  });

  if (limited) {
    return limited;
  }

  const body = await request.json().catch(() => null) as TipEventBody | null;

  const bodyFid = body?.subjectFid;
  const bodyAmount = body?.amount;
  const fid = Number.isInteger(bodyFid) ? bodyFid : undefined;
  const amount = typeof bodyAmount === "number" && Number.isFinite(bodyAmount)
    ? bodyAmount
    : undefined;
  const txHash = validTxHash(body?.txHash) ? body?.txHash : undefined;
  const actorAddress = validAddress(body?.actorAddress) ? body?.actorAddress.toLowerCase() : undefined;

  if (!fid || fid <= 0 || amount == null || amount <= 0 || amount > 10_000_000) {
    return NextResponse.json({ ok: false, error: "subjectFid and amount required" }, { status: 400 });
  }

  await appendActivityEvent({
    type: "tip",
    actor: actorAddress ? { address: actorAddress } : undefined,
    subject: {
      fid,
      username: sanitizeText(body?.subjectUsername, 80),
      displayName: sanitizeText(body?.subjectDisplayName, 120),
      amount,
      txHash: txHash ?? undefined,
    },
  });

  return NextResponse.json({ ok: true });
}

type TipEventBody = {
  subjectFid: number;
  subjectUsername?: string;
  subjectDisplayName?: string;
  amount: number;
  txHash?: string;
  actorAddress?: string;
};

function sanitizeText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, maxLength)
    : undefined;
}

function validAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function validTxHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}
