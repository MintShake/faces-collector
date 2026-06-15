import Link from "next/link";

export function Nav() {
  return (
    <nav className="globalNav" aria-label="Site navigation">
      <div className="navInner">
        <Link className="navBrand" href="/">Faces</Link>
        <div className="navLinks">
          <Link className="navLink" href="/about">Build</Link>
          <Link className="navBrowse" href="/browse">Browse</Link>
        </div>
      </div>
    </nav>
  );
}
