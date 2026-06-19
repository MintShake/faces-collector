import { NextResponse } from "next/server";
import {
  getRegisteredUsers,
  notifyProfileImageChange
} from "@/lib/social";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type PfpChangeBody = {
  fid?: number;
  username?: string;
  displayName?: string;
  changeId?: string;
};

export async function POST(request: Request) {
  const secret = process.env.FACES_NOTIFICATION_SECRET ?? process.env.COLLECTOR_SHARED_SECRET;

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "FACES_NOTIFICATION_SECRET or COLLECTOR_SHARED_SECRET is required" },
      { status: 503 }
    );
  }

  if (request.headers.get("x-faces-notification-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(request, {
    namespace: "notifications:pfp-change",
    limit: 30,
    windowSeconds: 60
  });

  if (limited) {
    return limited;
  }

  const body = await request.json().catch(() => undefined) as PfpChangeBody | undefined;
  const changedFid = typeof body?.fid === "number" && Number.isInteger(body.fid) && body.fid > 0
    ? body.fid
    : undefined;

  if (!changedFid) {
    return NextResponse.json({ ok: false, error: "fid is required" }, { status: 400 });
  }

  const neynarKey = process.env.NEYNAR_API_KEY;

  if (!neynarKey) {
    return NextResponse.json({ ok: false, error: "NEYNAR_API_KEY is required" }, { status: 503 });
  }

  const registered = (await getRegisteredUsers())
    .filter((user) => user.notificationDetails && user.fid !== changedFid);

  if (registered.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, sent: 0 });
  }

  const followerFids = await fetchFollowerFids(changedFid, neynarKey);
  const recipients = registered.filter((user) => followerFids.has(user.fid));
  const changedName = body?.username
    ? `@${body.username}`
    : body?.displayName;
  const changeId = sanitizeChangeId(body?.changeId) ?? `fid-${changedFid}`;
  const targetUrl = new URL(`/fid/${changedFid}`, request.url).toString();
  const results = await Promise.allSettled(
    recipients.map((recipient) => notifyProfileImageChange({
      recipient,
      changedFid,
      changedName,
      changeId,
      targetUrl
    }))
  );
  const sent = results.filter((result) => result.status === "fulfilled" && result.value.sent).length;

  return NextResponse.json({
    ok: true,
    registered: registered.length,
    matched: recipients.length,
    sent
  });
}

function sanitizeChangeId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9._-]{3,80}$/.test(value)
    ? value
    : undefined;
}

async function fetchFollowerFids(fid: number, apiKey: string) {
  const fids = new Set<number>();
  let cursor: string | undefined;

  for (let page = 0; page < 10; page += 1) {
    const url = new URL("https://api.neynar.com/v2/farcaster/followers/");
    url.searchParams.set("fid", String(fid));
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey
      },
      signal: AbortSignal.timeout(5_000)
    });

    if (!response.ok) {
      throw new Error(`Neynar followers failed: ${response.status}`);
    }

    const data = await response.json() as {
      users?: Array<{ user?: { fid?: number } }>;
      next?: { cursor?: string | null };
    };

    for (const item of data.users ?? []) {
      if (typeof item.user?.fid === "number") {
        fids.add(item.user.fid);
      }
    }

    cursor = data.next?.cursor ?? undefined;
    if (!cursor) break;
  }

  return fids;
}
