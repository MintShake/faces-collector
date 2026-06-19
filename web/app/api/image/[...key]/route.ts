import {
  GetObjectCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { logApiRequest } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    key?: string[];
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const startedAt = Date.now();
  const limited = await rateLimit(request, {
    namespace: "image:proxy",
    limit: 300,
    windowSeconds: 60
  });

  if (limited) {
    return limited;
  }

  const { key: keyParts = [] } = await context.params;
  const key = keyParts.join("/");

  if (!isAllowedImageKey(key)) {
    logApiRequest({ route: "image.proxy", request, startedAt, status: 404, imageKey: key, error: "invalid_key" });
    return new Response("Not found", { status: 404 });
  }

  const storage = s3Config();

  if (!storage) {
    logApiRequest({ route: "image.proxy", request, startedAt, status: 503, imageKey: key, error: "storage_not_configured" });
    return new Response("Image storage is not configured", { status: 503 });
  }

  try {
    const object = await storage.client.send(
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: key
      })
    );
    const body = object.Body?.transformToWebStream();

    if (!body) {
      logApiRequest({ route: "image.proxy", request, startedAt, status: 404, imageKey: key, error: "empty_body" });
      return new Response("Not found", { status: 404 });
    }

    logApiRequest({
      route: "image.proxy",
      request,
      startedAt,
      imageKey: key,
      count: object.ContentLength
    });

    return new Response(body, {
      headers: {
        "content-type": object.ContentType ?? "image/webp",
        ...(object.ContentLength ? { "content-length": String(object.ContentLength) } : {}),
        "cache-control": "public, max-age=31536000, immutable",
        "cdn-cache-control": "public, s-maxage=31536000, immutable",
        "vercel-cdn-cache-control": "public, s-maxage=31536000, immutable",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    if (isMissingObject(error)) {
      logApiRequest({ route: "image.proxy", request, startedAt, status: 404, imageKey: key, error: "missing_object" });
      return new Response("Not found", { status: 404 });
    }

    console.warn(`Could not proxy image ${key}: ${errorMessage(error)}`);
    logApiRequest({
      route: "image.proxy",
      request,
      startedAt,
      status: 502,
      imageKey: key,
      error: errorMessage(error)
    });
    return new Response("Image unavailable", { status: 502 });
  }
}

function isAllowedImageKey(key: string) {
  return (
    /^pfps\/\d+\/[A-Za-z0-9T._-]+\.medium\.webp$/.test(key) ||
    /^pfps\/\d+\/[A-Za-z0-9T._-]+\.thumb\.webp$/.test(key)
  );
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

function isMissingObject(error: unknown) {
  const name = errorName(error);
  const message = errorMessage(error);

  return name === "NoSuchKey" || message.includes("NoSuchKey") || message.includes("404");
}

function errorName(error: unknown) {
  return typeof error === "object" && error && "name" in error
    ? String(error.name)
    : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
