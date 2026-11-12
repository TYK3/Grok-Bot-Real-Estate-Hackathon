import {
  BedDouble,
  Bath,
  Sofa,
  Building2,
  CheckCircle2,
  CalendarCheck,
  Loader2,
  MapPin,
  User,
} from "lucide-react";

import { PropertyImage } from "@/components/PropertyImage";

export type CallProperty = {
  id: string;
  title: string;
  address: string;
  price: string;
  priceHeading?: string;
  beds: string;
  baths: string;
  receptions: string;
  furnishing: string;
  image: string | null;
  features: string[];
  branchName?: string;
};

export type CallSnapshot = {
  booking?: {
    date?: string;
    time?: string;
    customer_name?: string;
    status?: string;
  } | null;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  summary?: string | null;
} | null;

export function PropertyCallPanel({
  property,
  snapshot,
  connected,
}: {
  property: CallProperty;
  snapshot: CallSnapshot;
  connected: boolean;
}) {
  const hasBooking = Boolean(snapshot?.booking?.date);
  const hasCustomer = Boolean(
    snapshot?.customer &&
      (snapshot.customer.name ||
        snapshot.customer.email ||
        snapshot.customer.phone),
  );
  const hasLive = hasBooking || hasCustomer;

  return (
    <aside className="min-h-0 overflow-hidden rounded-lg border border-[#d9dee5] bg-white shadow-sm lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
      <div className="relative">
        <PropertyImage
          src={property.image}
          alt={property.title}
          className="aspect-[16/9] w-full"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#13294b]/95 via-[#13294b]/70 to-transparent p-4 pt-10 text-white">
          <h2 className="font-heading line-clamp-2 text-2xl leading-tight">
            {property.title}
          </h2>
          <p className="mt-1 flex items-center gap-1 text-xs text-white/80">
            <MapPin className="size-3 shrink-0 text-[#ffb5b1]" />
            {property.address}
          </p>
        </div>
      </div>

      <div className="space-y-5 p-4">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[#f1c7c4] bg-[#fff5f4] px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e95650]">
            {property.priceHeading ?? "Rent"}
          </span>
          <span className="text-lg font-semibold text-[#13294b]">
            {property.price}
          </span>
        </div>

        <div className="flex items-center border-y border-[#e4e7eb] py-3">
          <Stat icon={<BedDouble />} label="Beds" value={property.beds} />
          <Stat icon={<Bath />} label="Baths" value={property.baths} />
          <Stat icon={<Sofa />} label="Reception" value={property.receptions} />
          <Stat
            icon={<Building2 />}
            label="Furnishing"
            value={property.furnishing}
            last
          />
        </div>

        {property.features.length > 0 ? (
          <section>
            <SectionTitle>Key features</SectionTitle>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {property.features.map((f) => (
                <span
                  key={f}
                  className="rounded-full border border-[#d9dee5] bg-[#f7f6f3] px-2.5 py-1 text-xs text-[#4f5f70]"
                >
                  {f}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="flex items-center justify-between gap-3">
            <SectionTitle>Captured live</SectionTitle>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs ${
                hasLive
                  ? "bg-[#fff5f4] text-[#e95650]"
                  : connected
                    ? "bg-[#eef0f2] text-[#697586]"
                    : "bg-[#f7f6f3] text-[#8a95a3]"
              }`}
            >
              {hasLive ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <Loader2
                  className={`size-3.5 ${connected ? "animate-spin" : ""}`}
                />
              )}
              {hasLive ? "Updating" : "Waiting"}
            </span>
          </div>

          {hasLive ? (
            <div className="mt-2 space-y-2">
              {hasCustomer ? (
                <LiveRow
                  icon={<User />}
                  label="Customer"
                  value={[
                    snapshot?.customer?.name,
                    snapshot?.customer?.phone,
                    snapshot?.customer?.email,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ) : null}
              {hasBooking ? (
                <LiveRow
                  icon={<CalendarCheck />}
                  label="Viewing booked"
                  value={`${snapshot?.booking?.date ?? ""} ${
                    snapshot?.booking?.time ?? ""
                  }`.trim()}
                />
              ) : null}
            </div>
          ) : (
            <div className="mt-2 rounded-md border border-dashed border-[#cdd3da] p-4 text-sm leading-relaxed text-[#697586]">
              Details you share with the agent — your contact info and any viewing
              you book — will appear here during the call.
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e95650]">
      {children}
    </h3>
  );
}

function Stat({
  icon,
  label,
  value,
  last,
}: {
  icon: React.ReactElement;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center px-1 text-center ${
        last ? "" : "border-r border-[#e4e7eb]"
      }`}
    >
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#8a95a3]">
        <span className="text-[#697586] [&_svg]:size-3">{icon}</span>
        {label}
      </span>
      <span className="mt-0.5 truncate whitespace-nowrap text-sm font-semibold text-[#13294b]">
        {value}
      </span>
    </div>
  );
}

function LiveRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactElement;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-[#d9dee5] bg-[#f7f6f3] p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-[#e95650]">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[#13294b]">{value}</p>
    </div>
  );
}
