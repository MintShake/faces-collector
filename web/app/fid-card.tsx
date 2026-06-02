import Link from "next/link";
import type { FidTile } from "@/lib/pfps";
import { LikePanel } from "./like-panel";
import { SafeImage } from "./safe-image";
import { ShareButton } from "./share-button";

export function FidCard({ tile }: { tile: FidTile }) {
  const preview = tile.images.slice(0, 5);
  const totalLikes = tile.images.reduce((sum, image) => sum + image.likeCount, 0);

  return (
    <article className="tile">
      <Link className="tileLink" href={`/fid/${tile.fid}`}>
        <div className="thumbStack" aria-hidden="true">
          {preview.map((image, index) => (
            <SafeImage
              key={image.filename}
              src={image.thumbUrl ?? image.url}
              alt=""
              loading="lazy"
              decoding="async"
              style={
                {
                  "--i": index
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <div className="tileMeta">
          <span className="fid">FID {tile.fid}</span>
          <span className="count" title="PFPs logged">{tile.imageCount.toLocaleString()}</span>
        </div>
      </Link>
      {totalLikes > 0 && <span className="tileLikes">{totalLikes.toLocaleString()} likes</span>}
      {tile.images[0] && <LikePanel ownerFid={tile.fid} image={tile.images[0]} compact />}
      <ShareButton fid={tile.fid} count={tile.imageCount} variant="compact" />
    </article>
  );
}
