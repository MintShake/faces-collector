# AI Builder Prompt: Check And Repair Faces Frontend

You are checking and repairing an existing frontend-only Farcaster Mini App called **Faces**.

Do not rebuild the backend collector. Do not build a new storage system. Do not expose secrets client-side.

## What Faces Does

Faces shows Farcaster users their saved PFP history.

The backend collector already watches Farcaster activity and stores changed PFPs/profile metadata in Tigris object storage. The frontend only needs to read that data, render it well, and work as a Farcaster Mini App.

The frontend should behave like a realtime display of the existing collected data: as the collector stores new FIDs and PFPs, the UI should refresh and show them without users needing to manually reload.

Existing collector:

```txt
https://faces-collector.onrender.com
```

## Your Job

Inspect the frontend, run a full build, fix anything broken, and verify that:

- the app builds successfully on Vercel
- the homepage loads quickly
- the browse page loads quickly
- the homepage and browse page refresh live as newly collected FIDs/PFPs appear
- FID detail pages load full timelines
- FID detail pages refresh live when that FID gets a new PFP
- images render correctly through the Vercel image proxy
- the app reads Tigris server-side
- Tigris credentials are never exposed in client code
- likes can be fetched, submitted, displayed, and sorted
- the Mini App manifest is valid
- the Mini App calls `sdk.actions.ready()` quickly
- sharing uses `sdk.actions.composeCast()`
- adding the app uses `sdk.actions.addMiniApp()`

## Required Stack

Use:

```txt
Next.js App Router
React
@farcaster/miniapp-sdk
@aws-sdk/client-s3
Vercel
Tigris object storage
```

Do not require Neynar in the frontend.

The collector and database already exist. The frontend should hook up to them by fetching server-side from Tigris and posting likes through the existing likes API. Do not create a duplicate collector, duplicate DB, or separate indexing service unless explicitly required to fix frontend reads.

## Required Env Vars

These are required in Vercel. The user will provide private values.

```env
NEXT_PUBLIC_APP_URL=
TIGRIS_BUCKET=faces
TIGRIS_ENDPOINT=https://t3.storage.dev
TIGRIS_REGION=auto
TIGRIS_ACCESS_KEY_ID=
TIGRIS_SECRET_ACCESS_KEY=
TIGRIS_PUBLIC_BASE_URL=https://faces.t3.tigrisfiles.io
FARCASTER_ACCOUNT_ASSOCIATION_HEADER=
FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD=
FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE=
```

Important:

- `NEXT_PUBLIC_APP_URL` must be the exact deployed frontend origin, for example `https://your-app.vercel.app`
- the Farcaster account association must be generated for that exact same domain
- if the frontend is redeployed to a different Vercel URL, regenerate `FARCASTER_ACCOUNT_ASSOCIATION_HEADER`, `FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD`, and `FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE`
- do not reuse account association data from another domain
- all public Mini App, Open Graph, share, and PFP proxy URLs should be based on `NEXT_PUBLIC_APP_URL`

## Ask The Owner For These Env Vars

Before deploying, ask the owner for these exact values privately:

```env
NEXT_PUBLIC_APP_URL=
TIGRIS_BUCKET=
TIGRIS_ENDPOINT=
TIGRIS_REGION=
TIGRIS_ACCESS_KEY_ID=
TIGRIS_SECRET_ACCESS_KEY=
TIGRIS_PUBLIC_BASE_URL=
FARCASTER_ACCOUNT_ASSOCIATION_HEADER=
FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD=
FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE=
```

If likes, users, or notification state should use Redis instead of Tigris JSON, also ask for:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

You may ask for this if the frontend needs to display collector status:

```env
COLLECTOR_URL=https://faces-collector.onrender.com
```

Do not ask the owner for these unless the task changes to backend collector work:

```env
NEYNAR_API_KEY=
HUB_RPC_ENDPOINT=
KAFKA_BROKERS=
KAFKA_*
Render credentials
GitHub credentials
```

Optional:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
COLLECTOR_URL=https://faces-collector.onrender.com
```

Do not ask for or require:

```env
NEYNAR_API_KEY
HUB_RPC_ENDPOINT
KAFKA_*
Render credentials
GitHub credentials
```

## Storage Layout

Read PFP images from Tigris:

```txt
pfps/{fid}/{timestamp}-{hash}.medium.webp
```

Example:

```txt
pfps/389456/2026-05-29T11-43-48-628Z-b787df7d457a816f.medium.webp
```

Read profile metadata from:

```txt
state/fids/{fid}.json
```

Profile JSON may include:

```json
{
  "fid": 389456,
  "username": "example",
  "displayName": "Example",
  "bio": "Profile bio",
  "profileUrl": "https://example.com",
  "pfpUrl": "https://...",
  "firstSeenAt": "2026-05-28T12:00:00.000Z",
  "lastSeenAt": "2026-06-02T12:00:00.000Z",
  "lastProfileFetchedAt": "2026-06-02T12:00:00.000Z",
  "updatedAt": "2026-06-02T12:00:00.000Z"
}
```

Likes/social data may be stored in:

```txt
social/likes-summary.json
social/likes/{imageId}.json
social/users/{fid}.json
```

## Likes And Social Data

The database already stores likes. The frontend must support reading and writing them.

Each PFP can be liked and unliked by the current Mini App viewer. The UI must fetch the current like state and post changes back to the existing API.

Existing API route to verify or implement:

```txt
GET /api/likes?imageId={imageId}&viewerFid={viewerFid}
POST /api/likes
```

The image ID is:

```txt
{fid}/{timestamp}-{hash}
```

Example image ID:

```txt
389456/2026-05-29T11-43-48-628Z-b787df7d457a816f
```

GET response should include:

```ts
{
  imageId: string;
  count: number;
  viewerLiked: boolean;
  likes: Array<{
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
    likedAt: string;
  }>;
}
```

POST body:

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

POST response should include:

```ts
{
  imageId: string;
  count: number;
  viewerLiked: boolean;
  likes: Array<{
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
    likedAt: string;
  }>;
  notification?: {
    sent: boolean;
    reason?: string;
  };
}
```

Frontend behavior:

- show like count on PFP cards and timeline images
- show whether the current viewer liked an image
- allow like/unlike from inside the Mini App
- immediately update the UI optimistically, then reconcile with the API response
- use the current viewer from `sdk.context.user`
- include `context.client.notificationDetails` when available
- register the Mini App user when they like or add the app
- sort/browse by likes using stored `likeCount`
- show a list of who liked an image when useful
- do not require login outside Farcaster; outside Mini App, likes may be disabled or prompt user to open in Farcaster

Notification behavior:

- if the PFP owner has added the Mini App and allowed notifications, send a notification when someone likes their PFP
- do not fail the like if notification sending fails
- do not notify users about their own likes

## Pages To Verify

Homepage:

- detects the Farcaster Mini App viewer using `sdk.context`
- shows the viewer's own timeline first if present
- shows recent PFP changes
- refreshes recent PFP changes automatically
- shows community/liked highlights if available
- has browse, share, and add-app actions
- calls `sdk.actions.ready()` without waiting on slow storage writes

Browse page:

- displays all collected FIDs, not a hardcoded/trending subset
- shows FID tiles in a responsive grid
- each tile has stacked overlapping thumbnails
- shows the real total PFP count for the FID
- supports search by FID
- supports sorting by count, newest, oldest, likes, and FID
- keeps payload light by only loading a few images per FID
- refreshes automatically so new collector writes appear

FID detail page:

- route: `/fid/{fid}`
- loads full PFP timeline for one FID
- refreshes automatically so newly collected PFP changes appear
- shows profile metadata if available
- shows saved date for each PFP
- has share and like/unlike actions
- shows who liked each PFP when available
- does not crash if profile metadata is missing

## Realtime Display Requirement

The collector already writes new data into Tigris. The frontend should show new data close to realtime.

Implement one of these:

- client-side polling with `router.refresh()` every 10-30 seconds while the tab is visible
- SWR/React Query polling for API data every 10-30 seconds
- server route revalidation plus client polling

Requirements:

- do not poll aggressively while the tab is hidden
- show a small live indicator such as "Live" and the last refresh time
- keep payloads small on list pages
- detail pages may refresh the full timeline for only that one FID
- never block the Mini App splash while waiting for a poll
- newly collected FIDs should appear on browse/home
- newly collected PFPs should appear in the FID detail timeline

## Image Proxy Requirement

Do not render raw Tigris URLs in the UI.

This is important because raw bucket/storage domains and some custom object-storage URLs previously triggered phishing/security warnings in clients. The user does not want to buy or depend on a custom domain just to serve images.

All user-facing images should appear to come from the app's Vercel domain through the image proxy.

Create or verify:

```txt
/api/image/[...key]
```

Only allow keys matching:

```txt
pfps/{fid}/{filename}.medium.webp
```

Fetch from Tigris server-side and return:

```http
Content-Type: image/webp
Cache-Control: public, max-age=31536000, immutable
X-Content-Type-Options: nosniff
```

The UI should render image URLs like:

```txt
{NEXT_PUBLIC_APP_URL}/api/image/pfps/{fid}/{filename}.medium.webp
```

The UI should not render image URLs like:

```txt
https://faces.t3.tigrisfiles.io/...
https://t3.storage.dev/...
```

## Domain And Phishing Warning Checks

There were previous issues with storage/custom domains being flagged by client security systems.

The fix is to keep every public-facing URL on the deployed frontend's Vercel domain from `NEXT_PUBLIC_APP_URL`.

Avoid:

- serving public UI images directly from raw Tigris URLs
- using unfamiliar object-storage hostnames in Farcaster embeds
- using a custom domain unless the user explicitly provides and verifies one
- embedding raw storage URLs in casts, Open Graph tags, Mini App metadata, or rendered image `src` values

Use:

- `NEXT_PUBLIC_APP_URL` for all public app links
- `${NEXT_PUBLIC_APP_URL}/miniapp/icon.png`
- `${NEXT_PUBLIC_APP_URL}/miniapp/splash.png`
- `${NEXT_PUBLIC_APP_URL}/miniapp/embed.png`
- Vercel image proxy URLs for PFPs

Verify:

- page HTML does not include `faces.t3.tigrisfiles.io`
- page HTML does not include `t3.storage.dev`
- Farcaster manifest image URLs are on `NEXT_PUBLIC_APP_URL`
- Open Graph image URLs are on `NEXT_PUBLIC_APP_URL`
- PFP image URLs are on `{NEXT_PUBLIC_APP_URL}/api/image/...`
- the account association payload domain matches `NEXT_PUBLIC_APP_URL`
- there are no mixed old Vercel domains in manifest, HTML, Open Graph tags, or share URLs

## Mini App Manifest

Serve:

```txt
/.well-known/farcaster.json
```

It must include:

- `accountAssociation` from env vars
- Mini App name: `Faces`
- home URL
- icon URL
- splash image URL
- embed image URL
- webhook URL if available
- social/identity category metadata

Important: never hardcode an account association for the wrong domain. Use the provided env vars.

The account association and `NEXT_PUBLIC_APP_URL` must match. If `NEXT_PUBLIC_APP_URL` is `https://new-faces-app.vercel.app`, the account association must be signed for `new-faces-app.vercel.app`.

## Build And Verification Checklist

Run:

```bash
npm install
npm run build
```

Then verify live or locally:

```txt
/                          loads
/browse                    loads
/fid/389456                loads if data exists
/.well-known/farcaster.json returns valid JSON
/api/image/pfps/...        returns image/webp
```

Check page payloads:

- homepage should not serialize every stored image
- browse should not serialize every stored image
- list pages should load only preview images per FID
- detail pages may load the full timeline for one FID

Check secrets:

- no `TIGRIS_SECRET_ACCESS_KEY` in client-side bundles
- no `TIGRIS_ACCESS_KEY_ID` in client-side bundles
- no storage keys in `NEXT_PUBLIC_*`

## Expected Frontend Behavior

The app should feel warm, modern, nostalgic, and mobile-first.

Core line:

```txt
Your PFP eras, remembered.
```

It should help users see how their Farcaster identity has changed over time and browse other public PFP timelines.

## Output Required

When finished, report:

- what was broken
- what you fixed
- build result
- live Vercel URL
- whether images load
- whether Mini App manifest validates
- whether any env vars are missing
- exactly which env vars you still need from the owner, if any
