import Link from "next/link";
import type { FidTile } from "@/lib/pfps";
import { ShareButton } from "./share-button";

export function FidCard({ tile }: { tile: FidTile }) {
  const preview = tile.images.slice(0, 5);

  return (
    <article className="tile">
      <Link className="tileLink" href={`/fid/${tile.fid}`}>
        <div className="thumbStack" aria-hidden="true">
          {preview.map((image, index) => (
            <img
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
          <span className="count">{tile.images.length.toLocaleString()}</span>
        </div>
      </Link>
      <ShareButton fid={tile.fid} count={tile.images.length} variant="compact" />
    </article>
  );
}
