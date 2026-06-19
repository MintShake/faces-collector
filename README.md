# Farcaster Unique FID Kafka Logger

Small TypeScript service that accepts Farcaster interaction webhooks and writes them to Kafka.

- `farcaster.interactions`: append-only interaction events, keyed by FID.
- `farcaster.unique-fids`: compacted topic, keyed by FID, so Kafka keeps the latest record per unique FID after compaction.
- `farcaster.pfp-history`: append-only profile image changes, keyed by FID.
- `farcaster.current-pfps`: compacted topic with the latest known PFP per FID.

## Run locally

```bash
npm install
cp .env.example .env
docker compose up -d kafka
npm run topics
npm run db:seed
npm run dev
```

Send a test interaction:

```bash
curl -X POST http://localhost:3000/farcaster/interactions \
  -H 'content-type: application/json' \
  -d '{"type":"cast.created","data":{"author":{"fid":12345,"pfp_url":"https://example.com/avatar.png"}}}'
```

The handler searches common Farcaster/Neynar-style payload fields such as `fid`, `caster_fid`, `author_fid`, and nested `author.fid`. It also looks for profile image fields including `pfp_url`, `pfpUrl`, `avatar_url`, `image_url`, and `profile_image_url`.

You can also send profile snapshots directly:

```bash
curl -X POST http://localhost:3000/farcaster/profiles \
  -H 'content-type: application/json' \
  -d '{"fid":12345,"pfp_url":"https://example.com/avatar.png"}'
```

When a PFP URL is present, the service downloads the image, hashes the bytes with SHA-256, and stores a new file under `data/pfps/<fid>/` only if the hash differs from the latest stored image for that FID. Each new image writes an event to `farcaster.pfp-history` and updates `farcaster.current-pfps`.

The service also keeps local state in SQLite at `data/faces.sqlite`. Before downloading a PFP, it checks whether that FID already has the same PFP URL and hash. If it does, the download is skipped and only the FID's last-seen timestamp is updated.

If cloud object storage is configured, every newly saved PFP is resized before upload. The collector stores a single compressed 256px WebP under `pfps/<fid>/` and does not upload originals unless `BLOB_UPLOAD_ORIGINALS=true`.

Tigris is the preferred hosted object storage path:

```bash
TIGRIS_BUCKET=your-bucket
TIGRIS_ENDPOINT=https://t3.storage.dev
TIGRIS_REGION=auto
TIGRIS_ACCESS_KEY_ID=tid_...
TIGRIS_SECRET_ACCESS_KEY=tsec_...
TIGRIS_PUBLIC_BASE_URL=
```

The same values need to exist in both Render for the collector and Vercel for the web app. The web app serves public profile images through `/api/image/pfps/...` by default so browsers do not talk directly to the storage host. If you add a trusted CDN/custom image domain, put it in `IMAGE_PROXY_BASE_URL`; only set `IMAGE_PROXY_DISABLED=true` if you intentionally want browsers to load directly from `TIGRIS_PUBLIC_BASE_URL` or the raw storage endpoint. B2 and generic S3-compatible variables are still supported as fallbacks.

Kafka is optional. Set `KAFKA_ENABLED=true` to emit Kafka events; leave it false for the lightweight hosted collector path that only uses SQLite and Vercel Blob.

For hosted collectors, set a shared secret so only your monitor can write profile snapshots:

```bash
COLLECTOR_SHARED_SECRET=generate-a-long-random-value
```

When this is set, `/farcaster/interactions`, `/farcaster/profiles`, and `/internal/monitor-status` require `x-collector-secret` or `Authorization: Bearer ...`. The bundled monitors send the header automatically. The collector also rate-limits write endpoints and rejects PFP downloads that resolve to private network addresses or exceed `MAX_PFP_DOWNLOAD_BYTES`.

Hosted collectors should keep `COLLECTOR_PUBLIC_API=false`. That disables the old public gallery endpoints (`/api/pfps`, `/pfps/*`, and the static frontend) so Render only handles health checks plus authenticated ingest traffic. The web app reads images from Tigris/S3 instead of using the collector as an image server. Set `COLLECTOR_PUBLIC_API=true` only for local debugging of the legacy static gallery.

The web API has per-IP rate limiting. If `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured, limits are shared across serverless instances; otherwise local in-memory limits are used.

## Monitor Active Farcaster Users

Add a Neynar API key to `.env`:

```bash
NEYNAR_API_KEY=your_api_key_here
```

Then run the monitor in a second terminal:

```bash
npm run monitor:hub
```

The Hub monitor subscribes to live Farcaster `MERGE_MESSAGE` events. For profile update events, it uses the PFP URL directly. For other activity like casts, reactions, links, and follows, it extracts the actor FID, fetches that user's current profile data from the Hub, and posts the snapshot into `/farcaster/profiles`.

To avoid hammering the Hub and image hosts, each active FID is profile-fetched at most once per `HUB_PROFILE_REFRESH_INTERVAL_MS` unless the event itself is a profile update. The default is one hour:

```bash
HUB_PROFILE_REFRESH_INTERVAL_MS=3600000
```

The older feed poller is still available if you want it as a fallback:

```bash
npm run monitor:neynar
```

## Frontend

The Next.js gallery app lives in `web/`.

```bash
npm run web:dev
```

Open `http://localhost:3001` to see FID tiles ordered by most logged PFPs to least. Each tile shows stacked thumbnails and a count; clicking a tile opens that FID's full PFP history.

For Vercel, set the project root to `web`. In production the app lists PFP history from the same Tigris/S3 bucket used by the collector.

To print unique FIDs as they appear in Kafka:

```bash
npm run log:fids
```

## Notes

The unique-FID and current-PFP topics use Kafka log compaction. That means duplicate FID keys may appear until Kafka compacts the log, but the retained state of those topics is one latest record per FID. The full PFP history is kept in `farcaster.pfp-history` and in the image files under `data/pfps`.
