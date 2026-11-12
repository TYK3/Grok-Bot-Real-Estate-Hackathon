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

export default async function CallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = getPropertyById(id);
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
