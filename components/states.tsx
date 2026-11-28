import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Status kosong, loading, dan error yang dipakai semua halaman workspace.

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      {children && <div className="max-w-sm text-[13px] text-muted-foreground">{children}</div>}
    </div>
  );
}

// Teks untuk pembaca layar saat skeleton tampil.
function LoadingLabel({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

export function InboxListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div>
      <LoadingLabel label="Memuat percakapan…" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3 border-b border-muted px-4 py-3.5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-4 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InboxShellSkeleton() {
  return (
    <section className="flex min-h-0 flex-1 flex-col border-r bg-card md:w-[380px] md:flex-none md:shrink-0">
      <div className="flex flex-col gap-3 border-b p-4">
        <Skeleton className="h-11 w-full rounded-[10px]" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      </div>
      <InboxListSkeleton />
    </section>
  );
}

export function ConversationSkeleton() {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <LoadingLabel label="Memuat percakapan…" />
      <div className="flex items-center gap-3 border-b bg-card px-4 py-3.5 sm:px-6">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-5 sm:px-6">
        {["w-1/2", "w-2/5 self-end", "w-3/5", "w-1/3 self-end", "w-1/2"].map((w, i) => (
          <Skeleton key={i} className={cn("h-12 rounded-2xl", w)} />
        ))}
      </div>
    </section>
  );
}

export function TableSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("m-4 rounded-xl border bg-card sm:m-7", className)}>
      <LoadingLabel label="Memuat…" />
      <div className="flex gap-3 border-b p-4">
        <Skeleton className="h-10 flex-1 rounded-[10px]" />
        <Skeleton className="h-10 w-32" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-5 py-3.5 last:border-0">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-4 w-20 sm:block" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

export function PipelineSkeleton() {
  return (
    <div className="flex gap-3.5 overflow-hidden px-4 pt-4 sm:px-7">
      <LoadingLabel label="Memuat pipeline…" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex w-[78vw] shrink-0 flex-col gap-2.5 rounded-2xl bg-[#eef1f4] p-2.5 sm:w-[230px]">
          <Skeleton className="h-5 w-24 bg-card" />
          {Array.from({ length: 3 - (i % 3) }, (_, j) => (
            <Skeleton key={j} className="h-24 rounded-xl bg-card" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-7">
      <LoadingLabel label="Menghitung dashboard…" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="flex max-w-3xl flex-col gap-5 p-4 sm:p-7">
      <LoadingLabel label="Memuat pengaturan…" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-44 rounded-xl" />
      ))}
    </div>
  );
}
