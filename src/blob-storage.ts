import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { get, put } from "@vercel/blob";

export type BlobUpload = {
  pathname: string;
  url: string;
};

export type BlobPfpUploadSet = {
  thumb?: BlobUpload;
  medium?: BlobUpload;
  original?: BlobUpload;
};

export async function uploadPfpToBlob(input: {
  pathname: string;
  body: Buffer;
  contentType: string;
}): Promise<BlobUpload | undefined> {
  const s3 = s3Config();

  if (s3) {
    await s3.client.send(
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: input.pathname,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: "public, max-age=31536000, immutable"
      })
    );

    return {
      pathname: input.pathname,
      url: publicObjectUrl(s3, input.pathname)
    };
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return undefined;
  }

  const blob = await put(input.pathname, input.body, {
    access: "public",
    allowOverwrite: true,
    contentType: input.contentType
  });

  return {
    pathname: blob.pathname,
    url: blob.url
  };
}

export async function putJsonToBlob(pathname: string, value: unknown) {
  return uploadPfpToBlob({
    pathname,
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: "application/json"
  });
}

export async function getJsonFromBlob<T>(pathname: string): Promise<T | undefined> {
  const s3 = s3Config();

  if (s3) {
    try {
      const result = await s3.client.send(
        new GetObjectCommand({
          Bucket: s3.bucket,
          Key: pathname
        })
      );
      const text = await result.Body?.transformToString();
      return text ? (JSON.parse(text) as T) : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown S3 read error";
      const name = error instanceof Error ? error.name : "";

      if (name === "NoSuchKey" || message.includes("NoSuchKey") || message.includes("404")) {
        return undefined;
      }

      console.warn(`Could not read S3 JSON ${pathname}: ${message}`);
      return undefined;
    }
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return undefined;
  }

  let result;

  try {
    result = await get(pathname, {
      access: "public",
      useCache: false
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Blob read error";

    if (message.includes("404") || message.includes("not found")) {
      return undefined;
    }

    console.warn(`Could not read Blob JSON ${pathname}: ${message}`);
    return undefined;
  }

  if (!result || result.statusCode !== 200) {
    return undefined;
  }

  const text = await new Response(result.stream).text();
  return JSON.parse(text) as T;
}

let cachedS3Client: S3Client | undefined;

function s3Config() {
  const bucket = process.env.B2_BUCKET ?? process.env.S3_BUCKET;
  const endpoint = process.env.B2_ENDPOINT ?? process.env.S3_ENDPOINT;
  const region = process.env.B2_REGION ?? process.env.S3_REGION ?? "us-west-004";
  const accessKeyId = process.env.B2_KEY_ID ?? process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.B2_APPLICATION_KEY ?? process.env.S3_SECRET_ACCESS_KEY;

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
    endpoint,
    publicBaseUrl: process.env.B2_PUBLIC_BASE_URL ?? process.env.S3_PUBLIC_BASE_URL,
    client: cachedS3Client
  };
}

function publicObjectUrl(
  storage: { bucket: string; endpoint: string; publicBaseUrl?: string },
  pathname: string
) {
  if (storage.publicBaseUrl) {
    return `${storage.publicBaseUrl.replace(/\/$/, "")}/${pathname}`;
  }

  return `${storage.endpoint.replace(/\/$/, "")}/${storage.bucket}/${pathname}`;
}
