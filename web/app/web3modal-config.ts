import { createWeb3Modal, defaultConfig } from "@web3modal/ethers/react";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

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
      url: typeof window !== "undefined" ? window.location.origin : "https://web-sigma-three-32.vercel.app",
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
