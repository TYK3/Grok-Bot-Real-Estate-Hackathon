"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Heart, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";
import { useShortlist } from "./shortlist";
import { useTheme } from "./theme";

const LINKS = [
  { href: "/", label: "Home", short: undefined as string | undefined },
  { href: "/explore", label: "Homes", short: undefined },
  { href: "/haven", label: "Haven", short: undefined },
  { href: "/market", label: "Market", short: undefined },
  { href: "/facts", label: "Fact checks", short: "Facts" },
];

/**
 * Floating glass navigation, the same on every page. With `overlay` (the
 * landing page) it takes no space, so the hero runs under it.
 */
export function SiteNav({ overlay = false }: { overlay?: boolean }) {
  const pathname = usePathname();
  const [theme, setTheme] = useTheme();
  const { ids } = useShortlist();

  return (
    <header className={cn("sticky top-0 z-[1100] px-3 pt-3 sm:px-6", overlay && "-mb-[68px]")}>
      <nav
        className="mx-auto flex h-14 max-w-7xl items-center gap-2 rounded-full border px-1.5 pl-4 text-[var(--re-ink)] shadow-[var(--re-shadow)] backdrop-blur-xl sm:px-2"
        style={{ background: "var(--re-glass)", borderColor: "var(--re-line)" }}
      >
        <Link href="/" aria-label="Ground Truth home" className="mr-1 flex shrink-0 items-center">
          <BrandLogo />
        </Link>

        <div className="hidden items-center md:flex">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative rounded-full px-2 py-2 text-sm font-medium transition-colors sm:px-4",
                  l.href === "/" && "hidden sm:block",
                  active ? "text-[var(--re-accent-ink)]" : "text-[var(--re-muted)] hover:text-[var(--re-ink)]",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "var(--re-pill)" }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative">
                  {l.short ? (
                    <>
                      <span className="sm:hidden">{l.short}</span>
                      <span className="hidden sm:inline">{l.label}</span>
                    </>
                  ) : (
                    l.label
                  )}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/explore?saved=1"
            className="relative hidden size-10 items-center justify-center rounded-full transition-colors hover:bg-[var(--re-surface-2)] md:inline-flex"
            aria-label={`Shortlist, ${ids.length} saved`}
          >
            <Heart className="size-[18px]" />
            {ids.length ? (
              <motion.span
                key={ids.length}
                initial={{ scale: 0.4 }}
                animate={{ scale: 1 }}
                className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold"
                style={{ background: "var(--re-warm)", color: "#fff" }}
              >
                {ids.length}
              </motion.span>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="relative inline-flex h-10 w-[72px] items-center rounded-full border p-1"
            style={{ borderColor: "var(--re-line)", background: "var(--re-surface-2)" }}
            aria-label={theme === "dark" ? "Switch to morning (light) theme" : "Switch to night (dark) theme"}
          >
            <motion.span
              className="absolute top-1 size-8 rounded-full"
              style={{ background: "var(--re-pill)" }}
              animate={{ left: theme === "dark" ? 36 : 4 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
            />
            <Sun className="relative z-10 ml-[7px] size-[18px]" style={{ color: theme === "light" ? "#2b2210" : "var(--re-muted)" }} />
            <Moon className="relative z-10 ml-auto mr-[7px] size-[18px]" style={{ color: theme === "dark" ? "#2b2210" : "var(--re-muted)" }} />
          </button>
        </div>
      </nav>
    </header>
  );
}
