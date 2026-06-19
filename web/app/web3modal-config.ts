import { createWeb3Modal, defaultConfig } from "@web3modal/ethers/react";
import { APP_URL } from "@/lib/app-url";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "faces-walletconnect-disabled";

const base = {
  chainId: 8453,
  name: "Base",
  currency: "ETH",
  explorerUrl: "https://basescan.org",
  rpcUrl: "https://mainnet.base.org"
};

createWeb3Modal({
  ethersConfig: defaultConfig({
    metadata: {
      name: "Faces",
      description: "Profile pic history for the social web",
      url: typeof window !== "undefined" ? window.location.origin : APP_URL,
      icons: []
    },
    enableEIP6963: true,
    enableInjected: true,
    enableCoinbase: true,
    rpcUrl: "https://mainnet.base.org"
  }),
  chains: [base],
  projectId,
  enableAnalytics: false,
  themeMode: "light"
});
