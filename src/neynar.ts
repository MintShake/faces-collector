import { config } from "./config.js";

export type NeynarBulkUser = {
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  profile?: {
    bio?: {
      text?: string;
    };
  };
  follower_count: number;
  score: number;
  power_badge: boolean;
  verifications: string[];
};

export async function fetchNeynarUsersBulk(fids: number[]): Promise<NeynarBulkUser[]> {
  if (fids.length === 0) return [];
  if (!config.neynarApiKey) throw new Error("NEYNAR_API_KEY not set");

  const url = new URL("https://api.neynar.com/v2/farcaster/user/bulk");
  url.searchParams.set("fids", fids.join(","));

  const response = await fetch(url.toString(), {
    headers: {
      "x-api-key": config.neynarApiKey,
      accept: "application/json"
    },
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new Error(`Neynar bulk user API failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { users?: NeynarBulkUser[] };
  return data.users ?? [];
}
