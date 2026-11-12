"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Bath, BedDouble, Check, GitCompareArrows, Heart, MapPin, Mic, ShieldCheck } from "lucide-react";

import { PropertyImage } from "@/components/PropertyImage";
import type { ListingSummary } from "@/lib/listing-summary";
import { bedsShort, typeColor } from "@/lib/listing-summary";
import { cn } from "@/lib/utils";

/** Listing card: pointer spotlight, gentle tilt, save and compare toggles. */
export function HomeCard({
  listing,
  index = 0,
  active = false,
  saved,
  comparing,
  onSave,
  onCompare,
  onHover,
  compact = false,
}: {
  listing: ListingSummary;
  index?: number;
  active?: boolean;
  saved: boolean;
  comparing?: boolean;
  onSave: (id: string) => void;
  onCompare?: (id: string) => void;
  onHover?: (id: string | null) => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const href = `/property/${encodeURIComponent(listing.id)}`;

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
    el.style.transform = `perspective(1100px) rotateX(${(0.5 - py) * 4}deg) rotateY(${(px - 0.5) * 6}deg)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "";
    onHover?.(null);
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ duration: 0.4, delay: Math.min(index, 9) * 0.035, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerEnter={() => onHover?.(listing.id)}
        onPointerLeave={onLeave}
        className={cn(
          "re-card re-spot group flex h-full flex-col overflow-hidden transition-transform duration-300 ease-out",
          active && "ring-2 ring-[var(--re-accent)]",
        )}
        style={{ boxShadow: active ? "var(--re-shadow)" : undefined }}
      >
        <div className={cn("relative overflow-hidden", compact ? "aspect-[16/10]" : "aspect-[4/3]")}>
          <Link href={href} aria-label={`Open ${listing.title}, ${listing.address}`}>
            <PropertyImage
              src={listing.image}
              alt={listing.title}
              className="h-full w-full"
              imgClassName="transition-transform duration-700 ease-out group-hover:scale-[1.06]"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/0 to-black/10" />
          </Link>

          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#14202f]">
              <span className="size-2 rounded-full" style={{ background: typeColor(listing.type) }} />
              {listing.type}
            </span>
            {listing.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1c2316]">
                <ShieldCheck className="size-3" /> Fact-checked
              </span>
            ) : null}
            {listing.pendingChecks ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#b8711f] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                {listing.pendingChecks} pending
              </span>
            ) : null}
          </div>

          <div className="absolute right-3 top-3 flex gap-1.5">
            {onCompare ? (
              <IconToggle
                on={Boolean(comparing)}
                onClick={() => onCompare(listing.id)}
                label={comparing ? "Remove from compare" : "Add to compare"}
              >
                {comparing ? <Check className="size-4" /> : <GitCompareArrows className="size-4" />}
              </IconToggle>
            ) : null}
            <IconToggle on={saved} onClick={() => onSave(listing.id)} label={saved ? "Remove from shortlist" : "Save to shortlist"}>
              <motion.span key={String(saved)} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 15 }}>
                <Heart className="size-4" fill={saved ? "currentColor" : "none"} />
              </motion.span>
            </IconToggle>
          </div>

          <p className="pointer-events-none absolute bottom-3 left-4 text-[26px] font-medium leading-none tracking-tight text-white drop-shadow">
            £{listing.price.toLocaleString("en-GB")}
            <span className="ml-1 text-xs font-normal text-white/75">{listing.deal === "let" ? "pcm" : "guide"}</span>
          </p>
        </div>

        <div className="relative z-[4] flex flex-1 flex-col gap-3 p-4">
          <div className="min-w-0">
            <Link href={href} className="re-serif block truncate text-[22px] leading-tight hover:underline">
              {listing.title}
            </Link>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--re-muted)]">
              <MapPin className="size-3.5 shrink-0" style={{ color: "var(--re-warm)" }} />
              <span className="truncate">{listing.address}</span>
            </p>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <BedDouble className="size-4 text-[var(--re-muted)]" /> {bedsShort(listing.bedrooms)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Bath className="size-4 text-[var(--re-muted)]" /> {listing.bathrooms} bath
            </span>
            <span className="ml-auto text-xs capitalize text-[var(--re-muted)]">{listing.furnishing}</span>
          </div>

          {!compact ? (
            <div className="mt-auto flex gap-2 pt-1">
              <Link href={href} className="re-btn re-btn-ghost h-10 flex-1 px-3 text-sm">
                Details <ArrowUpRight className="size-3.5" />
              </Link>
              <Link href={`/call/${encodeURIComponent(listing.id)}`} className="re-btn re-btn-primary h-10 flex-1 px-3 text-sm">
                <Mic className="size-3.5" /> Ask agent
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </motion.article>
  );
}

function IconToggle({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full backdrop-blur-md transition-all hover:scale-110",
        on ? "bg-[#e2ee9f] text-[#1c2316]" : "bg-black/35 text-white hover:bg-black/55",
      )}
    >
      {children}
    </button>
  );
}
