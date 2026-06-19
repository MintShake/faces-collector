import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./auth-context";
import { ConnectModal } from "./connect-modal";
import { Nav } from "./nav";
import { APP_URL } from "@/lib/app-url";

const splashBackgroundColor = "#07121f";
const miniAppEmbed = {
  version: "1",
  imageUrl: `${APP_URL}/miniapp/embed.png`,
  button: {
    title: "Browse faces",
    action: {
      type: "launch_miniapp",
      name: "Faces",
      url: APP_URL,
      splashImageUrl: `${APP_URL}/miniapp/splash.png`,
      splashBackgroundColor
    }
  }
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "Faces",
  description: "Profile picture history across the social web.",
  openGraph: {
    title: "Faces",
    description: "Profile picture history across the social web.",
    images: ["/miniapp/og.png"]
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
