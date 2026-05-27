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
