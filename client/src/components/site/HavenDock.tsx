"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MotionConfig, motion } from "framer-motion";
import { BarChart3, Heart, Home, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { useShortlist } from "./shortlist";

/** Where "Ask Haven" should go from the current page, keeping its context. */
function havenHref(pathname: string) {
  const m = pathname.match(/^\/property\/([^/]+)/);
  return m ? `/haven?listing=${m[1]}` : "/haven";
}

const TABS = [
  { href: "/explore", label: "Homes", icon: Home, match: (p: string) => p.startsWith("/explore") || p.startsWith("/property") },
  { href: "/market", label: "Market", icon: BarChart3, match: (p: string) => p.startsWith("/market") },
  null, // Haven sits in the middle
  { href: "/facts", label: "Facts", icon: ShieldCheck, match: (p: string) => p.startsWith("/facts") },
  { href: "/explore?saved=1", label: "Saved", icon: Heart, match: () => false },
] as const;

/**
 * Site-wide Haven access, plus the app's reduced-motion setting:
 * - phones: a bottom tab bar with Haven in the centre
 * - larger screens: a floating "Ask Haven" orb
 * Hidden during a call; Haven's own page keeps only the tab bar.
 */
export function HavenDock({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { ids } = useShortlist();
  const hidden = pathname.startsWith("/call") || pathname.startsWith("/review");
  const onHaven = pathname.startsWith("/haven");
  const href = havenHref(pathname);

  return (
    <MotionConfig reducedMotion="user">
      {children}
      {hidden ? null : (
        <>
          {/* Spacer so page content clears the phone tab bar */}
          <div className="h-24 md:hidden" aria-hidden />

          {/* Desktop orb (not needed on Haven's own page) */}
          {onHaven ? null : (
          <Link
            href={href}
            aria-label="Ask Haven, the AI lettings agent"
            className="group fixed bottom-6 right-6 z-[1150] hidden items-center gap-3 rounded-full border py-2 pl-2 pr-5 shadow-lg backdrop-blur-xl transition-transform hover:-translate-y-0.5 md:flex"
            style={{ background: "var(--re-glass)", borderColor: "var(--re-line)", boxShadow: "var(--re-shadow)" }}
          >
            <span className="relative grid size-11 place-items-center">
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: "var(--re-pill)" }}
                animate={{ scale: [1, 1.25], opacity: [0.6, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
              />
              <span className="re-serif relative grid size-11 place-items-center rounded-full text-2xl italic" style={{ background: "var(--re-pill-strong)", color: "var(--re-accent-ink)" }}>
                H
              </span>
            </span>
            <span className="text-sm leading-tight">
              <span className="block font-semibold text-[var(--re-ink)]">Ask Haven</span>
              <span className="block text-xs text-[var(--re-muted)]">{href.includes("listing") ? "about this home" : "AI lettings agent"}</span>
            </span>
          </Link>
          )}

          {/* Phone tab bar */}
          <nav
            aria-label="Main"
            className="fixed inset-x-3 bottom-3 z-[1150] grid h-16 grid-cols-5 items-center rounded-[22px] border px-1 backdrop-blur-xl md:hidden"
            style={{ background: "var(--re-glass)", borderColor: "var(--re-line)", boxShadow: "var(--re-shadow)", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {TABS.map((t) => {
              if (!t) {
                return (
                  <Link key="haven" href={href} aria-label="Ask Haven" className="flex flex-col items-center">
                    <span className="re-serif -mt-7 grid size-14 place-items-center rounded-full text-3xl italic" style={{ background: "var(--re-pill-strong)", color: "var(--re-accent-ink)", boxShadow: "0 12px 30px -10px var(--re-pill-glow)", outline: "4px solid var(--re-bg)" }}>
                      H
                    </span>
                    <span className="mt-0.5 text-[10px] font-semibold">Haven</span>
                  </Link>
                );
              }
              const on = t.match(pathname);
              const Icon = t.icon;
              return (
                <Link key={t.label} href={t.href} className={cn("relative flex flex-col items-center gap-0.5 text-[10px] font-medium", on ? "text-[var(--re-ink)]" : "text-[var(--re-muted)]")}>
                  <Icon className="size-5" />
                  {t.label}
                  {t.label === "Saved" && ids.length ? (
                    <span className="absolute -top-1 right-[calc(50%-18px)] grid size-4 place-items-center rounded-full text-[9px] font-semibold text-white" style={{ background: "var(--re-warm)" }}>
                      {ids.length}
                    </span>
                  ) : null}
                  {on ? <motion.span layoutId="tab-dot" className="absolute -bottom-1.5 size-1 rounded-full" style={{ background: "var(--re-accent)" }} /> : null}
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </MotionConfig>
  );
}
