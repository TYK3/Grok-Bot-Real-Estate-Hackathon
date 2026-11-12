import Link from "next/link";
import type { ReactNode } from "react";
import { MapPin } from "lucide-react";

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#d9dee5] bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <Link href="/" className="flex items-center gap-4 text-[#13294b]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e95650]">
              AI lettings
            </p>
            <h1
              className="font-heading text-3xl leading-none sm:text-4xl"
            >
              Hamptons
            </h1>
          </div>
        </Link>
        <div className="flex flex-wrap items-center gap-3 text-[#697586]">
          {children}
          <Link
            href="/call/general"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#e95650] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#d94c46]"
          >
            <MapPin className="size-3.5" />
            Find homes near…
          </Link>
        </div>
      </div>
    </header>
  );
}
