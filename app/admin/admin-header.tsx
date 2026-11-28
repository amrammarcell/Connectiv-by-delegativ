import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Ringkasan" },
  { href: "/admin/metrik", label: "Metrik pilot" },
  { href: "/admin/log-akses", label: "Log akses" },
] as const;

export type AdminSection = (typeof NAV)[number]["href"];

export function AdminHeader({ active }: { active: AdminSection }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 bg-sidebar px-4 py-4 sm:px-7">
      <div className="flex flex-wrap items-center gap-3">
        <Brand />
        <span className="rounded-full bg-sidebar-accent px-2.5 py-1 text-xs font-semibold text-white">
          Admin Delegativ
        </span>
        <nav aria-label="Menu admin" className="flex flex-wrap gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.href === active ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold text-sidebar-foreground hover:bg-sidebar-accent hover:text-white",
                item.href === active && "bg-sidebar-accent text-white",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <form action={signOut}>
        <Button type="submit" variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-white">
          Keluar
        </Button>
      </form>
    </header>
  );
}
