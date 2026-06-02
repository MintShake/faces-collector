# Faces Frontend Integration Prompt

You are working on a frontend-only Farcaster Mini App called **Faces** / **Farfaces**.

The collector and database already exist. Do not build a collector. Do not create a new database. Your job is to fetch and display the existing Faces data.

## Existing System

Collector:

```txt
https://faces-collector.onrender.com
```

Primary Faces frontend/API:

```txt
https://web-legoblocksapps.vercel.app
```

Current target app:

```txt
https://farfaces.vercel.app
```

Faces stores Farcaster PFP history. Each FID has one or more saved PFP images and optional profile metadata.

## Choose One Data Strategy

Use **Strategy A** unless the owner explicitly wants this app to read Tigris directly.

### Strategy A: Fetch From Existing Faces API

This is the preferred path. It does not require Tigris private keys in this frontend app.

Use these endpoints:

```txt
GET https://web-legoblocksapps.vercel.app/api/faces/stats
GET https://web-legoblocksapps.vercel.app/api/faces?limit=240&offset=0&imagesPerFid=5&sort=count&order=desc
GET https://web-legoblocksapps.vercel.app/api/faces/recent?limit=50
GET https://web-legoblocksapps.vercel.app/api/faces/{fid}
GET https://web-legoblocksapps.vercel.app/api/faces/{fid}/images
GET https://web-legoblocksapps.vercel.app/api/faces/{fid}/profile
GET https://web-legoblocksapps.vercel.app/api/likes?imageId={imageId}&viewerFid={viewerFid}
```

For paging Home/Browse:

```txt
/api/faces?limit=240&offset=0&imagesPerFid=5
/api/faces?limit=240&offset=240&imagesPerFid=5
/api/faces?limit=240&offset=480&imagesPerFid=5
```

Important:

- `count` is only the current page count.
- `totalFids` is the real full FID total.
- `totalImages` is the real full PFP total.
- Do not stop at 240. Use `offset` and Load More / infinite paging.

Example list response:

```ts
type FacesListResponse = {
  ok: true;
  count: number;
  totalFids: number;
  totalImages: number;
  data: FidTimeline[];
};
```

### Strategy B: Read Tigris Directly Server-Side

Only use this if the owner gives this frontend app private Tigris env vars.

Required server-side Vercel env vars:

```env
TIGRIS_BUCKET=faces
TIGRIS_ENDPOINT=https://t3.storage.dev
TIGRIS_REGION=auto
TIGRIS_ACCESS_KEY_ID=
TIGRIS_SECRET_ACCESS_KEY=
TIGRIS_PUBLIC_BASE_URL=https://faces.t3.tigrisfiles.io
```

Tigris layout:

```txt
PFP images:
pfps/{fid}/{timestamp}-{hash}.medium.webp

Profile JSON:
state/fids/{fid}.json

Likes/social:
social/likes-summary.json
social/likes/{imageId}.json
social/users/{fid}.json
```

Direct Tigris rules:

- Tigris credentials must be server-only.
- Never expose `TIGRIS_ACCESS_KEY_ID` or `TIGRIS_SECRET_ACCESS_KEY` in client bundles.
- Home/Browse need object listing credentials to discover all FIDs.
- Direct per-FID reads may work publicly, but listing all FIDs usually requires private list credentials.

## Data Types

```ts
type FidTimeline = {
  fid: number;
  imageCount: number;
  images: PfpImage[];
  profile?: FidProfile;
};

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

## What To Build

Homepage:

- show total FIDs and total PFPs from stats
- show recent PFP changes
- detect current Mini App user with `sdk.context.user`
- if the user has a timeline, show it first
- refresh every 10-30 seconds while visible

Browse:

- show all collected FIDs, not only the first 240
- use paging with `limit` and `offset`
- show stacked thumbnails for each FID
- show real `imageCount`
- support search by FID
- support sort by count, newest, oldest, likes, FID
- keep list payload light with `imagesPerFid=3` or `5`

FID detail:

- route `/fid/{fid}`
- fetch full timeline with `/api/faces/{fid}` if using Strategy A
- show all saved PFPs for that FID
- show profile metadata if available
- show saved date for each PFP
- refresh every 10-30 seconds while visible

## Likes

Each PFP can be liked/unliked.

Fetch likes:

```txt
GET https://web-legoblocksapps.vercel.app/api/likes?imageId={imageId}&viewerFid={viewerFid}
```

`imageId` format:

```txt
{fid}/{timestamp}-{hash}
```

Example:

```txt
389456/2026-05-29T11-43-48-628Z-b787df7d457a816f
```

Like/unlike:

```txt
POST /api/likes
```

Body:

```ts
{
  imageId: string;
  ownerFid: number;
  imageUrl: string;
  action: "like" | "unlike";
  user: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
  notificationDetails?: {
    url: string;
    token: string;
  };
}
```

Use the current Mini App viewer from:

```ts
const context = await sdk.context;
const user = context.user;
```

Optimistically update like/unlike UI, then reconcile with the API response.

## Mini App Env Vars

These go in the **Vercel project for the target app**.

Where:

```txt
Vercel Dashboard
→ Project
→ Settings
→ Environment Variables
→ Add each variable
→ Select Production
→ Save
→ Redeploy
```

Required for the Farfaces deployment:

```env
NEXT_PUBLIC_APP_URL=https://farfaces.vercel.app
FARCASTER_ACCOUNT_ASSOCIATION_HEADER=
FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD=
FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE=
```

The account association must be generated for exactly:

```txt
farfaces.vercel.app
```

Do not reuse account association values from another Vercel domain.

If using Strategy A, also set:

```env
NEXT_PUBLIC_FACES_API_BASE_URL=https://web-legoblocksapps.vercel.app
```

If using Strategy B, also set the Tigris vars:

```env
TIGRIS_BUCKET=faces
TIGRIS_ENDPOINT=https://t3.storage.dev
TIGRIS_REGION=auto
TIGRIS_ACCESS_KEY_ID=
TIGRIS_SECRET_ACCESS_KEY=
TIGRIS_PUBLIC_BASE_URL=https://faces.t3.tigrisfiles.io
```

Optional:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
COLLECTOR_URL=https://faces-collector.onrender.com
```

Do not ask for these unless doing collector/backend work:

```env
NEYNAR_API_KEY
HUB_RPC_ENDPOINT
KAFKA_*
Render credentials
GitHub credentials
```

## Domain And Phishing Warning Rules

Previously, raw storage/custom domains triggered phishing/security warnings.

Rules:

- Use `NEXT_PUBLIC_APP_URL` for all public Mini App URLs.
- Manifest icons, splash, cover, OG image, home URL, and share URLs must use `https://farfaces.vercel.app`.
- Do not put `t3.storage.dev` in HTML, embeds, OG tags, or cast URLs.
- Do not put `faces.t3.tigrisfiles.io` in HTML, embeds, OG tags, or cast URLs.
- PFP images should be proxied through an app/API URL, not displayed as raw Tigris URLs.
- If using Strategy A, the returned image URLs from the Faces API are already proxied.

Verify:

```txt
/.well-known/farcaster.json
```

contains:

- account association for `farfaces.vercel.app`
- `homeUrl` on `https://farfaces.vercel.app`
- icon/splash/cover images on `https://farfaces.vercel.app`

## Current Known Failure

The previous diagnostic showed:

```txt
/api/profiles returns {"items":[],"status":"unavailable"}
```

Cause:

```txt
The app can read known individual FIDs, but cannot discover/list all FIDs.
There are no private Tigris list credentials in the runtime env, and public fallback index files 404.
```

Fix:

- either replace `/api/profiles` with Strategy A calls to the public Faces API
- or add the private Tigris list credentials in Vercel Production env and list Tigris server-side

Recommended:

```txt
Use Strategy A.
```

## Verification

Run:

```bash
npm install
npm run lint
npm run build
```

Then verify:

```txt
/ loads
/browse shows thousands of FIDs, not 0 and not only 240
/fid/389456 loads
images render
likes fetch
like/unlike works in Mini App context
/.well-known/farcaster.json is valid
no raw Tigris URLs appear in rendered HTML
```

Report back:

- which strategy you used: public Faces API or direct Tigris
- whether Home/Browse show `totalFids`
- whether Load More / paging works
- whether FID detail works
- whether likes work
- whether manifest/account association is valid
- which env vars are still missing, if any
