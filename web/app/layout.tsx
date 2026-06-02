import type { Metadata } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-legoblocksapps.vercel.app";
const splashBackgroundColor = "#07121f";
const miniAppEmbed = {
  version: "1",
  imageUrl: `${appUrl}/miniapp/embed.png`,
  button: {
    title: "Open hub",
    action: {
      type: "launch_miniapp",
      name: "Shakezz Hub",
      url: appUrl,
      splashImageUrl: `${appUrl}/miniapp/splash.png`,
      splashBackgroundColor
    }
  }
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Shakezz Hub",
  description: "Private Faces operations dashboard.",
  openGraph: {
    title: "Shakezz Hub",
    description: "Private Faces operations dashboard.",
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
