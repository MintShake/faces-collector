import Link from "next/link";

const API_BASE = "https://shakezzlab.xyz";
const TOKEN_ADDRESS = "0xa199Ab829b992FD357E40F1E91be724D7273aa82";

const endpoints = [
  {
    method: "GET",
    path: "/api/faces",
    desc: "Browse all tracked profiles",
    params: "limit, offset, sort, order, minImages, imagesPerFid, q",
    example: `${API_BASE}/api/faces?limit=24&sort=count&order=desc`
  },
  {
    method: "GET",
    path: "/api/faces/recent",
    desc: "Most recently changed profile pics",
    params: "limit",
    example: `${API_BASE}/api/faces/recent?limit=10`
  },
  {
    method: "GET",
    path: "/api/faces/stats",
    desc: "Platform-wide counts and highlights",
    params: "—",
    example: `${API_BASE}/api/faces/stats`
  },
  {
    method: "GET",
    path: "/api/faces/{fid}",
    desc: "Full profile + complete image timeline for one FID",
    params: "—",
    example: `${API_BASE}/api/faces/389456`
  },
  {
    method: "GET",
    path: "/api/faces/{fid}/images",
    desc: "Paginated image timeline for one FID",
    params: "limit, offset",
    example: `${API_BASE}/api/faces/389456/images?limit=50&offset=0`
  },
  {
    method: "GET",
    path: "/api/faces/{fid}/profile",
    desc: "Profile metadata for one FID (no images)",
    params: "—",
    example: `${API_BASE}/api/faces/389456/profile`
  }
];

export default function AboutPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="appMark">Faces</span>
          <h1>Build with Faces</h1>
          <p>Open API. Real data. Profile pic history for the social web.</p>
        </div>
        <Link className="backLink" href="/">Home</Link>
      </header>

      {/* Token */}
      <section className="aboutSection">
        <div className="aboutHeading">
          <span className="eyebrow">Token</span>
          <h2>Faces Token</h2>
          <p className="aboutLead">
            Faces has a token on Base. Hold it, earn it, use it — more utility coming.
          </p>
        </div>
        <div className="tokenCard">
          <div className="tokenMeta">
            <span className="tokenLabel">Contract address · Base</span>
            <code className="tokenAddress">{TOKEN_ADDRESS}</code>
          </div>
          <div className="tokenLinks">
            <a
              className="tokenLink"
              href={`https://basescan.org/token/${TOKEN_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
            >
              BaseScan
            </a>
            <a
              className="tokenLink"
              href={`https://dexscreener.com/base/${TOKEN_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
            >
              DexScreener
            </a>
            <a
              className="tokenLink primary"
              href={`https://app.uniswap.org/explore/tokens/base/${TOKEN_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
            >
              Trade on Uniswap
            </a>
          </div>
        </div>
      </section>

      {/* API */}
      <section className="aboutSection">
        <div className="aboutHeading">
          <span className="eyebrow">Open API</span>
          <h2>Faces Data API</h2>
          <p className="aboutLead">
            Free, public, CORS-enabled. No API key needed.
            Base URL: <code>{API_BASE}</code>
          </p>
        </div>

        <div className="endpointList">
          {endpoints.map((ep) => (
            <div key={ep.path} className="endpointCard">
              <div className="endpointHead">
                <span className="methodBadge">{ep.method}</span>
                <code className="endpointPath">{ep.path}</code>
              </div>
              <p className="endpointDesc">{ep.desc}</p>
              {ep.params !== "—" && (
                <p className="endpointParams">
                  <strong>Params:</strong> {ep.params}
                </p>
              )}
              <a
                className="endpointExample"
                href={ep.example}
                target="_blank"
                rel="noreferrer"
              >
                {ep.example}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Response shape */}
      <section className="aboutSection">
        <div className="aboutHeading">
          <span className="eyebrow">Response shape</span>
          <h2>What you get back</h2>
        </div>
        <div className="codeBlock">
          <pre>{`// GET /api/faces
{
  "ok": true,
  "count": 24,
  "totalFids": 28000,
  "totalImages": 91000,
  "data": [
    {
      "fid": 389456,
      "imageCount": 14,
      "images": [
        {
          "id": "389456/2024-01-15T10-30-00-000Z-abc123",
          "url": "https://shakezzlab.xyz/api/image/pfps/389456/...",
          "thumbUrl": "...",
          "storedAt": "2024-01-15T10:30:00.000Z",
          "likeCount": 3
        }
      ],
      "profile": {
        "fid": 389456,
        "username": "someone",
        "displayName": "Someone",
        "bio": "...",
        "followerCount": 1200,
        "powerBadge": false
      }
    }
  ]
}`}</pre>
        </div>
      </section>

      <section className="aboutSection">
        <div className="aboutCta">
          <h2>See it in action</h2>
          <p>Browse the live data powering this app.</p>
          <div className="heroActions">
            <Link className="primaryButton" href="/browse">Browse profiles</Link>
            <a
              className="shareButton"
              href={`${API_BASE}/api/faces/stats`}
              target="_blank"
              rel="noreferrer"
            >
              Live stats JSON
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
