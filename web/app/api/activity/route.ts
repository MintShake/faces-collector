import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/api";
import { appendActivityEvent, getActivityLog } from "@/lib/social";

export const dynamic = "force-dynamic";

export async function GET() {
  const events = await getActivityLog();
  return NextResponse.json({ events }, { headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as TipEventBody | null;

  const fid = body?.subjectFid;
  const amount = body?.amount;
  const txHash = body?.txHash;
  const actorAddress = body?.actorAddress;

  if (!fid || !amount) {
    return NextResponse.json({ ok: false, error: "subjectFid and amount required" }, { status: 400 });
  }

  await appendActivityEvent({
    type: "tip",
    actor: actorAddress ? { address: actorAddress } : undefined,
    subject: {
      fid,
      username: body?.subjectUsername,
      displayName: body?.subjectDisplayName,
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
