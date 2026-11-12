"use client";

import { useMemo, useState } from "react";
import { Home, Search } from "lucide-react";

import { PropertyCard } from "@/components/PropertyCard";
import type { Property } from "@/lib/property-types";
import { cn } from "@/lib/utils";

type SortKey = "recent" | "price_asc" | "price_desc" | "beds_desc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Most recent" },
  { key: "price_asc", label: "Price: low to high" },
  { key: "price_desc", label: "Price: high to low" },
  { key: "beds_desc", label: "Most bedrooms" },
];

export function PropertyGrid({ listings }: { listings: Property[] }) {
  const [query, setQuery] = useState("");
  const [propertyType, setPropertyType] = useState<string | "all">("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const types = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of listings) {
      const t = l.property_type ?? "other";
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [listings]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = listings.filter((l) => {
      if (propertyType !== "all" && (l.property_type ?? "other") !== propertyType)
        return false;
      if (!q) return true;
      return (
        (l.address?.full ?? "").toLowerCase().includes(q) ||
        (l.address?.postcode ?? "").toLowerCase().includes(q) ||
        (l.property_type ?? "").toLowerCase().includes(q) ||
        (l.description ?? "").toLowerCase().includes(q)
      );
    });

    const sorted = [...filtered];
    switch (sort) {
      case "price_asc":
        sorted.sort((a, b) => (a.price_value ?? 0) - (b.price_value ?? 0));
        break;
      case "price_desc":
        sorted.sort((a, b) => (b.price_value ?? 0) - (a.price_value ?? 0));
        break;
      case "beds_desc":
        sorted.sort((a, b) => (b.bedrooms ?? 0) - (a.bedrooms ?? 0));
        break;
      default:
        // Verified listings stay on top, then most recent first.
        sorted.sort(
          (a, b) =>
            Number(Boolean(b.verified_fields)) - Number(Boolean(a.verified_fields)) ||
            (b.live_date ?? "").localeCompare(a.live_date ?? ""),
        );
    }
    return sorted;
  }, [listings, query, propertyType, sort]);

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-4 border-b border-[#d9dee5] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={propertyType === "all"}
            onClick={() => setPropertyType("all")}
            label="All"
            count={listings.length}
          />
          {types.map(([type, count]) => (
            <FilterChip
              key={type}
              active={propertyType === type}
              onClick={() =>
                setPropertyType((cur) => (cur === type ? "all" : type))
              }
              label={type.charAt(0).toUpperCase() + type.slice(1)}
              count={count}
            />
          ))}
        </div>

        <div className="flex w-full items-center gap-2 lg:w-auto">
          <div className="flex h-10 flex-1 items-center gap-2 rounded-md border border-[#d9dee5] bg-white px-3 transition-colors focus-within:border-[#13294b] lg:flex-none">
            <Search className="size-4 shrink-0 text-[#697586]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search area, postcode, type..."
              aria-label="Search properties"
              className="w-full min-w-0 bg-transparent text-sm text-[#13294b] placeholder:text-[#8a95a3] focus:outline-none lg:w-64"
            />
          </div>
          <label className="sr-only" htmlFor="sort-properties">
            Sort properties
          </label>
          <select
            id="sort-properties"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-10 shrink-0 cursor-pointer rounded-md border border-[#d9dee5] bg-white px-3 text-sm text-[#13294b] transition-colors hover:border-[#b8c0ca] focus:border-[#13294b] focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-lg border border-dashed border-[#cdd3da] bg-white py-16 text-center">
          <Home className="size-7 text-[#8a95a3]" />
          <p className="text-sm text-[#697586]">
            No properties match your filters.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 pb-6">
          {visible.map((listing) => (
            <PropertyCard key={listing.property_id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
        active
          ? "border-[#13294b] bg-[#13294b] text-white"
          : "border-[#d9dee5] bg-white text-[#4f5f70] hover:border-[#13294b] hover:text-[#13294b]",
      )}
    >
      {label}
      <span
        className={cn(
          "tabular-nums",
          active ? "text-white/75" : "text-[#8a95a3]",
        )}
      >
        {count}
      </span>
    </button>
  );
}
