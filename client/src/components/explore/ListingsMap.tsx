"use client";

import { useEffect, useRef } from "react";
import type { Map as LMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

import type { ListingSummary } from "@/lib/listing-summary";
import { shortMoney } from "@/lib/listing-summary";

/**
 * Leaflet map with price pins. Hovering a card highlights its pin and
 * hovering a pin highlights the card; clicking a pin selects the home.
 */
export default function ListingsMap({
  listings,
  activeId,
  onHover,
  onSelect,
}: {
  listings: ListingSummary[];
  activeId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const handlers = useRef({ onHover, onSelect });
  handlers.current = { onHover, onSelect };

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, {
        zoomControl: false,
        scrollWheelZoom: true,
        attributionControl: true,
      }).setView([51.505, -0.02], 13);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      syncMarkers();
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncMarkers = () => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const keep = new Set<string>();
    const pts: [number, number][] = [];
    for (const l of listings) {
      if (l.lat == null || l.lng == null) continue;
      keep.add(l.id);
      pts.push([l.lat, l.lng]);
      if (markersRef.current.has(l.id)) continue;
      const icon = L.divIcon({
        className: "re-pin-wrap",
        html: `<span class="re-pin" data-id="${l.id}">${shortMoney(l.price)}</span>`,
        iconSize: [0, 0],
      });
      const m = L.marker([l.lat, l.lng], { icon, riseOnHover: true, keyboard: true, title: `${l.title}, ${l.priceLabel}` })
        .addTo(map)
        .on("mouseover", () => handlers.current.onHover(l.id))
        .on("mouseout", () => handlers.current.onHover(null))
        .on("click", () => handlers.current.onSelect(l.id));
      markersRef.current.set(l.id, m);
    }
    for (const [id, m] of markersRef.current) {
      if (!keep.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15), { animate: true, maxZoom: 15 });
  };

  useEffect(() => {
    syncMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings]);

  useEffect(() => {
    for (const [id, m] of markersRef.current) {
      const el = m.getElement()?.querySelector(".re-pin");
      el?.classList.toggle("is-active", id === activeId);
      m.setZIndexOffset(id === activeId ? 1000 : 0);
    }
  }, [activeId, listings]);

  return <div ref={elRef} className="re-map h-full w-full" aria-label="Map of listings" />;
}
