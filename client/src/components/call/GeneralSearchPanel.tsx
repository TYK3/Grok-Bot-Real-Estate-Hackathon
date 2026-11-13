"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BedDouble, Footprints, MapPin, Search } from "lucide-react";

import type { CallSnapshot, SearchResult } from "@/components/call/PropertyCallPanel";

// Default view: the listings area in East London.
const DEFAULT_CENTRE = { lat: 51.507, lon: -0.005 };

function mapUrl(focus?: SearchResult) {
  const lat = focus?.lat ?? DEFAULT_CENTRE.lat;
  const lon = focus?.lon ?? DEFAULT_CENTRE.lon;
  const d = focus?.lat != null ? 0.006 : 0.03;
  const bbox = [lon - d * 1.6, lat - d, lon + d * 1.6, lat + d].join(",");
  const marker = focus?.lat != null ? `&marker=${lat},${lon}` : "";
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik${marker}`;
}

export function GeneralSearchPanel({ snapshot }: { snapshot: CallSnapshot }) {
  const shortlist = snapshot?.search?.shortlist ?? [];
  const agentFocus = snapshot?.search?.focus_id;
  const [selected, setSelected] = useState<string | undefined>(agentFocus);

  // Follow the agent whenever it opens a new property.
  useEffect(() => {
    if (agentFocus) setSelected(agentFocus);
  }, [agentFocus]);

  const focus = shortlist.find((s) => s.id === selected) ?? shortlist[0];

  return (
    <aside className="flex min-h-0 flex-col gap-4 lg:max-h-[calc(100dvh-8rem)]">
      <div className="overflow-hidden rounded-lg border border-[var(--re-line)] bg-[var(--re-surface)] shadow-sm">
        <iframe
          key={focus?.id ?? "area"}
          title="Map"
          src={mapUrl(focus)}
          className="block h-[300px] w-full border-0 lg:h-[340px]"
          loading="lazy"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--re-line)] bg-[var(--re-surface)] p-4 shadow-sm">
        {focus ? (
          <div className="border-b border-[var(--re-line)] pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--re-warm)]">
              Now showing
            </p>
            <h2 className="font-heading mt-1 text-2xl leading-tight text-[var(--re-ink)]">
              {focus.title}
            </h2>
            <p className="mt-1 flex items-center gap-1 text-sm text-[var(--re-muted)]">
              <MapPin className="size-3.5 shrink-0 text-[var(--re-warm)]" />
              {focus.address}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--re-ink)]">
              <span className="text-lg font-semibold">{focus.price}</span>
              <span className="flex items-center gap-1">
                <BedDouble className="size-4 text-[var(--re-muted)]" />
                {focus.bedrooms ? `${focus.bedrooms} bed` : "Studio"}
                {focus.property_type ? ` ${focus.property_type}` : ""}
              </span>
            </div>
            {focus.nearest ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--re-accent)]">
                <Footprints className="size-4" />
                {focus.nearest}: about {focus.metres} m, ~{focus.walk_minutes} min walk
              </p>
            ) : null}
            <Link
              href={`/property/${encodeURIComponent(focus.id)}`}
              target="_blank"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--re-ink)] underline-offset-4 hover:underline"
            >
              Full details
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-[var(--re-muted)]">
            <Search className="size-6" />
            <p className="font-medium text-[var(--re-ink)]">Ask the agent what you want nearby</p>
            <p className="text-sm">
              “Which flats are closest to a supermarket?” · “Near a park under £2,500?” ·
              “Two beds by the DLR?”
            </p>
          </div>
        )}

        {shortlist.length > 1 ? (
          <ol className="mt-3 space-y-1">
            {shortlist.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelected(s.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                    s.id === focus?.id
                      ? "bg-[var(--re-ink)] text-[var(--re-bg)]"
                      : "text-[var(--re-ink)] hover:bg-[var(--re-bg)]"
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {i + 1}. {s.title} · {s.price}
                  </span>
                  <span className="shrink-0 text-xs opacity-80">~{s.walk_minutes} min</span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </aside>
  );
}
