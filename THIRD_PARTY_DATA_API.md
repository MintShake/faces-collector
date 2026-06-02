# Faces Third-Party Data API

Faces exposes a public read-only API for Next.js apps, Mini Apps, bots, and other clients.

Do not share Tigris, Neynar, Render, Vercel, or storage credentials with third-party apps. They only need this base URL:

```txt
https://web-legoblocksapps.vercel.app
```

All public image URLs returned by the API are already proxied through the Faces Vercel app and can be rendered directly.

## Endpoints

### List Timelines

```txt
GET /api/faces
```

Query params:

```txt
limit        1-500, default 100
offset       0+, default 0
imagesPerFid 1-20, default 5
sort         count | newest | oldest | fid | likes, default count
order        desc | asc, default desc
q            optional FID search text
minImages    minimum saved images per FID, default 1
```

Example:

```ts
const res = await fetch(
  "https://web-legoblocksapps.vercel.app/api/faces?limit=100&imagesPerFid=5&sort=newest"
);
const timelines = await res.json();
```

### Get One Timeline

```txt
GET /api/faces/{fid}
```

Returns the full saved timeline and profile data for one FID.

Example:

```ts
const res = await fetch("https://web-legoblocksapps.vercel.app/api/faces/389456");
const timeline = await res.json();
```

### Get One FID's Images

```txt
GET /api/faces/{fid}/images
```

Query params:

```txt
limit   1-500, default 100
offset  0+, default 0
```

Example:

```ts
const res = await fetch("https://web-legoblocksapps.vercel.app/api/faces/389456/images?limit=20");
const images = await res.json();
```

### Get One FID's Profile

```txt
GET /api/faces/{fid}/profile
```

Example:

```ts
const res = await fetch("https://web-legoblocksapps.vercel.app/api/faces/389456/profile");
const profile = await res.json();
```

### Recent PFP Changes

```txt
GET /api/faces/recent
```

Query params:

```txt
limit  1-200, default 50
```

Example:

```ts
const res = await fetch("https://web-legoblocksapps.vercel.app/api/faces/recent?limit=25");
const recent = await res.json();
```

### Stats

```txt
GET /api/faces/stats
```

Returns total FIDs, total images, total likes, newest saved image, top timeline, and most-liked image.

Example:

```ts
const res = await fetch("https://web-legoblocksapps.vercel.app/api/faces/stats");
const stats = await res.json();
```

### Likes For One Image

```txt
GET /api/likes?imageId={imageId}
```

Optional:

```txt
viewerFid  returns viewerLiked for that FID
```

Example:

```ts
const imageId = "389456/2026-05-29T11-43-48-628Z-b787df7d457a816f";
const res = await fetch(
  `https://web-legoblocksapps.vercel.app/api/likes?imageId=${encodeURIComponent(imageId)}`
);
const likes = await res.json();
```

## Response Shapes

Timeline list:

```ts
type FacesListResponse = {
  ok: true;
  meta: {
    limit: number;
    offset: number;
    imagesPerFid: number;
    sort: "count" | "newest" | "oldest" | "fid" | "likes";
    order: "asc" | "desc";
    q: string | null;
    minImages: number;
  };
  count: number;
  totalImages: number;
  data: FidTimeline[];
};
```

Single timeline:

```ts
type FidTimelineResponse = {
  ok: true;
  data: FidTimeline;
};
```

Timeline object:

```ts
type FidTimeline = {
  fid: number;
  imageCount: number;
  images: PfpImage[];
  profile?: FidProfile;
};
```

Image object:

```ts
type PfpImage = {
  id: string;
  filename: string;
  url: string;
  thumbUrl?: string;
  mediumUrl?: string;
  size: number;
  storedAt: string;
  likeCount: number;
};
```

Profile object:

```ts
type FidProfile = {
  fid: number;
  username?: string;
  displayName?: string;
  bio?: string;
  profileUrl?: string;
  pfpUrl?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastProfileFetchedAt?: string;
  updatedAt?: string;
};
```

## Next.js Example

```tsx
type FacesResponse = {
  ok: true;
  data: Array<{
    fid: number;
    imageCount: number;
    images: Array<{ id: string; url: string; storedAt: string; likeCount: number }>;
  }>;
};

export default async function Page() {
  const res = await fetch(
    "https://web-legoblocksapps.vercel.app/api/faces?limit=24&imagesPerFid=3&sort=newest",
    { next: { revalidate: 60 } }
  );
  const faces = (await res.json()) as FacesResponse;

  return (
    <main>
      {faces.data.map((timeline) => (
        <a key={timeline.fid} href={`https://web-legoblocksapps.vercel.app/fid/${timeline.fid}`}>
          <strong>FID {timeline.fid}</strong>
          <span>{timeline.imageCount} PFPs</span>
          {timeline.images[0] && <img src={timeline.images[0].url} alt="" width={96} height={96} />}
        </a>
      ))}
    </main>
  );
}
```

## What To Provide Third Parties

Give them:

```txt
API base URL:
https://web-legoblocksapps.vercel.app

Docs:
THIRD_PARTY_DATA_API.md
```

Do not give them:

```txt
TIGRIS_ACCESS_KEY_ID
TIGRIS_SECRET_ACCESS_KEY
NEYNAR_API_KEY
Render credentials
Vercel credentials
Farcaster account association secrets
```
