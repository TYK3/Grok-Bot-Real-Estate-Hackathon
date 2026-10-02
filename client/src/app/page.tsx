import { PropertyGrid } from "@/components/PropertyGrid";
import { SiteHeader } from "@/components/SiteHeader";
import { getAllProperties } from "@/lib/properties";

export const dynamic = "force-dynamic";

export default function Home() {
  const listings = getAllProperties();

  return (
    <main className="min-h-screen bg-[#f7f6f3] text-[#13294b]">
      <SiteHeader>
        <span className="text-sm">
          {listings.length} properties to let
        </span>
      </SiteHeader>
      <div className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="border-b border-[#d9dee5] py-8 sm:py-10">
          <h2
            className="font-heading max-w-3xl text-4xl leading-tight sm:text-5xl"
          >
            Properties for rent in East London
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#697586]">
            Browse listings and speak to our AI lettings agent about any
            property.
          </p>
        </div>
        <PropertyGrid listings={listings} />
      </div>
    </main>
  );
}
