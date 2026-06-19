import Link from "next/link";
import { getActivityLog } from "@/lib/social";
import { AddAppButton } from "./add-app-button";
import { ActivityFeed } from "./activity-feed";
import { HomeData, HeroStack } from "./home-data";
import { ShareButton } from "./share-button";

export default async function Home() {
  const activityEvents = await getActivityLog().catch(() => []);

  return (
    <main className="shell">
      <section className="miniHero">
        <div className="heroCopy">
          <span className="appMark">Faces</span>
          <h1>Every version of you, saved.</h1>
          <p>Profile picture history across the social web.</p>
          <div className="heroActions">
            <Link className="primaryButton" href="/browse">
              Browse all faces
            </Link>
            <AddAppButton label="Add Mini App" />
            <ShareButton
              label="Share Mini App"
              text="Faces tracks public profile image changes across Farcaster."
              hideAfterUse
            />
          </div>
          <div className="memoryRibbon">
            <span className="platformActive">Farcaster</span>
            <span className="platformSoon">Bluesky · soon</span>
            <span className="platformSoon">Lens · soon</span>
            <span className="platformSoon">X · soon</span>
          </div>
        </div>
        <HeroStack />
      </section>

      <HomeData />

      <ActivityFeed initial={activityEvents} />
    </main>
  );
}
