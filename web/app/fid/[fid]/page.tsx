import Link from "next/link";
import { notFound } from "next/navigation";
import { getFidTile } from "@/lib/pfps";
import { LikePanel } from "../../like-panel";
import { SafeImage } from "../../safe-image";
import { ShareButton } from "../../share-button";

export const dynamic = "force-dynamic";

export default async function FidPage({
  params
}: {
  params: Promise<{ fid: string }>;
}) {
  const { fid } = await params;
  const numericFid = Number(fid);

  if (!Number.isInteger(numericFid) || numericFid <= 0) {
    notFound();
  }

  const tile = await getFidTile(numericFid);

  if (!tile) {
    notFound();
  }

  return (
    <main className="shell detailShell">
      <header className="detailHeader">
        <Link className="backLink" href="/">
          Back
        </Link>
        <div>
          <span className="appMark">Profile</span>
          <h1>{displayName(tile)}</h1>
          <p>{profileLine(tile)}</p>
        </div>
        <ShareButton fid={tile.fid} count={tile.images.length} />
      </header>

      <section className="profilePanel" aria-label={`Profile summary for FID ${tile.fid}`}>
        <div className="profileAvatarStack" aria-hidden="true">
          {tile.images.slice(0, 3).map((image, index) => (
            <SafeImage
              key={image.filename}
              src={image.thumbUrl ?? image.url}
              alt=""
              style={{ "--i": index } as React.CSSProperties}
            />
          ))}
        </div>
        <div className="profileCopy">
          <span className="eyebrow">FID {tile.fid}</span>
          <h2>{tile.profile?.displayName ?? tile.profile?.username ?? `FID ${tile.fid}`}</h2>
          {tile.profile?.username && <p className="profileHandle">@{tile.profile.username}</p>}
          {tile.profile?.bio && <p className="profileBio">{tile.profile.bio}</p>}
          <div className="profileFacts">
            <span>{tile.images.length.toLocaleString()} PFPs saved</span>
            {tile.profile?.firstSeenAt && <span>First seen {formatShortDate(tile.profile.firstSeenAt)}</span>}
            {tile.profile?.lastSeenAt && <span>Active {formatShortDate(tile.profile.lastSeenAt)}</span>}
            {tile.profile?.profileUrl && (
              <a href={tile.profile.profileUrl} target="_blank" rel="noreferrer">
                Website
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="historyGrid" aria-label={`PFP history for FID ${tile.fid}`}>
        {tile.images.map((image) => (
          <article key={image.filename} className="historyItem">
            <a href={image.url} target="_blank" rel="noreferrer">
              <SafeImage
                src={image.url}
                alt={`FID ${tile.fid} PFP logged ${formatDate(image.storedAt)}`}
                loading="lazy"
                decoding="async"
              />
              <span>{formatDate(image.storedAt)}</span>
            </a>
            <LikePanel ownerFid={tile.fid} image={image} />
          </article>
        ))}
      </section>
    </main>
  );
}

function displayName(tile: NonNullable<Awaited<ReturnType<typeof getFidTile>>>) {
  if (tile.profile?.displayName) {
    return tile.profile.displayName;
  }

  if (tile.profile?.username) {
    return `@${tile.profile.username}`;
  }

  return `FID ${tile.fid}`;
}

function profileLine(tile: NonNullable<Awaited<ReturnType<typeof getFidTile>>>) {
  const handle = tile.profile?.username ? `@${tile.profile.username}` : `FID ${tile.fid}`;
  return `${handle} has ${tile.images.length.toLocaleString()} logged PFP${tile.images.length === 1 ? "" : "s"}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}
