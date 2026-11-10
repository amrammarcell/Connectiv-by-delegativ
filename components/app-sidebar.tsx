"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  Check,
  ChevronsUpDown,
  Inbox,
  KeyRound,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  SquareKanban,
  Users,
} from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MyWorkspace } from "@/lib/auth";
import { PERAN_LABEL, type Peran } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { segment: "inbox", label: "Inbox", icon: Inbox },
  { segment: "pipeline", label: "Pipeline", icon: SquareKanban },
  { segment: "kontak", label: "Kontak", icon: Users },
  { segment: "dashboard", label: "Dashboard", icon: ChartColumn },
  { segment: "pengaturan", label: "Pengaturan", icon: SlidersHorizontal },
] as const;

type Props = {
  workspace: { nama: string; slug: string };
  workspaces: MyWorkspace[];
  user: { nama: string | null; email: string; isSuperAdmin: boolean };
  peran: Peran | null;
};

export function AppSidebar({ workspace, workspaces, user, peran }: Props) {
  const pathname = usePathname();
  const displayName = user.nama ?? user.email;
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <nav
      aria-label="Navigasi utama"
      className="flex flex-col gap-5 bg-sidebar px-3.5 py-5 text-sidebar-foreground md:min-h-screen md:w-58 md:shrink-0"
    >
      <Brand className="px-2" />

      <DropdownMenu>
        <DropdownMenuTrigger className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[10px] border border-sidebar-border bg-[#172726] px-3 py-2.5 text-left text-sm text-[#e7efee] outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11px] text-[#9db5b2]">Workspace</span>
            <span className="truncate font-semibold">{workspace.nama}</span>
          </span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Ganti workspace</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.slug} render={<Link href={`/w/${w.slug}/inbox`} />}>
              <span className="flex-1 truncate">{w.nama}</span>
              {w.slug === workspace.slug && <Check aria-hidden className="size-4" />}
            </DropdownMenuItem>
          ))}
          {user.isSuperAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/admin" />}>
                <ShieldCheck aria-hidden className="size-4" />
                Admin Delegativ
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ul className="flex flex-col gap-1">
        {NAV.map(({ segment, label, icon: Icon }) => {
          const href = `/w/${workspace.slug}/${segment}`;
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

      <DropdownMenu>
        <DropdownMenuTrigger className="mt-auto flex min-h-12 w-full items-center gap-2.5 rounded-[10px] border-t border-sidebar-border px-2 pt-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-[#f5c26b] text-[13px] font-bold text-[#3d2a06]">
            {initials}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 text-[13px]">
            <span className="truncate font-semibold text-white">{displayName}</span>
            <span className="text-xs text-[#9db5b2]">{peran ? PERAN_LABEL[peran] : "Super Admin"}</span>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
          <DropdownMenuItem render={<Link href="/akun" />}>
            <KeyRound aria-hidden className="size-4" />
            Ganti password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut aria-hidden className="size-4" />
            Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
