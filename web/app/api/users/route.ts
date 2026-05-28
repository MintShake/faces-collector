import { NextResponse } from "next/server";
import { registerMiniAppUser, type NotificationDetails } from "@/lib/social";

export const dynamic = "force-dynamic";

type RegisterBody = {
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  notificationDetails?: NotificationDetails;
};

export async function POST(request: Request) {
  const body = await request.json() as RegisterBody;

  const fid = typeof body.fid === "number" && Number.isInteger(body.fid)
    ? body.fid
    : undefined;

  if (!fid) {
    return NextResponse.json({ error: "fid is required" }, { status: 400 });
  }

  try {
    const user = await registerMiniAppUser({
      fid,
      username: body.username,
      displayName: body.displayName,
      pfpUrl: body.pfpUrl,
      notificationDetails: body.notificationDetails
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
