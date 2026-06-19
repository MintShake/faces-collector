import Link from "next/link";
import { getActivityLog } from "@/lib/social";
import { ActivityFeed } from "./activity-feed";
import { HomeData, HeroStack } from "./home-data";

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

      <section className="homeInfoRow">
        <div className="infoCard tokenInfoCard">
          <span className="eyebrow">Token · Base</span>
          <h3>Faces Token</h3>
          <p>Hold it, earn it, tip it. More utility coming.</p>
          <code className="tokenAddressCompact">{TOKEN_ADDRESS}</code>
          <div className="infoCardLinks">
            <a href={`https://basescan.org/token/${TOKEN_ADDRESS}`} target="_blank" rel="noreferrer">BaseScan</a>
            <a href={`https://dexscreener.com/base/${TOKEN_ADDRESS}`} target="_blank" rel="noreferrer">DexScreener</a>
            <a href={`https://app.uniswap.org/explore/tokens/base/${TOKEN_ADDRESS}`} target="_blank" rel="noreferrer" className="infoCardPrimary">Trade</a>
          </div>
        </div>

        <a href="https://shakezzlab.xyz" target="_blank" rel="noreferrer" className="infoCard apiInfoCard">
          <span className="eyebrow">Open API</span>
          <h3>Faces Data API</h3>
          <p>Free, public, CORS-enabled. Profile pic history for every FID. No key needed.</p>
          <span className="infoCardCta">shakezzlab.xyz →</span>
        </a>
      </section>
    </main>
  );
}

const TOKEN_ADDRESS = "0xa199Ab829b992FD357E40F1E91be724D7273aa82";
