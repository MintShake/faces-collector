import Link from "next/link";
import { AboutModal } from "./about-modal";
import { FacesBalance } from "./faces-balance";
import { LiveRefresh } from "./live-refresh";
import { NavConnect } from "./nav-connect";

export function Nav() {
  return (
    <nav className="globalNav" aria-label="Site navigation">
      <div className="navInner">
        <div className="navBrandGroup">
          <Link className="navBrand" href="/">Faces</Link>
          <LiveRefresh />
        </div>
        <div className="navLinks">
          <AboutModal />
          <Link className="navBrowse" href="/browse">Browse</Link>
          <FacesBalance />
          <NavConnect />
        </div>
      </div>
    </nav>
  );
}
