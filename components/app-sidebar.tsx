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
import { Brand, LogoMark } from "@/components/brand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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

function userInitials(displayName: string) {
  return displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

function WorkspaceMenu({ workspace, workspaces, user, compact = false }: Omit<Props, "peran"> & { compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex min-h-11 items-center justify-between gap-2 rounded-[10px] border border-sidebar-border bg-[#172726] text-left text-sm text-[#e7efee] outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          compact ? "min-w-0 flex-1 px-2.5 py-1.5" : "w-full px-3 py-2.5",
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          {!compact && <span className="text-[11px] text-[#9db5b2]">Workspace</span>}
          <span className="truncate font-semibold">{workspace.nama}</span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0" />
        {compact && <span className="sr-only">Ganti workspace</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Ganti workspace</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.slug} render={<Link href={`/w/${w.slug}/inbox`} />}>
              <span className="flex-1 truncate">{w.nama}</span>
              {w.slug === workspace.slug && <Check aria-hidden className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
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
  );
}

function UserMenu({ user, peran, compact = false }: Pick<Props, "user" | "peran"> & { compact?: boolean }) {
  const displayName = user.nama ?? user.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={compact ? `Akun ${displayName}` : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-[10px] text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          compact ? "size-11 shrink-0 justify-center" : "mt-auto min-h-12 w-full border-t border-sidebar-border px-2 pt-3",
        )}
      >
        <span className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-[#f5c26b] text-[13px] font-bold text-[#3d2a06]">
          {userInitials(displayName)}
        </span>
        {!compact && (
          <span className="flex min-w-0 flex-col gap-0.5 text-[13px]">
            <span className="truncate font-semibold text-white">{displayName}</span>
            <span className="text-xs text-[#9db5b2]">{peran ? PERAN_LABEL[peran] : "Super Admin"}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">
            {compact ? `${displayName} · ${peran ? PERAN_LABEL[peran] : "Super Admin"}` : user.email}
          </DropdownMenuLabel>
          <DropdownMenuItem render={<Link href="/akun" />}>
            <KeyRound aria-hidden className="size-4" />
            Ganti password
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOut aria-hidden className="size-4" />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useActive(slug: string) {
  const pathname = usePathname();
  return (segment: string) => pathname.startsWith(`/w/${slug}/${segment}`);
}

// Laptop/tablet (≥ md): sidebar gelap penuh di kiri.
export function AppSidebar({ workspace, workspaces, user, peran }: Props) {
  const isActive = useActive(workspace.slug);
  return (
    <nav
      aria-label="Navigasi utama"
      className="hidden flex-col gap-5 bg-sidebar px-3.5 py-5 text-sidebar-foreground md:sticky md:top-0 md:flex md:h-screen md:w-58 md:shrink-0"
    >
      <Brand className="px-2" />
      <WorkspaceMenu workspace={workspace} workspaces={workspaces} user={user} />
      <ul className="flex flex-col gap-1">
        {NAV.map(({ segment, label, icon: Icon }) => {
          const active = isActive(segment);
          return (
            <li key={segment}>
              <Link
                href={`/w/${workspace.slug}/${segment}`}
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
      <UserMenu user={user} peran={peran} />
    </nav>
  );
}

// HP (< md): bar atas ringkas (workspace + akun).
export function MobileTopBar({ workspace, workspaces, user, peran }: Props) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 bg-sidebar px-3 py-2 text-sidebar-foreground md:hidden">
      <LogoMark tone="dark" className="size-7" />
      <span className="sr-only">Connectiv</span>
      <WorkspaceMenu workspace={workspace} workspaces={workspaces} user={user} compact />
      <UserMenu user={user} peran={peran} compact />
    </div>
  );
}

// HP (< md): menu bawah dengan lima tujuan utama.
export function MobileBottomNav({ slug }: { slug: string }) {
  const isActive = useActive(slug);
  return (
    <nav
      aria-label="Navigasi utama"
      className="shrink-0 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV.map(({ segment, label, icon: Icon }) => {
          const active = isActive(segment);
          return (
            <li key={segment}>
              <Link
                href={`/w/${slug}/${segment}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", active && "bg-accent")}>
                  <Icon aria-hidden className="size-5" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
