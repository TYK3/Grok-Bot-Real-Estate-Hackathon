import { ExploreView } from "@/components/explore/ExploreView";
import { SiteNav } from "@/components/site/SiteNav";
import { getListingSummaries } from "@/lib/listings-server";

export const dynamic = "force-dynamic";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; saved?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "map" || sp.view === "grid" ? sp.view : "split";
  return (
    <div className="re-page">
      <SiteNav />
      <ExploreView
        listings={await getListingSummaries()}
        initialQuery={sp.q ?? ""}
        initialView={view}
        initialSaved={sp.saved === "1"}
      />
    </div>
  );
}
