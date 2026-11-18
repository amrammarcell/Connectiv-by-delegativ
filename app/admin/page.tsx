import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AddNumberForm } from "./add-number-form";
import { CreateWorkspaceForm } from "./create-workspace-form";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-sidebar px-7 py-4">
        <div className="flex items-center gap-3">
          <Brand />
          <span className="rounded-full bg-sidebar-accent px-2.5 py-1 text-xs font-semibold text-white">
            Admin Delegativ
          </span>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-white">
            Keluar
          </Button>
        </form>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-7">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat…</p>}>
          <AdminContent />
        </Suspense>
      </main>
    </div>
  );
}

async function AdminContent() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, nama, slug, dibuat_pada, memberships(count)")
    .order("dibuat_pada", { ascending: false })
    .returns<{ id: string; nama: string; slug: string; dibuat_pada: string; memberships: { count: number }[] }[]>();
  const { data: numbers } = await supabase
    .from("wa_numbers")
    .select("id, label, nomor_tampil, phone_number_id, status, terakhir_terima_pesan, workspaces(nama, slug)")
    .order("dibuat_pada", { ascending: false })
    .returns<
      {
        id: string;
        label: string;
        nomor_tampil: string | null;
        phone_number_id: string;
        status: string;
        terakhir_terima_pesan: string | null;
        workspaces: { nama: string; slug: string };
      }[]
    >();

  return (
    <>
      <section aria-labelledby="h-buat" className="rounded-xl border bg-card p-5">
        <h1 id="h-buat" className="text-lg font-bold">
          Buat workspace klien
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Satu workspace per klien. Stage pipeline default dibuat otomatis.
        </p>
        <CreateWorkspaceForm />
      </section>

      <section aria-labelledby="h-nomor" className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 id="h-nomor" className="text-base font-bold">
            Nomor WhatsApp ({numbers?.length ?? 0})
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pendaftaran manual untuk uji. Webhook yang tertunda karena nomor belum terdaftar diproses ulang otomatis.
          </p>
          <AddNumberForm workspaces={(workspaces ?? []).map((w) => ({ id: w.id, nama: w.nama }))} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Nomor</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5">Pesan terakhir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(numbers ?? []).map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="pl-5">
                    <div className="flex flex-col">
                      <span className="font-semibold">{n.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {n.nomor_tampil ?? "—"} · ID {n.phone_number_id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{n.workspaces.nama}</TableCell>
                  <TableCell>{n.status === "aktif" ? "Aktif" : "Terputus"}</TableCell>
                  <TableCell className="pr-5">
                    {n.terakhir_terima_pesan
                      ? new Date(n.terakhir_terima_pesan).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Jakarta",
                        })
                      : "Belum ada"}
                  </TableCell>
                </TableRow>
              ))}
              {!numbers?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Belum ada nomor terdaftar.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="h-daftar" className="rounded-xl border bg-card">
        <h2 id="h-daftar" className="border-b px-5 py-4 text-base font-bold">
          Semua workspace ({workspaces?.length ?? 0})
        </h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Workspace</TableHead>
                <TableHead>Anggota</TableHead>
                <TableHead>Dibuat</TableHead>
                <TableHead className="pr-5 text-right">
                  <span className="sr-only">Aksi</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(workspaces ?? []).map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="pl-5">
                    <div className="flex flex-col">
                      <span className="font-semibold">{w.nama}</span>
                      <span className="text-xs text-muted-foreground">/w/{w.slug}</span>
                    </div>
                  </TableCell>
                  <TableCell>{w.memberships[0]?.count ?? 0}</TableCell>
                  <TableCell>
                    {new Date(w.dibuat_pada).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Jakarta",
                    })}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Link href={`/w/${w.slug}/pengaturan`} className="text-sm font-semibold">
                      Buka
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {!workspaces?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Belum ada workspace.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </>
  );
}
