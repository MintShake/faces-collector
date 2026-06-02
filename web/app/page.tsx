import { MiniAppHome } from "./miniapp-client";
import { LiveRefresh } from "./live-refresh";
import { getObjectStorageStats, getPfpGallery, getPfpStats } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [tiles, stats, storage, collector] = await Promise.all([
    getPfpGallery({ limit: 120, imagesPerFid: 5, sort: "newest" }),
    getPfpStats(),
    getObjectStorageStats(),
    getCollectorHealth()
  ]);

  return (
    <main className="shell">
      <LiveRefresh renderedAt={new Date().toISOString()} />
      <MiniAppHome tiles={tiles} stats={stats} storage={storage} collector={collector} />
    </main>
  );
}

async function getCollectorHealth() {
  const collectorUrl = process.env.COLLECTOR_URL ?? "https://faces-collector.onrender.com";

  try {
    const response = await fetch(new URL("/health", collectorUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000)
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `${response.status} ${response.statusText}`
      };
    }

    return await response.json() as Record<string, unknown>;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown collector health error"
    };
  }
}
