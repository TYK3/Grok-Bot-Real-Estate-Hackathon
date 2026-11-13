import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Ground Truth mark: a shield holding a check (a verified fact), with two
 * voice waves breaking out of its shoulder (Haven, the voice agent).
 */
export function BrandMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 48 44" className={cn("size-7", className)} aria-hidden>
      <defs>
        <linearGradient id={`ctg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e8c6" />
          <stop offset="1" stopColor="#c99a4b" />
        </linearGradient>
      </defs>
      <path
        d="M20 3.5 33 8.6c.9.4 1.5 1.2 1.5 2.2V21c0 9.6-6.1 16.7-13.6 19.3a2.7 2.7 0 0 1-1.8 0C11.6 37.7 5.5 30.6 5.5 21V10.8c0-1 .6-1.8 1.5-2.2Z"
        fill={`url(#ctg-${id})`}
      />
      <path d="M13.2 21.6 18 26.4l9.4-9.8" fill="none" stroke="#17261f" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38.6 12.2a8 8 0 0 1 0 9.6" fill="none" stroke="var(--re-accent)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M42.8 8.4a14 14 0 0 1 0 17.2" fill="none" stroke="var(--re-accent)" strokeWidth="2.6" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

/** Mark plus wordmark. `compact` hides the words on very small screens. */
export function BrandLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark />
      <span className={cn("whitespace-nowrap text-[17px] font-medium tracking-tight", compact && "hidden min-[380px]:inline")}>
        Ground <span className="re-serif text-[19px] italic text-[var(--re-accent)]">Truth</span>
      </span>
    </span>
  );
}
