import { NextResponse } from "next/server";
import { registerMiniAppUser, type NotificationDetails } from "@/lib/social";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type RegisterBody = {
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  notificationDetails?: NotificationDetails;
};

export async function POST(request: Request) {
  const limited = await rateLimit(request, {
    namespace: "users:post",
    limit: 20,
    windowSeconds: 60
  });

  if (limited) {
    return limited;
  }

  const body = await request.json().catch(() => undefined) as RegisterBody | undefined;

  const fid = typeof body?.fid === "number" && Number.isInteger(body.fid)
    ? body.fid
    : undefined;

  if (!fid) {
    return NextResponse.json({ error: "fid is required" }, { status: 400 });
  }

  try {
    const user = await registerMiniAppUser({
      fid,
      username: sanitizeText(body?.username, 80),
      displayName: sanitizeText(body?.displayName, 120),
      pfpUrl: sanitizeUrl(body?.pfpUrl),
      notificationDetails: validNotificationDetails(body?.notificationDetails)
        ? body.notificationDetails
        : undefined
    });

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    return NextResponse.json(
      {
        error: "user storage is not writable",
        detail: error instanceof Error ? error.message : "Unknown storage error"
      },
      { status: 503 }
    );
  }
}

function sanitizeText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, maxLength)
    : undefined;
}

function sanitizeUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 500) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function validNotificationDetails(value: unknown): value is NotificationDetails {
  if (!value || typeof value !== "object") {
    return false;
  }

  const details = value as NotificationDetails;
  return (
    typeof details.url === "string" &&
    details.url.startsWith("https://") &&
    details.url.length <= 500 &&
    typeof details.token === "string" &&
    details.token.length <= 500
  );
}
