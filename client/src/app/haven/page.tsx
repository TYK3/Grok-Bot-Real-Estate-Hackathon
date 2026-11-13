import type { Metadata } from "next";

import { HavenExperience } from "@/components/haven/HavenExperience";
import { SiteNav } from "@/components/site/SiteNav";
import { getHavenPreviews } from "@/lib/haven";
import { getListingSummaries } from "@/lib/listings-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Haven · AI lettings agent",
  description: "Talk to Haven: find homes near what matters, check prices, ask about the agreement, book viewings and reserve.",
};

export default async function HavenPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string; try?: string }>;
}) {
  const { listing, try: tryKind } = await searchParams;
  const listings = await getListingSummaries();
  const context = listings.find((l) => l.id === listing) ?? null;
  return (
    <div className="re-page">
      <SiteNav />
      <HavenExperience
        listings={listings}
        previews={getHavenPreviews(listings, context?.id ?? null)}
        context={context}
        initialTry={tryKind ?? null}
      />
    </div>
  );
}
