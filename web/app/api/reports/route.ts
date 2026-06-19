import {
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

type ReportBody = {
  fid?: number;
  imageId?: string;
  reporterFid?: number;
  reason?: string;
};

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

  const storage = s3Config();

  if (!storage) {
    return NextResponse.json({ error: "report storage is not configured" }, { status: 503 });
  }

  const now = new Date().toISOString();
  const report = {
    fid,
    imageId: sanitizeText(body?.imageId, 180),
    reporterFid: Number.isInteger(body?.reporterFid) ? body?.reporterFid : undefined,
    reason: sanitizeText(body?.reason, 80) ?? "user_reported",
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

  return NextResponse.json({ ok: true });
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
    ? value.slice(0, maxLength)
    : undefined;
}
