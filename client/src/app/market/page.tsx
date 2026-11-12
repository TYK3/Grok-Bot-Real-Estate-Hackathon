import { MarketDashboard } from "@/components/market/MarketDashboard";
import { SiteNav } from "@/components/site/SiteNav";
import { getListingSummaries } from "@/lib/listings-server";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  return (
    <div className="re-page">
      <SiteNav />
      <MarketDashboard listings={await getListingSummaries()} />
    </div>
  );
}
