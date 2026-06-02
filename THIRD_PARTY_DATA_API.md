# Faces Public Data API

Use the public Vercel app API. Do not use Tigris credentials in third-party apps.

Base URL:

```txt
https://web-legoblocksapps.vercel.app
```

List timelines:

```txt
GET /api/faces?limit=100&imagesPerFid=5
```

Get one FID timeline:

```txt
GET /api/faces/{fid}
```

Example:

```ts
const res = await fetch("https://web-legoblocksapps.vercel.app/api/faces?limit=100&imagesPerFid=5");
const faces = await res.json();
```

Response shape:

```ts
type FacesListResponse = {
  ok: true;
  count: number;
  totalImages: number;
  data: Array<{
    fid: number;
    imageCount: number;
    images: Array<{
      id: string;
      filename: string;
      url: string;
      thumbUrl?: string;
      mediumUrl?: string;
      size: number;
      storedAt: string;
      likeCount: number;
    }>;
    profile?: {
      fid: number;
      username?: string;
      displayName?: string;
      bio?: string;
      profileUrl?: string;
      pfpUrl?: string;
      firstSeenAt?: string;
      lastSeenAt?: string;
      updatedAt?: string;
    };
  }>;
};
```

The image URLs are already proxied through the Faces Vercel app, so third-party apps can render them directly.
