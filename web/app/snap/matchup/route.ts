import { decode, verify } from "@farcaster/jfs";
import { getFidTile, getPfpGalleryPage, type FidTile } from "@/lib/pfps";
import {
  getSnapMatchupVotes,
  updateSnapMatchupVote,
  type SnapMatchupCandidate,
  type SnapMatchupChoice,
  type SnapMatchupVoteRecord
} from "@/lib/social";

const SNAP_CONTENT_TYPE = "application/vnd.farcaster.snap+json";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-sigma-three-32.vercel.app";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SnapPayload = {
  fid?: number;
  user?: { fid?: number };
  inputs?: Record<string, unknown>;
  audience?: string;
  timestamp?: number;
};

type Matchup = {
  id: string;
  left: SnapMatchupCandidate;
  right: SnapMatchupCandidate;
};

export async function GET(request: Request) {
  const matchup = await resolveMatchup(request);
  const snapUrl = canonicalSnapUrl(request, matchup);

  if (!wantsSnap(request)) {
    return htmlFallback(snapUrl);
  }

  const votes = await getSnapMatchupVotes(matchup);
  return snapResponse(renderMatchupSnap({ matchup, votes, snapUrl }));
}

export async function POST(request: Request) {
  const matchup = await resolveMatchup(request);
  const url = new URL(request.url);
  const choice = validChoice(url.searchParams.get("choice"));
  const snapUrl = canonicalSnapUrl(request, matchup);

  if (!choice) {
    const votes = await getSnapMatchupVotes(matchup);
    return snapResponse(renderMatchupSnap({ matchup, votes, snapUrl, notice: "Pick a side to vote." }));
  }

  const voterFid = await readVerifiedSnapFid(request).catch(() => undefined);

  if (!voterFid) {
    const votes = await getSnapMatchupVotes(matchup);
    return snapResponse(renderMatchupSnap({
      matchup,
      votes,
      snapUrl,
      notice: "Could not verify your Farcaster vote. Try again in the Farcaster client."
    }));
  }

  const votes = await updateSnapMatchupVote({
    ...matchup,
    voterFid,
    choice
  });

  return snapResponse(renderMatchupSnap({
    matchup,
    votes,
    snapUrl,
    notice: `Vote counted for ${choice === "left" ? matchup.left.name : matchup.right.name}.`
  }));
}

async function resolveMatchup(request: Request): Promise<Matchup> {
  const url = new URL(request.url);
  const leftFid = numericParam(url.searchParams.get("leftFid"));
  const rightFid = numericParam(url.searchParams.get("rightFid"));
  const leftImage = url.searchParams.get("leftImage") ?? undefined;
  const rightImage = url.searchParams.get("rightImage") ?? undefined;

  if (leftFid && rightFid && leftFid !== rightFid) {
    const [left, right] = await Promise.all([
      loadCandidate(leftFid, leftImage),
      loadCandidate(rightFid, rightImage)
    ]);

    if (left && right) return makeMatchup(left, right);
  }

  const seed = numericParam(url.searchParams.get("seed")) ?? 0;
  const page = await getPfpGalleryPage({ sort: "newest", limit: 12, imagesPerFid: 1, order: "desc" });
  const candidates = page.tiles
    .map((tile) => candidateFromTile(tile))
    .filter((candidate): candidate is SnapMatchupCandidate => Boolean(candidate));

  if (candidates.length < 2) {
    throw new Error("Not enough profiles to build a matchup.");
  }

  const leftIndex = seed % candidates.length;
  const rightIndex = (leftIndex + 1 + (seed % (candidates.length - 1))) % candidates.length;

  return makeMatchup(candidates[leftIndex], candidates[rightIndex]);
}

async function loadCandidate(fid: number, imageId?: string) {
  const tile = await getFidTile(fid);
  if (!tile) return undefined;
  return candidateFromTile(tile, imageId);
}

function candidateFromTile(tile: FidTile, imageId?: string): SnapMatchupCandidate | undefined {
  const image = imageId
    ? tile.images.find((item) => item.id === imageId)
    : tile.images[0];

  if (!image) return undefined;

  return {
    fid: tile.fid,
    name: profileName(tile),
    imageId: image.id,
    imageUrl: image.mediumUrl ?? image.url
  };
}

function makeMatchup(left: SnapMatchupCandidate, right: SnapMatchupCandidate): Matchup {
  return {
    id: encodeMatchupId(left, right),
    left,
    right
  };
}

function renderMatchupSnap(input: {
  matchup: Matchup;
  votes: SnapMatchupVoteRecord;
  snapUrl: string;
  notice?: string;
}) {
  const total = input.votes.totals.left + input.votes.totals.right;
  const leftPct = total ? Math.round((input.votes.totals.left / total) * 100) : 0;
  const rightPct = total ? 100 - leftPct : 0;
  const appTarget = `${APP_URL}/?from=snap-matchup`;
  const nextTarget = `${new URL("/snap/matchup", input.snapUrl).toString()}?seed=${Date.now() % 9973}`;

  return {
    version: "2.0",
    theme: { accent: "purple" },
    ui: {
      root: "page",
      elements: {
        page: {
          type: "stack",
          props: { gap: "sm" },
          children: [
            "title",
            ...(input.notice ? ["notice"] : []),
            "cards",
            "results",
            "actions"
          ]
        },
        title: {
          type: "text",
          props: { content: "Which profile image wins?", weight: "bold", align: "center" }
        },
        notice: {
          type: "badge",
          props: { label: input.notice?.slice(0, 30) ?? "Vote counted", color: "purple" }
        },
        cards: {
          type: "stack",
          props: { direction: "horizontal", gap: "sm" },
          children: ["left-card", "right-card"]
        },
        ...candidateElements("left", input.matchup.left, input.snapUrl),
        ...candidateElements("right", input.matchup.right, input.snapUrl),
        results: {
          type: "stack",
          props: { gap: "xs" },
          children: ["left-result", "left-bar", "right-result", "right-bar"]
        },
        "left-result": {
          type: "text",
          props: { content: `${input.matchup.left.name}: ${input.votes.totals.left} votes (${leftPct}%)`, size: "sm" }
        },
        "left-bar": {
          type: "progress",
          props: { value: leftPct, max: 100, label: `${leftPct}%` }
        },
        "right-result": {
          type: "text",
          props: { content: `${input.matchup.right.name}: ${input.votes.totals.right} votes (${rightPct}%)`, size: "sm" }
        },
        "right-bar": {
          type: "progress",
          props: { value: rightPct, max: 100, label: `${rightPct}%` }
        },
        actions: {
          type: "stack",
          props: { direction: "horizontal", gap: "sm" },
          children: ["share", "next", "open"]
        },
        share: {
          type: "button",
          props: { label: "Share", icon: "share" },
          on: {
            press: {
              action: "compose_cast",
              params: {
                text: `Which profile image wins: ${input.matchup.left.name} or ${input.matchup.right.name}?`,
                embeds: [input.snapUrl]
              }
            }
          }
        },
        next: {
          type: "button",
          props: { label: "Next matchup", icon: "refresh-cw" },
          on: { press: { action: "open_snap", params: { target: nextTarget } } }
        },
        open: {
          type: "button",
          props: { label: "Open Faces", variant: "primary", icon: "arrow-right" },
          on: { press: { action: "open_mini_app", params: { target: appTarget } } }
        }
      }
    }
  };
}

function candidateElements(side: SnapMatchupChoice, candidate: SnapMatchupCandidate, snapUrl: string) {
  const title = side === "left" ? "A" : "B";
  const target = voteTarget(snapUrl, side);

  return {
    [`${side}-card`]: {
      type: "stack",
      props: { gap: "xs" },
      children: [`${side}-image`, `${side}-name`, `${side}-vote`, `${side}-profile`]
    },
    [`${side}-image`]: {
      type: "image",
      props: { url: candidate.imageUrl, aspect: "1:1", alt: `${candidate.name} profile image` }
    },
    [`${side}-name`]: {
      type: "text",
      props: { content: `${title}. ${candidate.name}`, weight: "bold", size: "sm", align: "center" }
    },
    [`${side}-vote`]: {
      type: "button",
      props: { label: `Vote ${title}`, variant: "primary" },
      on: { press: { action: "submit", params: { target } } }
    },
    [`${side}-profile`]: {
      type: "button",
      props: { label: "Profile", icon: "user" },
      on: { press: { action: "view_profile", params: { fid: candidate.fid } } }
    }
  };
}

async function readVerifiedSnapFid(request: Request) {
  const body = await request.text();
  const data = body.trim().startsWith("{") ? JSON.parse(body) as { header: string; payload: string; signature: string } : body.trim();

  // Verifies the JFS signature against the supplied app key. A future hardening
  // pass should also confirm the key is currently associated with the FID.
  await verify({ data, keyTypes: ["app_key"] });
  const decoded = decode<SnapPayload>(data);
  return decoded.payload.user?.fid ?? decoded.payload.fid;
}

function snapResponse(body: unknown) {
  return Response.json(body, {
    headers: {
      "content-type": SNAP_CONTENT_TYPE,
      "cache-control": "no-store",
      "vary": "Accept"
    }
  });
}

function htmlFallback(snapUrl: string) {
  const escaped = escapeHtml(snapUrl);

  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Faces matchup</title></head><body><h1>Faces matchup</h1><p>This URL renders as a Farcaster Snap in supported clients.</p><p><a href="${APP_URL}">Open Faces</a></p><code>${escaped}</code></body></html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "link": `<${snapUrl}>; rel="alternate"; type="${SNAP_CONTENT_TYPE}"`,
        "cache-control": "public, max-age=60",
        "vary": "Accept"
      }
    }
  );
}

function canonicalSnapUrl(request: Request, matchup: Matchup) {
  const url = new URL("/snap/matchup", request.url);
  url.searchParams.set("leftFid", String(matchup.left.fid));
  url.searchParams.set("leftImage", matchup.left.imageId);
  url.searchParams.set("rightFid", String(matchup.right.fid));
  url.searchParams.set("rightImage", matchup.right.imageId);
  return url.toString();
}

function voteTarget(snapUrl: string, choice: SnapMatchupChoice) {
  const url = new URL(snapUrl);
  url.searchParams.set("choice", choice);
  return url.toString();
}

function encodeMatchupId(left: SnapMatchupCandidate, right: SnapMatchupCandidate) {
  return Buffer
    .from(`${left.fid}:${left.imageId}|${right.fid}:${right.imageId}`)
    .toString("base64url");
}

function profileName(tile: FidTile) {
  return tile.profile?.username
    ? `@${tile.profile.username}`
    : tile.profile?.displayName ?? `FID ${tile.fid}`;
}

function numericParam(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

function validChoice(value: string | null): SnapMatchupChoice | undefined {
  return value === "left" || value === "right" ? value : undefined;
}

function wantsSnap(request: Request) {
  return request.headers.get("accept")?.includes(SNAP_CONTENT_TYPE) ?? false;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char] ?? char);
}
