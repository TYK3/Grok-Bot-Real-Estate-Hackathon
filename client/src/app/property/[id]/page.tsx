import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BedDouble,
  Bath,
  Sofa,
  PhoneCall,
  Building2,
  Banknote,
  CalendarDays,
  Landmark,
} from "lucide-react";

import { PropertyGallery } from "@/components/PropertyGallery";
import { PropertyImage } from "@/components/PropertyImage";
import { SiteHeader } from "@/components/SiteHeader";
import { getPropertyById } from "@/lib/properties";
import {
  bathsLabel,
  bedsLabel,
  capitalise,
  fullAddress,
  priceLabel,
  titleFor,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = getPropertyById(id);
  if (!property) notFound();

  const floorplan = isFeatureEnabled(process.env.PROPERTY_SHOW_FLOORPLAN)
    ? property.floorplans?.find(Boolean) ?? null
    : null;
  const epc = isFeatureEnabled(process.env.PROPERTY_SHOW_EPC)
    ? property.epc?.image ?? null
    : null;

  return (
    <main className="min-h-screen bg-[#f7f6f3] pb-28 text-[#13294b]">
      <SiteHeader>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#697586] transition-colors hover:text-[#e95650]"
        >
          <ArrowLeft className="size-4" />
          All properties
        </Link>
      </SiteHeader>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-8">
            <PropertyGallery
              images={property.images ?? []}
              alt={titleFor(property)}
            />

            <div className="border-b border-[#d9dee5] pb-6">
              <h1
                className="font-heading max-w-4xl text-4xl leading-tight sm:text-5xl"
              >
                {titleFor(property)}
              </h1>
              <p className="mt-3 text-base leading-relaxed text-[#697586]">
                {fullAddress(property)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-7 gap-y-4 border-b border-[#d9dee5] pb-6">
              <Fact icon={<BedDouble />} value={bedsLabel(property)} />
              <Fact icon={<Bath />} value={bathsLabel(property)} />
              <Fact
                icon={<Sofa />}
                value={`${property.reception_rooms ?? 0} reception`}
              />
              {property.furnishing ? (
                <Fact
                  icon={<Building2 />}
                  value={capitalise(property.furnishing)}
                />
              ) : null}
            </div>

            {property.description ? (
              <section className="border-b border-[#d9dee5] pb-8">
                <SectionTitle>About this property</SectionTitle>
                <p className="mt-4 max-w-3xl whitespace-pre-line text-base leading-8 text-[#4f5f70]">
                  {property.description}
                </p>
              </section>
            ) : null}

            {property.key_features && property.key_features.length > 0 ? (
              <section className="border-b border-[#d9dee5] pb-8">
                <SectionTitle>Key features</SectionTitle>
                <div className="mt-3 flex flex-wrap gap-2">
                  {property.key_features.map((f) => (
                    <span
                      key={f}
                      className="rounded-full border border-[#d9dee5] bg-white px-3 py-1 text-xs text-[#4f5f70]"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {floorplan ? (
              <section className="border-b border-[#d9dee5] pb-8">
                <SectionTitle>Floor plan</SectionTitle>
                <PropertyImage
                  src={floorplan}
                  alt="Floor plan"
                  className="mt-4 aspect-[4/3] w-full rounded-lg border border-[#d9dee5] bg-white"
                  imgClassName="object-contain"
                />
              </section>
            ) : null}

            {epc ? (
              <section className="border-b border-[#d9dee5] pb-8">
                <SectionTitle>EPC</SectionTitle>
                <PropertyImage
                  src={epc}
                  alt="EPC certificate"
                  className="mt-4 aspect-[4/3] w-full rounded-lg border border-[#d9dee5] bg-white"
                  imgClassName="object-contain"
                />
              </section>
            ) : null}
          </div>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <div className="space-y-5 rounded-lg border border-[#d9dee5] bg-white p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#697586]">
                  Rent
                </p>
                <p
                  className="mt-1 text-3xl font-semibold text-[#13294b]"
                >
                  {priceLabel(property)}
                </p>
              </div>

              <dl className="space-y-3 border-t border-[#d9dee5] pt-4 text-sm">
                <Row
                  icon={<Banknote />}
                  label="Deposit"
                  value={property.security_deposit}
                />
                <Row
                  icon={<Landmark />}
                  label="Council tax"
                  value={
                    property.council_tax_band
                      ? `Band ${property.council_tax_band}`
                      : undefined
                  }
                />
                <Row
                  icon={<CalendarDays />}
                  label="Available"
                  value={property.live_date}
                />
              </dl>

              <Link
                href={`/call/${property.property_id}`}
                aria-label="Talk to 24/7 live agent"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#13294b] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1c365e]"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#16a34a] text-white">
                  <PhoneCall className="size-4" />
                </span>
                Talk to 24/7 Live Agent
              </Link>

              {property.branch ? (
                <div className="border-t border-[#d9dee5] pt-4 text-sm text-[#697586]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a95a3]">
                    Call branch
                  </p>
                  {property.branch.name ? (
                    <p className="mt-2 font-medium text-[#13294b]">
                      {property.branch.name}
                    </p>
                  ) : null}
                  {property.branch.phone ? (
                    <p className="mt-1 text-[#4f5f70]">
                      {property.branch.phone}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e95650]">
      {children}
    </h2>
  );
}

function Fact({
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

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactElement;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-[#697586]">
        <span className="text-[#8a95a3] [&_svg]:size-3.5">{icon}</span>
        {label}
      </dt>
      <dd className="text-right font-medium text-[#13294b]">{value}</dd>
    </div>
  );
}

function isFeatureEnabled(value?: string): boolean {
  return value === "true" || value === "1";
}
