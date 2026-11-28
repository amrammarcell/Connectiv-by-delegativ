import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Peran } from "@/lib/types";
import { cn } from "@/lib/utils";
import { numberWarnings } from "@/lib/wa-health";
import { AddNumberForm, type WorkspaceMember } from "./add-number-form";
import { AdminHeader } from "./admin-header";
import { OpsAlerts } from "./ops-alerts";
import { AdAccountRow, AddAdAccountForm, type AdAccountItem } from "./ad-accounts";
import { CreateWorkspaceForm } from "./create-workspace-form";
import { DbSizeCard } from "./db-size-card";
import { ReprocessButton } from "./reprocess-button";

export const metadata: Metadata = { title: "Admin" };

// Server action "Proses ulang" webhook bisa berjalan lama (riwayat chat besar).
export const maxDuration = 300;

type WebhookStat = {
  sumber: string;
  total: number;
  tertunda: number;
  gagal: number;
  tertunda_terlama: string | null;
  diterima_terakhir: string | null;
  error_terakhir: string | null;
  error_terakhir_pada: string | null;
};

const SUMBER_LABEL: Record<string, string> = { dualhook: "Dualhook", meta: "App Meta", whatsapp: "App Meta (lama)" };

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
}

export default function AdminPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader active="/admin" />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-7">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat…</p>}>
          <AdminContent />
        </Suspense>
        <Suspense fallback={null}>
          <DbSizeCard />
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
    .select(
      "id, label, nomor_tampil, phone_number_id, status, status_alasan, terakhir_terima_pesan, tersambung_pada, workspaces(nama, slug)",
    )
    .order("dibuat_pada", { ascending: false })
    .returns<
      {
        id: string;
        label: string;
        nomor_tampil: string | null;
        phone_number_id: string;
        status: string;
        status_alasan: string | null;
        terakhir_terima_pesan: string | null;
        tersambung_pada: string;
        workspaces: { nama: string; slug: string };
      }[]
    >();

  // Balasan CS terakhir dari aplikasi (pesan keluar non-riwayat) per nomor,
  // untuk peringatan 14 hari Coexistence. Super Admin melihat semua pesan (RLS).
  const lastReplies = await Promise.all(
    (numbers ?? []).map(async (n) => {
      const { data } = await supabase
        .from("messages")
        .select("dikirim_pada")
        .eq("wa_number_id", n.id)
        .eq("arah", "keluar")
        .eq("dari_history", false)
        .order("dikirim_pada", { ascending: false })
        .limit(1)
        .maybeSingle<{ dikirim_pada: string }>();
      return data?.dikirim_pada ?? null;
    }),
  );
  const numberRows = (numbers ?? []).map((n, i) => {
    const terakhir_balasan_cs = lastReplies[i] ?? null;
    return { ...n, terakhir_balasan_cs, warnings: numberWarnings({ ...n, terakhir_balasan_cs }) };
  });

  // webhook_events tidak bisa dibaca sesi user; dibaca dengan secret key
  // setelah requireSuperAdmin di atas.
  const { data: statsData, error: webhookStatsError } = await createAdminClient().rpc("webhook_event_stats");
  const webhookStats = (statsData ?? []) as WebhookStat[];
  const pendingTotal = webhookStats.reduce((sum, w) => sum + Number(w.tertunda) + Number(w.gagal), 0);

  const { data: memberRows } = await supabase
    .from("memberships")
    .select("workspace_id, peran, profiles(id, nama, email)")
    .returns<{ workspace_id: string; peran: Peran; profiles: { id: string; nama: string | null; email: string } }[]>();
  const members: WorkspaceMember[] = (memberRows ?? []).map((m) => ({
    workspaceId: m.workspace_id,
    userId: m.profiles.id,
    nama: m.profiles.nama ?? m.profiles.email,
    peran: m.peran,
  }));

  const { data: adAccounts } = await supabase
    .from("ad_accounts")
    .select("id, meta_ad_account_id, nama, status_sync, terakhir_sync_pada, error_terakhir, workspaces(nama)")
    .order("dibuat_pada", { ascending: false })
    .returns<(Omit<AdAccountItem, "workspace"> & { workspaces: { nama: string } })[]>();

  return (
    <>
      <OpsAlerts />

      <section aria-labelledby="h-buat" className="rounded-xl border bg-card p-5">
        <h1 id="h-buat" className="text-lg font-bold">
          Buat workspace klien
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Satu workspace per klien. Stage pipeline default dibuat otomatis.
        </p>
        <CreateWorkspaceForm />
      </section>

      <section aria-labelledby="h-webhook" className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="h-webhook" className="text-base font-bold">
              Pemantauan webhook WhatsApp
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tertunda = belum diproses tanpa error. Gagal = belum diproses dengan error (termasuk nomor belum terdaftar).
              Proses ulang juga berjalan otomatis setiap hari.
            </p>
          </div>
          <ReprocessButton disabled={pendingTotal === 0} />
        </div>
        {webhookStatsError ? (
          <p role="alert" className="px-5 py-4 text-sm text-destructive">
            Statistik webhook gagal dimuat: {webhookStatsError.message}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Sumber</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Tertunda</TableHead>
                  <TableHead className="text-right">Gagal</TableHead>
                  <TableHead>Terakhir diterima</TableHead>
                  <TableHead className="pr-5">Error terakhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(webhookStats ?? []).map((w) => (
                  <TableRow key={w.sumber}>
                    <TableCell className="pl-5 font-semibold">{SUMBER_LABEL[w.sumber] ?? w.sumber}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(w.total).toLocaleString("id-ID")}</TableCell>
                    <TableCell
                      className={cn("text-right tabular-nums", Number(w.tertunda) > 0 && "font-semibold text-amber-700")}
                    >
                      {Number(w.tertunda).toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", Number(w.gagal) > 0 && "font-semibold text-destructive")}>
                      {Number(w.gagal).toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {w.diterima_terakhir ? formatDateTime(w.diterima_terakhir) : "—"}
                      {w.tertunda_terlama && (
                        <span className="block text-xs text-muted-foreground">
                          Tertunda sejak {formatDateTime(w.tertunda_terlama)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[320px] pr-5">
                      {w.error_terakhir ? (
                        <span className="flex flex-col">
                          <span className="text-xs break-all text-destructive">{w.error_terakhir}</span>
                          {w.error_terakhir_pada && (
                            <span className="text-xs text-muted-foreground">{formatDateTime(w.error_terakhir_pada)}</span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!webhookStats?.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Belum ada webhook diterima.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section aria-labelledby="h-nomor" className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 id="h-nomor" className="text-base font-bold">
            Nomor WhatsApp ({numbers?.length ?? 0})
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pendaftaran manual untuk uji. Webhook yang tertunda karena nomor belum terdaftar diproses ulang otomatis.
          </p>
          <AddNumberForm workspaces={(workspaces ?? []).map((w) => ({ id: w.id, nama: w.nama }))} members={members} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Nomor</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pesan terakhir</TableHead>
                <TableHead className="pr-5">Balasan CS dari aplikasi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {numberRows.map((n) => (
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
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className={cn("font-semibold", n.status === "aktif" ? "text-primary" : "text-destructive")}>
                        {n.status === "aktif" ? "Aktif" : "Terputus"}
                      </span>
                      {n.warnings.map((w) => (
                        <span
                          key={w.text}
                          className={cn("max-w-[280px] text-xs", w.level === "merah" ? "text-destructive" : "text-amber-700")}
                        >
                          ⚠ {w.text}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {n.terakhir_terima_pesan ? formatDateTime(n.terakhir_terima_pesan) : "Belum ada"}
                  </TableCell>
                  <TableCell className="pr-5 whitespace-nowrap">
                    {n.terakhir_balasan_cs ? formatDateTime(n.terakhir_balasan_cs) : "Belum ada"}
                  </TableCell>
                </TableRow>
              ))}
              {!numbers?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Belum ada nomor terdaftar.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="h-iklan" className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 id="h-iklan" className="text-base font-bold">
            Akun iklan Meta ({adAccounts?.length ?? 0})
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Spend harian per iklan ditarik otomatis setiap hari pukul 02.00 WIB. Butuh token system user dengan akses ads_read.
          </p>
          <AddAdAccountForm workspaces={(workspaces ?? []).map((w) => ({ id: w.id, nama: w.nama }))} />
        </div>
        <ul>
          {(adAccounts ?? []).map((a) => (
            <AdAccountRow key={a.id} account={{ ...a, workspace: a.workspaces.nama }} />
          ))}
          {!adAccounts?.length && <li className="px-5 py-6 text-center text-sm text-muted-foreground">Belum ada akun iklan.</li>}
        </ul>
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
