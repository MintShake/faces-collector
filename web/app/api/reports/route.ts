import {
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import {
  addPendingImageReport,
  getPendingReportMap,
  reviewPendingImageReport,
  type ReportReason
} from "@/lib/social";
import { rateLimit } from "@/lib/rate-limit";

type ReportBody = {
  fid?: number;
  imageId?: string;
  reporterFid?: number;
  reason?: string;
  note?: string;
  reporterContext?: string;
};

type ReviewBody = {
  imageId?: string;
  action?: "restore" | "keep_hidden";
};

const REPORT_REASONS = new Set<ReportReason>(["not_me", "offensive", "outdated", "other", "owner_remove"]);

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const images = Object.values(await getPendingReportMap())
    .sort((a, b) => Date.parse(b.lastReportedAt) - Date.parse(a.lastReportedAt));

  return NextResponse.json({ ok: true, count: images.length, data: images }, {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => undefined) as ReviewBody | undefined;
  const imageId = sanitizeText(body?.imageId, 180);

  if (!imageId || (body?.action !== "restore" && body?.action !== "keep_hidden")) {
    return NextResponse.json({ error: "imageId and action are required" }, { status: 400 });
  }

  const pending = await reviewPendingImageReport({ imageId, action: body.action });
  return NextResponse.json({ ok: true, pending: pending ?? null }, {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(request: Request) {
  const limited = await rateLimit(request, {
    namespace: "reports:post",
    limit: 10,
    windowSeconds: 60
  });

  if (limited) {
    return limited;
  }

  const body = await request.json().catch(() => undefined) as ReportBody | undefined;
  const fid = body?.fid;

  if (!Number.isInteger(fid) || !fid || fid <= 0) {
    return NextResponse.json({ error: "fid is required" }, { status: 400 });
  }

  const imageId = sanitizeText(body?.imageId, 180);
  const reason = sanitizeReason(body?.reason);
  const note = sanitizeText(body?.note, 500);

  if (!reason) {
    return NextResponse.json({ error: "report reason is required" }, { status: 400 });
  }

  if (!imageId) {
    return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  }

  if (reason === "other" && !note) {
    return NextResponse.json({ error: "please add a short note for other reports" }, { status: 400 });
  }

  const storage = s3Config();

  if (!storage) {
    return NextResponse.json({ error: "report storage is not configured" }, { status: 503 });
  }

  const now = new Date().toISOString();
  const report = {
    fid,
    imageId,
    reporterFid: Number.isInteger(body?.reporterFid) ? body?.reporterFid : undefined,
    reason,
    note,
    reporterContext: sanitizeText(body?.reporterContext, 80),
    createdAt: now
  };
  const key = `social/reports/${fid}/${now.replace(/[:.]/g, "-")}-${crypto.randomUUID()}.json`;

  await storage.client.send(
    new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      Body: JSON.stringify(report, null, 2),
      ContentType: "application/json",
      CacheControl: "no-store"
    })
  );

  const pending = await addPendingImageReport({ fid, imageId, reason, note });

  return NextResponse.json({ ok: true, hidden: true, pending });
}

let cachedS3Client: S3Client | undefined;

function s3Config() {
  const bucket =
    process.env.TIGRIS_BUCKET ??
    process.env.BUCKET_NAME ??
    process.env.B2_BUCKET ??
    process.env.S3_BUCKET;
  const endpoint =
    process.env.TIGRIS_ENDPOINT ??
    process.env.AWS_ENDPOINT_URL_S3 ??
    process.env.B2_ENDPOINT ??
    process.env.S3_ENDPOINT;
  const region =
    process.env.TIGRIS_REGION ??
    process.env.AWS_REGION ??
    process.env.B2_REGION ??
    process.env.S3_REGION ??
    "auto";
  const accessKeyId =
    process.env.TIGRIS_ACCESS_KEY_ID ??
    process.env.AWS_ACCESS_KEY_ID ??
    process.env.B2_KEY_ID ??
    process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.TIGRIS_SECRET_ACCESS_KEY ??
    process.env.AWS_SECRET_ACCESS_KEY ??
    process.env.B2_APPLICATION_KEY ??
    process.env.S3_SECRET_ACCESS_KEY;

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    return undefined;
  }

  const clientConfig: S3ClientConfig = {
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    },
    forcePathStyle: true
  };

  cachedS3Client ??= new S3Client(clientConfig);

  return {
    bucket,
    client: cachedS3Client
  };
}

function sanitizeText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length > 0
    ? value.trim().slice(0, maxLength) || undefined
    : undefined;
}

function sanitizeReason(value: unknown): ReportReason | undefined {
  const reason = sanitizeText(value, 80);

  if (!reason || !REPORT_REASONS.has(reason as ReportReason)) {
    return undefined;
  }

  return reason as ReportReason;
}

function isAdminRequest(request: Request) {
  const secret = process.env.ADMIN_SECRET ?? process.env.REPORTS_ADMIN_SECRET;

  if (!secret) {
    return false;
  }

  const auth = request.headers.get("authorization");
  const token = request.headers.get("x-admin-secret") ?? auth?.replace(/^Bearer\s+/i, "");
  return token === secret;
}
