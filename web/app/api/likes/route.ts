import { NextResponse } from "next/server";
import { corsHeaders, logApiRequest } from "@/lib/api";
import {
  getImageLikes,
  notifyPfpOwner,
  registerMiniAppUser,
  updateImageLike,
  type NotificationDetails
} from "@/lib/social";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type LikeBody = {
  imageId?: string;
  ownerFid?: number;
  imageUrl?: string;
  action?: "like" | "unlike";
  user?: {
    fid?: number;
    address?: string;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
  notificationDetails?: NotificationDetails;
};

export async function GET(request: Request) {
  const startedAt = Date.now();
  const limited = await rateLimit(request, {
    namespace: "likes:get",
    limit: 180,
    windowSeconds: 60
  });

  if (limited) {
    logApiRequest({ route: "likes.get", request, startedAt, status: 429, error: "rate_limited" });
    return limited;
  }

  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get("imageId");
  const viewerId = searchParams.get("viewerId");

  if (!imageId) {
    logApiRequest({ route: "likes.get", request, startedAt, status: 400, error: "missing_image_id" });
    return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  }

  const record = await getImageLikes(imageId);
  const likes = Object.values(record?.likes ?? {}).sort(
    (a, b) => Date.parse(b.likedAt) - Date.parse(a.likedAt)
  );
  logApiRequest({
    route: "likes.get",
    request,
    startedAt,
    imageId,
    count: likes.length
  });

  return NextResponse.json(
    {
      imageId,
      count: record?.count ?? 0,
      viewerLiked: viewerId ? Boolean(record?.likes[viewerId]) : false,
      likes
    },
    {
      headers: corsHeaders()
    }
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const limited = await rateLimit(request, {
    namespace: "likes:post",
    limit: 30,
    windowSeconds: 60
  });

  if (limited) {
    logApiRequest({ route: "likes.post", request, startedAt, status: 429, error: "rate_limited" });
    return limited;
  }

  const body = await request.json().catch(() => undefined) as LikeBody | undefined;

  const imageId = validImageId(body?.imageId) ? body.imageId : undefined;
  const ownerFid = typeof body?.ownerFid === "number" && Number.isInteger(body.ownerFid)
    ? body.ownerFid
    : undefined;
  const imageUrl = validImageUrl(body?.imageUrl) ? body.imageUrl : undefined;
  const action = body?.action;

  if (!imageId || !ownerFid || !imageUrl) {
    logApiRequest({ route: "likes.post", request, startedAt, status: 400, imageId, error: "missing_fields" });
    return NextResponse.json({ error: "imageId, ownerFid, and imageUrl are required" }, { status: 400 });
  }

  if (action !== "like" && action !== "unlike") {
    logApiRequest({ route: "likes.post", request, startedAt, status: 400, imageId, fid: ownerFid, error: "invalid_action" });
    return NextResponse.json({ error: "action must be like or unlike" }, { status: 400 });
  }

  const bodyUser = body?.user;
  const userFid = typeof bodyUser?.fid === "number" && Number.isInteger(bodyUser.fid)
    ? bodyUser.fid
    : undefined;
  const userAddress = typeof bodyUser?.address === "string" && bodyUser.address.length > 0
    ? bodyUser.address.toLowerCase()
    : undefined;

  if (!userFid && !userAddress) {
    logApiRequest({ route: "likes.post", request, startedAt, status: 401, imageId, fid: ownerFid, error: "viewer_not_identified" });
    return NextResponse.json({ error: "connect a wallet or sign in with Farcaster to like" }, { status: 401 });
  }

  const user = {
    id: userFid ? `fid:${userFid}` : `addr:${userAddress}`,
    fid: userFid,
    address: userAddress,
    username: bodyUser?.username,
    displayName: bodyUser?.displayName,
    pfpUrl: bodyUser?.pfpUrl
  };

  let record;
  let alreadyLiked;

  try {
    if (userFid) {
      await registerMiniAppUser({
        fid: userFid,
        username: user.username,
        displayName: user.displayName,
        pfpUrl: user.pfpUrl,
        notificationDetails: validNotificationDetails(body?.notificationDetails)
          ? body.notificationDetails
          : undefined
      });
    }

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
    logApiRequest({
      route: "likes.post",
      request,
      startedAt,
      status: 503,
      imageId,
      fid: ownerFid,
      error: error instanceof Error ? error.message : "likes_storage_not_writable"
    });
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
      imageId,
      targetUrl: new URL(`/fid/${ownerFid}`, request.url).toString()
    });
  }

  logApiRequest({
    route: "likes.post",
    request,
    startedAt,
    imageId,
    fid: ownerFid,
    count: record.count
  });

  return NextResponse.json({
    imageId,
    count: record.count,
    viewerLiked: Boolean(record.likes[user.id]),
    likes: Object.values(record.likes).sort((a, b) => Date.parse(b.likedAt) - Date.parse(a.likedAt)),
    notification
  });
}

function validImageId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]+\/[A-Za-z0-9T._-]{10,120}$/.test(value);
}

function validImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
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
