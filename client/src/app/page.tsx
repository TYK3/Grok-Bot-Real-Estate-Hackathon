import { FogHero } from "@/components/landing/FogHero";
import { LandingSections } from "@/components/landing/LandingSections";
import { getListingSummaries } from "@/lib/listings-server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const listings = await getListingSummaries();
  const lets = listings.filter((l) => l.deal === "let");
  const districts = new Set(lets.map((l) => l.district)).size;

  return (
    <>
      <FogHero count={lets.length} districts={districts} />
      <LandingSections listings={listings} />
    </>
  );
}
