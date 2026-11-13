import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  Bath,
  BedDouble,
  Building2,
  CalendarCheck,
  CalendarDays,
  Landmark,
  MapPin,
  Mic,
  Sofa,
} from "lucide-react";

import { PropertyGallery } from "@/components/PropertyGallery";
import { PropertyImage } from "@/components/PropertyImage";
import { FactBoard, type BlockingCase } from "@/components/property/FactBoard";
import { SiteNav } from "@/components/site/SiteNav";
import { getFactChecks } from "@/lib/fact-checks";
import { pricePreview } from "@/lib/haven";
import { getListingSummaries } from "@/lib/listings-server";
import { money } from "@/lib/listing-summary";
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
  const pid = String(property.property_id);
  const reception = receptionLabel(property);
  const features = [...new Set(property.key_features ?? [])];
  const haven = `/haven?listing=${encodeURIComponent(pid)}`;

  const floorplan = isFeatureEnabled(process.env.PROPERTY_SHOW_FLOORPLAN)
    ? property.floorplans?.find(Boolean) ?? null
    : null;
  const epc = isFeatureEnabled(process.env.PROPERTY_SHOW_EPC) ? property.epc?.image ?? null : null;

  // Price position among comparable lettings (same numbers Haven quotes).
  const summaries = await getListingSummaries();
  const self = summaries.find((s) => s.id === pid);
  const price = self ? pricePreview(summaries, self) : null;

  // Open contradictions that hold back fields on this listing.
  const blocking: Record<string, BlockingCase> = {};
  if (property.verified_fields) {
    const dev = getFactChecks().find((d) => d.listingId === pid);
    for (const c of dev?.contradictions ?? []) {
      blocking[c.id] = {
        id: c.id,
        type: c.type,
        reason: c.reason,
        facts: c.facts.map((f) => ({
          display: f.display,
          issuer: f.issuer,
          docType: f.docType,
          docDate: f.docDate,
          page: f.page,
          quote: f.quote,
          recommended: f.recommended,
        })),
      };
    }
  }

  return (
    <div className="re-page pb-28">
      <SiteNav />

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <Link href="/explore" className="inline-flex items-center gap-1.5 text-sm text-[var(--re-muted)] transition-colors hover:text-[var(--re-ink)]">
          <ArrowLeft className="size-4" /> All homes
        </Link>

        <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-10">
            <div className="overflow-hidden rounded-[24px]">
              <PropertyGallery images={propertyPhotos(property)} alt={titleFor(property)} />
            </div>

            <header>
              {isVerifiedListing(property) ? (
                <span className="re-chip mb-4 h-8 text-xs" style={{ color: "var(--re-good)" }}>
                  Fact-checked listing
                </span>
              ) : null}
              <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">{titleFor(property)}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-base text-[var(--re-muted)]">
                <MapPin className="size-4 shrink-0" /> {fullAddress(property)}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Spec icon={<BedDouble />} value={bedsLabel(property)} />
                <Spec icon={<Bath />} value={bathsLabel(property)} />
                {reception ? <Spec icon={<Sofa />} value={reception} /> : null}
                {property.furnishing ? <Spec icon={<Building2 />} value={capitalise(property.furnishing)} /> : null}
              </div>
            </header>

            {property.verified_fields ? <FactBoard fields={property.verified_fields} blocking={blocking} /> : null}

            {price ? (
              <section className="re-card p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--re-accent)]">Price check</p>
                    <h2 className="mt-1 text-2xl font-medium tracking-tight">
                      {Math.abs(price.delta_pct)}% {price.delta_pct < 0 ? "below" : "above"} the average
                    </h2>
                    <p className="mt-1 text-sm text-[var(--re-muted)]">
                      Compared with {price.count} {price.basis} in our listings (average {money(price.average)} pcm).
                    </p>
                  </div>
                  <Link href={`${haven}&try=price`} className="re-btn re-btn-ghost gap-2 text-sm">
                    See the full comparison <ArrowUpRight className="size-4" />
                  </Link>
                </div>
                <div className="relative mt-6 h-10">
                  <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ background: "var(--re-surface-2)" }} />
                  {price.prices.map((v, i) => (
                    <span
                      key={i}
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{ left: pct(v, price), background: "color-mix(in srgb, var(--re-ink) 30%, transparent)" }}
                    />
                  ))}
                  <span
                    className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ left: pct(price.price, price), background: "var(--re-accent)", outline: "3px solid var(--re-surface)" }}
                    title={`This home: ${money(price.price)}`}
                  />
                </div>
                <div className="flex justify-between text-xs text-[var(--re-muted)] tabular-nums">
                  <span>{money(Math.min(price.min, price.price))}</span>
                  <span>{money(Math.max(price.max, price.price))}</span>
                </div>
              </section>
            ) : null}

            {property.description ? (
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--re-accent)]">About this home</p>
                <p className="mt-3 max-w-3xl whitespace-pre-line text-base leading-8 text-[var(--re-muted)]">{property.description}</p>
              </section>
            ) : null}

            {features.length > 0 && !isVerifiedListing(property) ? (
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--re-accent)]">Key features</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {features.map((f) => (
                    <span key={f} className="re-chip">{f}</span>
                  ))}
                </div>
              </section>
            ) : null}

            {floorplan ? (
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--re-accent)]">Floor plan</p>
                <PropertyImage src={floorplan} alt="Floor plan" className="re-card mt-4 aspect-[4/3] w-full" imgClassName="object-contain" />
              </section>
            ) : null}

            {epc ? (
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--re-accent)]">EPC</p>
                <PropertyImage src={epc} alt="EPC certificate" className="re-card mt-4 aspect-[4/3] w-full" imgClassName="object-contain" />
              </section>
            ) : null}
          </div>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <div className="re-card space-y-5 p-6" style={{ boxShadow: "var(--re-shadow)" }}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--re-muted)]">{priceHeading(property)}</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight">{priceLabel(property)}</p>
              </div>

              <dl className="space-y-3 border-t pt-4 text-sm" style={{ borderColor: "var(--re-line)" }}>
                <Row icon={<Banknote />} label="Deposit" value={property.security_deposit} />
                <Row icon={<Landmark />} label="Council tax" value={
                    property.council_tax_band
                      ? /^[A-H]$/i.test(property.council_tax_band.trim())
                        ? `Band ${property.council_tax_band.trim().toUpperCase()}`
                        : property.council_tax_band
                      : undefined
                  } />
                <Row icon={<CalendarDays />} label="Available" value={property.live_date} />
              </dl>

              <Link href={haven} className="re-btn re-btn-primary h-12 w-full gap-2">
                <Mic className="size-4" /> Ask Haven about this home
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <Link href={`${haven}&try=viewing`} className="re-btn re-btn-ghost h-10 gap-1.5 text-sm">
                  <CalendarCheck className="size-4" /> Book viewing
                </Link>
                <Link href={`${haven}&try=agreement`} className="re-btn re-btn-ghost h-10 text-sm">
                  Agreement Q&amp;A
                </Link>
              </div>
              <Link href="/haven?try=near" className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition-colors hover:bg-[var(--re-surface-2)]" style={{ background: "var(--re-bg)" }}>
                <span className="flex items-center gap-2">
                  <MapPin className="size-4 text-[var(--re-accent)]" /> Find homes near a park, station or shop
                </span>
                <ArrowUpRight className="size-4 text-[var(--re-muted)]" />
              </Link>

              {property.branch ? (
                <div className="border-t pt-4 text-sm text-[var(--re-muted)]" style={{ borderColor: "var(--re-line)" }}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">Branch</p>
                  {property.branch.name ? <p className="mt-2 font-medium text-[var(--re-ink)]">{property.branch.name}</p> : null}
                  {property.branch.phone ? <p className="mt-1">{property.branch.phone}</p> : null}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function pct(v: number, p: { min: number; max: number; price: number }) {
  const lo = Math.min(p.min, p.price);
  const hi = Math.max(p.max, p.price);
  return `${hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100}%`;
}

function Spec({ icon, value }: { icon: React.ReactElement; value: string }) {
  return (
    <span className="re-chip h-10 gap-2 px-4 text-sm [&_svg]:size-4 [&_svg]:text-[var(--re-muted)]">
      {icon}
      {value}
    </span>
  );
}

function Row({ icon, label, value }: { icon: React.ReactElement; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-[var(--re-muted)] [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function isFeatureEnabled(value?: string): boolean {
  return value === "true" || value === "1";
}
