# Faces Mini App Handoff

You are rebuilding only the **frontend Mini App** for Faces.

The backend collector is already built and running here:

```text
https://faces-collector.onrender.com
```

The collector already watches Farcaster activity and stores PFP history in Tigris. Please do **not** rebuild or replace the collector.

The Mini App frontend should:

- detect the current Farcaster user from Mini App SDK context
- show that user’s PFP timeline first
- let people browse other FID timelines
- show profile info, PFP history, likes, share, report, and local hide
- proxy images through the app domain, not raw Tigris URLs

Env vars needed by the frontend:

```env
NEXT_PUBLIC_APP_URL=
TIGRIS_BUCKET=faces
TIGRIS_ENDPOINT=https://t3.storage.dev
TIGRIS_REGION=auto
TIGRIS_ACCESS_KEY_ID=
TIGRIS_SECRET_ACCESS_KEY=
TIGRIS_PUBLIC_BASE_URL=https://faces.t3.tigrisfiles.io
```

Optional:

```env
COLLECTOR_URL=https://faces-collector.onrender.com
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

The Mini App builder can handle Farcaster account association.

The frontend does **not** need Neynar, Kafka, or Hub credentials.
