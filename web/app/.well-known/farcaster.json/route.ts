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
      buttonTitle: "Browse faces",
      splashImageUrl: `${appUrl}/miniapp/splash.png`,
      splashBackgroundColor,
      subtitle: "PFP eras saved",
      description: "Browse public profile picture history across the social web.",
      primaryCategory: "social",
      tags: ["farcaster", "pfp", "profiles", "history"],
      ogTitle: "Faces",
      ogDescription: "Profile picture history across the social web.",
      ogImageUrl: `${appUrl}/miniapp/embed.png`,
      webhookUrl: `${appUrl}/api/miniapp/events`,
      requiredCapabilities: ["actions.ready", "actions.addMiniApp", "actions.sendToken", "actions.swapToken"]
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
