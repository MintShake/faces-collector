import Link from "next/link";
import { GalleryControls } from "../gallery-controls";

export default function BrowsePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="appMark">Faces</span>
          <h1>Browse all profiles</h1>
          <p>Profile picture history across the social web.</p>
        </div>
        <Link className="backLink" href="/">
          Home
        </Link>
      </header>

      <GalleryControls tiles={[]} initialTotalFids={0} initialTotalImages={0} />
    </main>
  );
}
