import { NextResponse } from "next/server";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-legoblocksapps.vercel.app";
const splashBackgroundColor = "#07121f";

export const dynamic = "force-dynamic";

export function GET() {
  const accountAssociation = getAccountAssociation();

  return NextResponse.json({
    ...(accountAssociation ? { accountAssociation } : {}),
    miniapp: {
      version: "1",
      name: "Faces",
      iconUrl: `${appUrl}/miniapp/icon.png`,
      homeUrl: appUrl,
      imageUrl: `${appUrl}/miniapp/embed.png`,
      buttonTitle: "See your PFP eras",
      splashImageUrl: `${appUrl}/miniapp/splash.png`,
      splashBackgroundColor,
      subtitle: "Your PFP eras",
      description: "A warm archive of the PFP changes that show how Farcaster people grow.",
      primaryCategory: "social",
      tags: ["pfp", "memories", "farcaster", "identity"],
      ogTitle: "Faces - Your PFP Timeline",
      ogDescription: "Rediscover your Farcaster PFP eras and browse everyone else's.",
      ogImageUrl: `${appUrl}/miniapp/embed.png`,
      webhookUrl: `${appUrl}/api/miniapp/events`,
      requiredCapabilities: ["actions.ready", "actions.addMiniApp"]
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
