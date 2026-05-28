import { NextResponse } from "next/server";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-legoblocksapps.vercel.app";
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
      buttonTitle: "Open Faces",
      splashImageUrl: `${appUrl}/miniapp/splash.png`,
      splashBackgroundColor: "#0b1020",
      subtitle: "Your PFP timeline",
      description: "Collect and view the history of your Farcaster profile pictures.",
      primaryCategory: "social",
      tags: ["pfp", "history", "farcaster", "identity"],
      ogTitle: "Faces",
      ogDescription: "See your Farcaster PFP timeline.",
      ogImageUrl: `${appUrl}/miniapp/embed.png`,
      webhookUrl: `${appUrl}/api/miniapp/events`,
      requiredCapabilities: ["actions.ready", "actions.addMiniApp"]
    }
  });
}
