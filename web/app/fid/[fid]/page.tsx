import Link from "next/link";
import { notFound } from "next/navigation";
import { getFidTile } from "@/lib/pfps";
import { LikePanel } from "../../like-panel";
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
          <h1>FID {tile.fid}</h1>
          <p>{tile.images.length.toLocaleString()} logged PFPs</p>
        </div>
        <ShareButton fid={tile.fid} count={tile.images.length} />
      </header>

      <section className="historyGrid" aria-label={`PFP history for FID ${tile.fid}`}>
        {tile.images.map((image) => (
          <article key={image.filename} className="historyItem">
            <a href={image.url} target="_blank" rel="noreferrer">
              <img
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
