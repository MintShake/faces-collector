import { NextResponse } from "next/server";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-legoblocksapps.vercel.app";
const splashBackgroundColor = "#07121f";
const accountAssociation = {
  header:
    process.env.FARCASTER_ACCOUNT_ASSOCIATION_HEADER ??
    "eyJmaWQiOjY3OTEwMywidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDE1ODcyZDQ5RDkwNjM4YWU4Y2VkZDQxYkExMmU1MmU2RjRGMjZEODQifQ",
  payload:
    process.env.FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD ??
    "eyJkb21haW4iOiJ3ZWItc2lnbWEtdGhyZWUtMzIudmVyY2VsLmFwcCJ9",
  signature:
    process.env.FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE ??
    "ilSQeIk1kGI6J4nY3jz2QSRzEoC+1d7vnIKmNyqHzysszz4/wOWTrkE6MiWxYR57uf3NM1kQupctURnUu/80nRs="
};

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    accountAssociation,
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
