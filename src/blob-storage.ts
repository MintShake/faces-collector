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
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return undefined;
  }

  const result = await get(pathname, {
    access: "public",
    useCache: false
  });

  if (!result || result.statusCode !== 200) {
    return undefined;
  }

  const text = await new Response(result.stream).text();
  return JSON.parse(text) as T;
}
