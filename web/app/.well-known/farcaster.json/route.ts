import { NextResponse } from "next/server";
import { APP_HOST, APP_URL } from "@/lib/app-url";

const splashBackgroundColor = "#07121f";

export const dynamic = "force-dynamic";

export function GET() {
  const accountAssociation = getAccountAssociation();

  return NextResponse.json({
    ...(accountAssociation ? { accountAssociation } : {}),
    miniapp: {
      version: "1",
      name: "Faces",
      iconUrl: `${APP_URL}/miniapp/icon.png`,
      homeUrl: APP_URL,
      imageUrl: `${APP_URL}/miniapp/embed.png`,
      buttonTitle: "Browse faces",
      splashImageUrl: `${APP_URL}/miniapp/splash.png`,
      splashBackgroundColor,
      subtitle: "Profile images saved",
      description: "Browse public profile picture history across the social web.",
      primaryCategory: "social",
      tags: ["farcaster", "pfp", "profiles", "history"],
      heroImageUrl: `${APP_URL}/miniapp/og.png`,
      tagline: "Profile images saved",
      ogTitle: "Faces",
      ogDescription: "Profile picture history across the social web.",
      ogImageUrl: `${APP_URL}/miniapp/og.png`,
      webhookUrl: `${APP_URL}/api/miniapp/events`,
      requiredChains: ["eip155:8453"],
      requiredCapabilities: ["actions.ready", "actions.addMiniApp", "actions.composeCast", "actions.swapToken", "wallet.getEthereumProvider"],
      canonicalDomain: APP_HOST
    }
  });
}

function getAccountAssociation() {
  const header = process.env.FARCASTER_ACCOUNT_ASSOCIATION_HEADER;
  const payload = process.env.FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD;
  const signature = process.env.FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE;

  if (!header || !payload || !signature) {
    return undefined;
  }

  return {
    header,
    payload,
    signature
  };
}
