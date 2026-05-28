import { NextResponse } from "next/server";
import {
  getImageLikes,
  notifyPfpOwner,
  registerMiniAppUser,
  updateImageLike,
  type NotificationDetails
} from "@/lib/social";

export const dynamic = "force-dynamic";

type LikeBody = {
  imageId?: string;
  ownerFid?: number;
  imageUrl?: string;
  action?: "like" | "unlike";
  user?: {
    fid?: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
  notificationDetails?: NotificationDetails;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get("imageId");
  const viewerFid = Number(searchParams.get("viewerFid"));

  if (!imageId) {
    return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  }

  const record = await getImageLikes(imageId);
  const likes = Object.values(record?.likes ?? {}).sort(
    (a, b) => Date.parse(b.likedAt) - Date.parse(a.likedAt)
  );

  return NextResponse.json({
    imageId,
    count: record?.count ?? 0,
    viewerLiked: Number.isInteger(viewerFid) ? Boolean(record?.likes[String(viewerFid)]) : false,
    likes
  });
}

export async function POST(request: Request) {
  const body = await request.json() as LikeBody;

  const imageId = body.imageId;
  const ownerFid = typeof body.ownerFid === "number" && Number.isInteger(body.ownerFid)
    ? body.ownerFid
    : undefined;
  const imageUrl = body.imageUrl;
  const action = body.action;

  if (!imageId || !ownerFid || !imageUrl) {
    return NextResponse.json({ error: "imageId, ownerFid, and imageUrl are required" }, { status: 400 });
  }

  if (action !== "like" && action !== "unlike") {
    return NextResponse.json({ error: "action must be like or unlike" }, { status: 400 });
  }

  const bodyUser = body.user;
  const userFid = typeof bodyUser?.fid === "number" && Number.isInteger(bodyUser.fid)
    ? bodyUser.fid
    : undefined;

  if (!userFid) {
    return NextResponse.json({ error: "user fid is required" }, { status: 401 });
  }

  const user = {
    fid: userFid,
    username: bodyUser?.username,
    displayName: bodyUser?.displayName,
    pfpUrl: bodyUser?.pfpUrl
  };

  let record;
  let alreadyLiked;

  try {
    await registerMiniAppUser({
      ...user,
      notificationDetails: body.notificationDetails
    });

    const result = await updateImageLike({
      imageId,
      ownerFid,
      imageUrl,
      action,
      user
    });

    record = result.record;
    alreadyLiked = result.alreadyLiked;
  } catch (error) {
    return NextResponse.json(
      {
        error: "likes storage is not writable",
        detail: error instanceof Error ? error.message : "Unknown storage error"
      },
      { status: 503 }
    );
  }

  let notification;

  if (action === "like" && !alreadyLiked && ownerFid !== user.fid) {
    notification = await notifyPfpOwner({
      ownerFid,
      liker: user,
      targetUrl: new URL(`/fid/${ownerFid}`, request.url).toString()
    });
  }

  return NextResponse.json({
    imageId,
    count: record.count,
    viewerLiked: Boolean(record.likes[String(user.fid)]),
    likes: Object.values(record.likes).sort((a, b) => Date.parse(b.likedAt) - Date.parse(a.likedAt)),
    notification
  });
}
