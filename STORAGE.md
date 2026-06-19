# Storage — Tigris

## Free Tier

| Metric | Limit |
|--------|-------|
| Storage | 5 GB / mo |
| PUT / LIST requests | 10,000 / mo |
| GET requests | 100,000 / mo |
| Egress | Free |

## Current Usage — *2026-06-12*

| Metric | Used |
|--------|------|
| Storage | 224 MB / 5 GB (4%) |
| Objects | 69,378 (`pfps` 34k · `state` 34k · `social` 5) |
| LIST risk | ~70 requests per gallery cache miss (30s TTL) |
| PUT risk | enrichment backfill = 28,400 PUTs in one run |

## Beyond Free (pay-as-you-go)

| Metric | Rate |
|--------|------|
| Storage | $0.02 / GB / mo |
| PUT / LIST | $0.005 / 1,000 |
| GET | $0.0005 / 1,000 |

---

---

## Render — Collector (faces-collector)

**Plan:** Free · Docker · Oregon · 1 instance

| Metric | Free Tier | Current |
|--------|-----------|---------|
| Instance hours | 750 / mo | ~720–744 / mo (6 hr margin on 31-day month) |
| RAM | 512 MB | — |
| Spin-down | After 15 min no inbound traffic | Hub monitor heartbeat (30s) keeps it alive |
| Ephemeral disk | Yes — data lost on redeploy | All state in Tigris, safe |
| Bandwidth | Shared pool | Risky if public gallery is enabled — keep `COLLECTOR_PUBLIC_API=false` |

**Next tier — Starter $7/mo:** Always on · 512 MB RAM · no spin-down risk

---

## Vercel — Web / API (web)

**Plan:** Hobby (free) · Next.js · 7 projects on account

| Metric | Free (Hobby) | Current |
|--------|-------------|---------|
| Bandwidth (egress) | 100 GB / mo | Low — JSON API + image proxy |
| Function invocations | 1M / mo | — |
| Function duration (max) | 60s | `force-dynamic` routes |
| Build minutes | 6,000 / mo | — |
| Deployments / day | 100 | Low |
| Vercel Blob | 5 GB · suspended | 476 MB — old originals, unused |

**Next tier — Pro $20/mo:** 1 TB bandwidth · 300s function max · unlimited invocations

---

## GitHub — MintShake/faces-collector

**Plan:** Free · Public repo

| Metric | Free Limit | Current |
|--------|-----------|---------|
| Repo size | Soft 1 GB / hard 5 GB | 3.2 MB (28 commits) |
| File size | 100 MB max | Small source files only |
| Actions minutes | 2,000 / mo | Low — auto-deploy only |
| Packages storage | 500 MB | Unused |

**Next tier — Team $4/user/mo:** 3,000 Actions minutes · 2 GB packages

---

## Railway *(alternative to Render)*

| Plan | Price | RAM | Sleep | Notes |
|------|-------|-----|-------|-------|
| Free trial | $0 | 1 GB | No | One-time $5 credit · 30 days · limited network until verified |
| **Hobby** | **$5/mo** | **48 GB max** | **Never** | $5 included usage — small always-on service costs ~$0.20–0.50/mo in practice |
| Pro | $20/mo | 1 TB max | Never | $20 included usage |

**vs Render free:** Railway Hobby costs $5/mo but never sleeps and has no monthly hour cap — better fit for an always-on collector.

---

## Alternatives

| Provider | Free Storage | Free PUTs/LIST | Free GETs | Egress | Notes |
|----------|-------------|----------------|-----------|--------|-------|
| **Cloudflare R2** | 10 GB | 1M / mo | 10M / mo | Free | Best free tier for this workload |
| **Backblaze B2** | 10 GB | Free (2,500 calls/day) | Free | Free via Cloudflare CDN | Already wired in `.env` |
| **Tigris** *(current)* | 5 GB | 10,000 / mo | 100,000 / mo | Free | Lowest free request limits |
