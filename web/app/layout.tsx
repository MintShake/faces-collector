import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./auth-context";
import { ConnectModal } from "./connect-modal";
import { Nav } from "./nav";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-legoblocksapps.vercel.app";
const splashBackgroundColor = "#07121f";
const miniAppEmbed = {
  version: "1",
  imageUrl: `${appUrl}/miniapp/embed.png`,
  button: {
    title: "Browse faces",
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
  title: "Faces",
  description: "Profile picture history across the social web.",
  openGraph: {
    title: "Faces",
    description: "Profile picture history across the social web.",
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
      <body>
        <AuthProvider>
          <Nav />
          {children}
          <ConnectModal />
        </AuthProvider>
      </body>
    </html>
  );
}
