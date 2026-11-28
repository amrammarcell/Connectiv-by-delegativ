import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AdminHeader } from "../admin-header";

export const metadata: Metadata = { title: "Log akses Super Admin" };

const LIMIT = 200;

type LogRow = {
  id: number;
  user_email: string;
  workspace_id: string | null;
  workspace_slug: string;
  path: string;
  aksi: "lihat" | "aksi";
  pada: string;
};

export default function Page({ searchParams }: PageProps<"/admin/log-akses">) {
  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader active="/admin/log-akses" />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-7">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat…</p>}>
          <LogContent searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function LogContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSuperAdmin();
  const query = await searchParams;
  const supabase = await createClient();
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, nama, slug")
    .order("nama")
    .returns<{ id: string; nama: string; slug: string }[]>();
  const selected = (workspaces ?? []).find((w) => w.slug === query.ws);

  // RLS: hanya Super Admin yang bisa membaca; tidak ada yang bisa mengubah.
  let logQuery = supabase
    .from("admin_access_log")
    .select("id, user_email, workspace_id, workspace_slug, path, aksi, pada")
    .order("pada", { ascending: false })
    .limit(LIMIT);
  if (selected) logQuery = logQuery.eq("workspace_id", selected.id);
  const { data: rows, error } = await logQuery.returns<LogRow[]>();
  const names = new Map((workspaces ?? []).map((w) => [w.id, w.nama]));

  return (
    <section aria-labelledby="h-log" className="rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b px-5 py-4">
        <div>
          <h1 id="h-log" className="text-base font-bold">
            Log akses Super Admin
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Setiap kali Super Admin membuka atau mengubah data workspace klien yang bukan workspace-nya sendiri. Membuka
            halaman yang sama dalam 1 menit dicatat sekali. Log tidak bisa diubah atau dihapus dari aplikasi. Menampilkan{" "}
            {LIMIT} entri terbaru.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter workspace">
          <FilterLink href="/admin/log-akses" active={!selected}>
            Semua
          </FilterLink>
          {(workspaces ?? []).map((w) => (
            <FilterLink key={w.id} href={`/admin/log-akses?ws=${encodeURIComponent(w.slug)}`} active={w.id === selected?.id}>
              {w.nama}
            </FilterLink>
          ))}
        </div>
      </div>
      {error ? (
        <p role="alert" className="px-5 py-4 text-sm text-destructive">
          Log gagal dimuat: {error.message}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Waktu</TableHead>
                <TableHead>Super Admin</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Halaman</TableHead>
                <TableHead className="pr-5">Jenis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-5 whitespace-nowrap">
                    {new Date(r.pada).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "medium",
                      timeZone: "Asia/Jakarta",
                    })}
                  </TableCell>
                  <TableCell>{r.user_email}</TableCell>
                  <TableCell>
                    {(r.workspace_id && names.get(r.workspace_id)) ?? (
                      <span className="text-muted-foreground">{r.workspace_slug} (dihapus)</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[280px] font-mono text-xs break-all">{r.path}</TableCell>
                  <TableCell className={cn("pr-5", r.aksi === "aksi" && "font-semibold text-amber-700")}>
                    {r.aksi === "aksi" ? "Mengubah data" : "Melihat"}
                  </TableCell>
                </TableRow>
              ))}
              {!rows?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Belum ada akses tercatat.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-sm font-semibold",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}
