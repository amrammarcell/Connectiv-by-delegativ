"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  ChartColumn,
  ChevronsUpDown,
  Inbox,
  SlidersHorizontal,
  SquareKanban,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { segment: "inbox", label: "Inbox", icon: Inbox },
  { segment: "pipeline", label: "Pipeline", icon: SquareKanban },
  { segment: "kontak", label: "Kontak", icon: Users },
  { segment: "dashboard", label: "Dashboard", icon: ChartColumn },
  { segment: "pengaturan", label: "Pengaturan", icon: SlidersHorizontal },
] as const;

export function AppSidebar() {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi utama"
      className="flex flex-col gap-5 bg-sidebar px-3.5 py-5 text-sidebar-foreground md:min-h-screen md:w-58 md:shrink-0"
    >
      <div className="flex items-center gap-2.5 px-2">
        <div className="flex size-8 items-center justify-center rounded-[9px] bg-sidebar-primary text-[17px] font-bold text-sidebar-primary-foreground">
          C
        </div>
        <span className="text-lg font-bold tracking-tight text-white">
          Connectiv
        </span>
      </div>

      {/* Pemilih workspace diaktifkan di Sprint 1. */}
      <button
        type="button"
        className="flex min-h-11 items-center justify-between gap-2 rounded-[10px] border border-sidebar-border bg-[#172726] px-3 py-2.5 text-left text-sm text-[#e7efee]"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-[11px] text-[#9db5b2]">Workspace</span>
          <span className="font-semibold">{slug}</span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4" />
      </button>

      <ul className="flex flex-col gap-1">
        {NAV.map(({ segment, label, icon: Icon }) => {
          const href = `/w/${slug}/${segment}`;
          const active = pathname.startsWith(href);
          return (
            <li key={segment}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/60 hover:text-white",
                )}
              >
                <Icon aria-hidden className="size-[18px]" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
