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
  MapPin,
} from "lucide-react";

import { PropertyGallery } from "@/components/PropertyGallery";
import { PropertyImage } from "@/components/PropertyImage";
import { SiteNav } from "@/components/site/SiteNav";
import { VerifiedFacts, VerifiedFactsBadge } from "@/components/VerifiedFacts";
import { getPropertyById } from "@/lib/properties";
import { isVerifiedListing, propertyPhotos } from "@/lib/property-types";
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

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await getPropertyById(id);
  if (!property) notFound();
  const reception = receptionLabel(property);
  const features = [...new Set(property.key_features ?? [])];

  const floorplan = isFeatureEnabled(process.env.PROPERTY_SHOW_FLOORPLAN)
    ? property.floorplans?.find(Boolean) ?? null
    : null;
  const epc = isFeatureEnabled(process.env.PROPERTY_SHOW_EPC)
    ? property.epc?.image ?? null
    : null;

  return (
    <main className="min-h-screen bg-[var(--re-bg)] pb-28 text-[var(--re-ink)]">
      <SiteNav />
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 pt-5 sm:px-6 lg:px-8">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--re-muted)] transition-colors hover:text-[#e95650]"
        >
          <ArrowLeft className="size-4" />
          All homes
        </Link>
        <Link
          href="/call/general"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#e95650] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#d94c46]"
        >
          <MapPin className="size-3.5" />
          Find homes near…
        </Link>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-8">
            <PropertyGallery
              images={propertyPhotos(property)}
              alt={titleFor(property)}
            />

            <div className="border-b border-[var(--re-line)] pb-6">
              {isVerifiedListing(property) ? (
                <div className="mb-3">
                  <VerifiedFactsBadge />
                </div>
              ) : null}
              <h1
                className="font-heading max-w-4xl text-4xl leading-tight sm:text-5xl"
              >
                {titleFor(property)}
              </h1>
              <p className="mt-3 text-base leading-relaxed text-[var(--re-muted)]">
                {fullAddress(property)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-7 gap-y-4 border-b border-[var(--re-line)] pb-6">
              <Fact icon={<BedDouble />} value={bedsLabel(property)} />
              <Fact icon={<Bath />} value={bathsLabel(property)} />
              {reception ? <Fact icon={<Sofa />} value={reception} /> : null}
              {property.furnishing ? (
                <Fact
                  icon={<Building2 />}
                  value={capitalise(property.furnishing)}
                />
              ) : null}
            </div>

            <VerifiedFacts property={property} />

            {property.description ? (
              <section className="border-b border-[var(--re-line)] pb-8">
                <SectionTitle>About this property</SectionTitle>
                <p className="mt-4 max-w-3xl whitespace-pre-line text-base leading-8 text-[var(--re-muted)]">
                  {property.description}
                </p>
              </section>
            ) : null}

            {features.length > 0 && !isVerifiedListing(property) ? (
              <section className="border-b border-[var(--re-line)] pb-8">
                <SectionTitle>Key features</SectionTitle>
                <div className="mt-3 flex flex-wrap gap-2">
                  {features.map((f) => (
                    <span
                      key={f}
                      className="rounded-full border border-[var(--re-line)] bg-[var(--re-surface)] px-3 py-1 text-xs text-[var(--re-muted)]"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {floorplan ? (
              <section className="border-b border-[var(--re-line)] pb-8">
                <SectionTitle>Floor plan</SectionTitle>
                <PropertyImage
                  src={floorplan}
                  alt="Floor plan"
                  className="mt-4 aspect-[4/3] w-full rounded-lg border border-[var(--re-line)] bg-[var(--re-surface)]"
                  imgClassName="object-contain"
                />
              </section>
            ) : null}

            {epc ? (
              <section className="border-b border-[var(--re-line)] pb-8">
                <SectionTitle>EPC</SectionTitle>
                <PropertyImage
                  src={epc}
                  alt="EPC certificate"
                  className="mt-4 aspect-[4/3] w-full rounded-lg border border-[var(--re-line)] bg-[var(--re-surface)]"
                  imgClassName="object-contain"
                />
              </section>
            ) : null}
          </div>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <div className="space-y-5 rounded-lg border border-[var(--re-line)] bg-[var(--re-surface)] p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--re-muted)]">
                  {priceHeading(property)}
                </p>
                <p
                  className="mt-1 text-3xl font-semibold text-[var(--re-ink)]"
                >
                  {priceLabel(property)}
                </p>
              </div>

              <dl className="space-y-3 border-t border-[var(--re-line)] pt-4 text-sm">
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
                href={`/call/${encodeURIComponent(String(property.property_id))}`}
                aria-label="Talk to 24/7 live agent"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--re-ink)] px-4 text-sm font-semibold text-[var(--re-bg)] shadow-sm transition-colors hover:opacity-90"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#16a34a] text-white">
                  <PhoneCall className="size-4" />
                </span>
                Talk to 24/7 Live Agent
              </Link>

              {property.branch ? (
                <div className="border-t border-[var(--re-line)] pt-4 text-sm text-[var(--re-muted)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--re-muted)]">
                    Call branch
                  </p>
                  {property.branch.name ? (
                    <p className="mt-2 font-medium text-[var(--re-ink)]">
                      {property.branch.name}
                    </p>
                  ) : null}
                  {property.branch.phone ? (
                    <p className="mt-1 text-[var(--re-muted)]">
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
    <div className="flex items-center gap-2 text-sm text-[var(--re-ink)]">
      <span className="text-[var(--re-muted)] [&_svg]:size-4">{icon}</span>
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
      <dt className="flex items-center gap-2 text-[var(--re-muted)]">
        <span className="text-[var(--re-muted)] [&_svg]:size-3.5">{icon}</span>
        {label}
      </dt>
      <dd className="text-right font-medium text-[var(--re-ink)]">{value}</dd>
    </div>
  );
}

function isFeatureEnabled(value?: string): boolean {
  return value === "true" || value === "1";
}
