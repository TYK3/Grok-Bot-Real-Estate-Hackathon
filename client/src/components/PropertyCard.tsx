import Link from "next/link";
import { ArrowUpRight, BedDouble, Bath, Sofa, MapPin, Phone } from "lucide-react";

import { PropertyImage } from "@/components/PropertyImage";
import type { Property } from "@/lib/property-types";
import { primaryImage } from "@/lib/property-types";
import {
  bathsLabel,
  bedsLabel,
  priceLabel,
  shortAddress,
  titleFor,
  capitalise,
} from "@/lib/format";

export function PropertyCard({ listing }: { listing: Property }) {
  return (
    <article className="group overflow-hidden rounded-lg border border-[#d9dee5] bg-white transition-colors hover:border-[#b8c0ca]">
      <div className="grid min-h-full md:grid-cols-[minmax(260px,34%)_minmax(0,1fr)]">
        <Link
          href={`/property/${listing.property_id}`}
          className="relative block aspect-[16/10] md:aspect-auto"
        >
          <PropertyImage
            src={primaryImage(listing)}
            alt={titleFor(listing)}
            className="h-full w-full bg-[#eef0f2]"
            imgClassName="transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
          />
          {listing.furnishing ? (
            <span className="absolute left-3 top-3 z-10 inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#13294b] shadow-sm">
              {capitalise(listing.furnishing)}
            </span>
          ) : null}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e95650]">
                  {listing.status ?? "To let"}
                </p>
                <p className="mt-1 text-2xl font-semibold text-[#13294b]">
                  {priceLabel(listing)}
                </p>
              </div>
              {listing.reference ? (
                <span className="text-xs text-[#697586]">
                  Ref {listing.reference}
                </span>
              ) : null}
            </div>

            <h2 className="font-heading mt-3 line-clamp-2 text-2xl leading-tight text-[#13294b]">
              {titleFor(listing)}
            </h2>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-[#697586]">
              <MapPin className="size-4 shrink-0 text-[#e95650]" />
              <span className="truncate">{shortAddress(listing)}</span>
            </p>
          </div>

          {listing.description ? (
            <p className="line-clamp-2 text-sm leading-relaxed text-[#4f5f70]">
              {listing.description}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-[#e4e7eb] py-3">
            <Stat icon={<BedDouble />} value={bedsLabel(listing)} />
            <Stat icon={<Bath />} value={bathsLabel(listing)} />
            <Stat icon={<Sofa />} value={`${listing.reception_rooms ?? 0} reception`} />
          </div>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
            {listing.key_features && listing.key_features.length > 0 ? (
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {listing.key_features.slice(0, 2).map((feature) => (
                  <span
                    key={feature}
                    className="rounded-full border border-[#d9dee5] bg-[#f7f6f3] px-2.5 py-1 text-xs text-[#4f5f70]"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <Link
                href={`/property/${listing.property_id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#13294b] px-3 text-sm font-semibold text-[#13294b] transition-colors hover:bg-[#13294b] hover:text-white"
              >
                View details
                <ArrowUpRight className="size-3.5" />
              </Link>
              <Link
                href={`/call/${listing.property_id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#e95650] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#d94c46]"
              >
                <Phone className="size-3.5" />
                Talk
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function Stat({
  icon,
  value,
}: {
  icon: React.ReactElement;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-[#13294b]">
      <span className="text-[#697586] [&_svg]:size-4">{icon}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
