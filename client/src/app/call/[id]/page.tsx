import { notFound } from "next/navigation";

import { CallExperience } from "@/components/call/CallExperience";
import type { CallProperty } from "@/components/call/PropertyCallPanel";
import { getPropertyById, primaryImage } from "@/lib/properties";
import {
  bathsLabel,
  bedsLabel,
  capitalise,
  fullAddress,
  priceHeading,
  priceLabel,
  receptionLabel,
  titleFor,
} from "@/lib/format";

export const dynamic = "force-dynamic";

const GENERAL_CALL_ID = "general";

export default async function CallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // General search agent: no property selected; the agent ranks all listings
  // by what is nearby (supermarkets, parks, stations...).
  if (id === GENERAL_CALL_ID) {
    return (
      <CallExperience
        property={{
          id: GENERAL_CALL_ID,
          title: "Find a home near what matters",
          address: "Ask about supermarkets, parks, stations, schools, gyms…",
          price: "All listings",
          priceHeading: "Search",
          beds: "Any",
          baths: "Any",
          receptions: "Any",
          furnishing: "Any",
          image: null,
          features: [
            "Closest to a supermarket",
            "Near a park",
            "Walk to the DLR",
            "Under £2,500 pcm",
          ],
        }}
      />
    );
  }

  const property = await getPropertyById(id);
  if (!property) notFound();

  const callProperty: CallProperty = {
    id: String(property.property_id),
    title: titleFor(property),
    address: fullAddress(property),
    price: priceLabel(property),
    priceHeading: priceHeading(property),
    beds: bedsLabel(property),
    baths: bathsLabel(property),
    receptions: receptionLabel(property)
      ? String(property.reception_rooms ?? 0)
      : "Not stated",
    furnishing: capitalise(property.furnishing) || "N/A",
    image: primaryImage(property),
    features: [...new Set(property.key_features ?? [])],
    branchName: property.branch?.name,
  };

  return <CallExperience property={callProperty} />;
}
