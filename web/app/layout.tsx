import type { Metadata } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-legoblocksapps.vercel.app";
const miniAppEmbed = {
  version: "1",
  imageUrl: `${appUrl}/miniapp/embed.png`,
  button: {
    title: "Open Faces",
    action: {
      type: "launch_miniapp",
      name: "Faces",
      url: appUrl,
      splashImageUrl: `${appUrl}/miniapp/splash.png`,
      splashBackgroundColor: "#0b1020"
    }
  }
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Faces",
  description: "See your Farcaster PFP timeline.",
  openGraph: {
    title: "Faces",
    description: "See your Farcaster PFP timeline.",
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
