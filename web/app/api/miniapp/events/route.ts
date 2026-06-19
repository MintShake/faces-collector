import { NextResponse } from "next/server";
import { decode, verify } from "@farcaster/jfs";
import {
  registerMiniAppUser,
  setMiniAppUserNotifications,
  type NotificationDetails
} from "@/lib/social";

export const dynamic = "force-dynamic";

type MiniAppEventPayload = {
  event?: "miniapp_added" | "miniapp_removed" | "notifications_enabled" | "notifications_disabled";
  notificationDetails?: NotificationDetails;
};

export async function POST(request: Request) {
  const body = await request.text();

  try {
    const data = body.trim().startsWith("{")
      ? JSON.parse(body) as { header: string; payload: string; signature: string }
      : body.trim();

    await verify({ data, keyTypes: ["app_key"] });
    const decoded = decode<MiniAppEventPayload>(data);
    const fid = decoded.header.fid;
    const event = decoded.payload.event;

    if (!fid || !event) {
      return NextResponse.json({ ok: false, error: "invalid event" }, { status: 400 });
    }

    if (event === "miniapp_added" || event === "notifications_enabled") {
      await registerMiniAppUser({
        fid,
        notificationDetails: validNotificationDetails(decoded.payload.notificationDetails)
          ? decoded.payload.notificationDetails
          : undefined
      });
    } else if (event === "miniapp_removed" || event === "notifications_disabled") {
      await setMiniAppUserNotifications({ fid });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "invalid signature"
      },
      { status: 400 }
    );
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
