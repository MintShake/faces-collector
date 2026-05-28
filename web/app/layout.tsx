import type { Metadata } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-legoblocksapps.vercel.app";
const splashBackgroundColor = "#07121f";
const miniAppEmbed = {
  version: "1",
  imageUrl: `${appUrl}/miniapp/embed.png`,
  button: {
    title: "See your PFP eras",
    action: {
      type: "launch_miniapp",
      name: "Faces",
      url: appUrl,
      splashImageUrl: `${appUrl}/miniapp/splash.png`,
      splashBackgroundColor
    }
  }
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Faces - Your Farcaster PFP Timeline",
  description: "Save, like, share, and rediscover the PFP eras that show how Farcaster people grow.",
  openGraph: {
    title: "Faces - Your Farcaster PFP Timeline",
    description: "See the icons, eras, jokes, and glow-ups behind every Farcaster PFP timeline.",
    images: ["/miniapp/embed.png"]
  },
  icons: {
    icon: "/miniapp/icon.png",
    apple: "/miniapp/icon.png"
  },
  other: {
    "fc:miniapp": JSON.stringify(miniAppEmbed),
    "fc:frame": JSON.stringify(miniAppEmbed)
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
