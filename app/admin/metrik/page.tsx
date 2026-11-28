import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/auth";
import {
  computePilotMetrics,
  parsePilotRange,
  PILOT_RANGES,
  pilotDateRange,
  visitRows,
  type Metric,
  type PilotRangeKey,
  type PilotRaw,
} from "@/lib/pilot-metrics";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AdminHeader } from "../admin-header";

export const metadata: Metadata = { title: "Metrik pilot" };

const PERAN_LABEL: Record<string, string> = { owner: "Owner", supervisor: "Supervisor" };

const fmtDate = (v: string) =>
  new Date(`${v}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
const fmtDateTime = (v: string) =>
  new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export default function Page({ searchParams }: PageProps<"/admin/metrik">) {
  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader active="/admin/metrik" />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-7">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Menghitung…</p>}>
          <MetricsContent searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

function href(ws: string, rentang: PilotRangeKey) {
  return `/admin/metrik?ws=${encodeURIComponent(ws)}&rentang=${rentang}`;
}

async function MetricsContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSuperAdmin();
  const query = await searchParams;
  const supabase = await createClient();
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, nama, slug")
    .order("nama")
    .returns<{ id: string; nama: string; slug: string }[]>();

  const list = workspaces ?? [];
  const selected = list.find((w) => w.slug === query.ws) ?? list[0];
  const rentang = parsePilotRange(query.rentang);
  const { dari, sampai, days } = pilotDateRange(rentang);

  if (!selected) {
    return <p className="text-sm text-muted-foreground">Belum ada workspace.</p>;
  }

  // pilot_metrics membaca webhook_events (tidak terlihat oleh sesi user), jadi
  // dipanggil dengan secret key setelah requireSuperAdmin di atas.
  const { data, error } = await createAdminClient().rpc("pilot_metrics", { ws: selected.id, dari, sampai });
  const raw = data as PilotRaw | null;

  return (
    <>
      <section className="flex flex-col gap-3">
        <div>
          <h1 className="text-lg font-bold">Metrik pilot</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Target keberhasilan pilot (PRD §2.8) per workspace, {fmtDate(dari)} – {fmtDate(sampai)} (WIB).
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Workspace">
          {list.map((w) => (
            <Pill key={w.id} href={href(w.slug, rentang)} active={w.id === selected.id}>
              {w.nama}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Rentang">
          {(Object.keys(PILOT_RANGES) as PilotRangeKey[]).map((k) => (
            <Pill key={k} href={href(selected.slug, k)} active={k === rentang}>
              {PILOT_RANGES[k]}
            </Pill>
          ))}
        </div>
      </section>

      {error || !raw ? (
        <p role="alert" className="rounded-xl border bg-card p-5 text-sm text-destructive">
          Metrik gagal dihitung: {error?.message ?? "tidak ada data"}
        </p>
      ) : (
        <MetricsBody raw={raw} days={days} />
      )}
    </>
  );
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
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

const STATUS_STYLE: Record<Metric["status"], { label: string; className: string }> = {
  hijau: { label: "Tercapai", className: "bg-primary/10 text-primary" },
  merah: { label: "Belum tercapai", className: "bg-destructive/10 text-destructive" },
  kosong: { label: "Belum ada data", className: "bg-muted text-muted-foreground" },
};

function MetricsBody({ raw, days }: { raw: PilotRaw; days: number }) {
  const metrics = computePilotMetrics(raw, days);
  const visits = visitRows(raw, days);
  const n = (v: unknown) => Number(v ?? 0).toLocaleString("id-ID");

  return (
    <>
      <section aria-label="Ringkasan metrik" className="grid gap-3 sm:grid-cols-2">
        {metrics.map((m) => (
          <div
            key={m.key}
            className={cn(
              "rounded-xl border bg-card p-5",
              m.status === "hijau" && "border-primary/40",
              m.status === "merah" && "border-destructive/40",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{m.label}</h2>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[m.status].className)}>
                {STATUS_STYLE[m.status].label}
              </span>
            </div>
            <p
              className={cn(
                "mt-2 text-3xl font-bold tabular-nums",
                m.status === "hijau" && "text-primary",
                m.status === "merah" && "text-destructive",
              )}
            >
              {m.display}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Target {m.target} · {m.basis}
            </p>
          </div>
        ))}
      </section>

      <section aria-labelledby="h-cara" className="rounded-xl border bg-card p-5 text-sm">
        <h2 id="h-cara" className="text-base font-bold">
          Cara menghitung
        </h2>
        <dl className="mt-3 flex flex-col gap-3">
          <div>
            <dt className="font-semibold">Pesan ter-mirror</dt>
            <dd className="text-muted-foreground">
              Setiap ID pesan yang dikirim Meta lewat webhook untuk nomor workspace ini (pesan masuk, echo balasan CS dari HP,
              dan riwayat chat) dicocokkan dengan tabel pesan. Pesan sistem, edit, dan revoke tidak dihitung. Hanya webhook
              90 hari terakhir yang masih tersimpan. Pesan yang tidak pernah dikirim Meta (mis. HP lama tidak membuka
              aplikasi, grup) tidak terlihat dari server: lengkapi dengan cek sampel manual, bandingkan 10 chat di HP dengan
              Inbox setiap minggu.
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              Pesan live (tanpa riwayat): {n(raw.mirror.tersimpan_live)} dari {n(raw.mirror.dikirim_meta_live)} tersimpan ·
              Event webhook: {n(raw.mirror.event_total)} ({n(raw.mirror.event_belum_diproses)} belum diproses) · Tersimpan di
              rentang: {n(raw.mirror.pesan.masuk)} masuk, {n(raw.mirror.pesan.keluar)} keluar.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Chat ditandai Closing/Lost</dt>
            <dd className="text-muted-foreground">
              Kontak yang dibuat di rentang ini dan punya minimal satu pesan baru (bukan impor riwayat), dibanding yang pernah
              ditandai Closing atau Lost. Chat yang baru masuk belum sempat ditandai, jadi angka beberapa hari terakhir
              cenderung lebih rendah.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Chat CTWA terkait ID iklan</dt>
            <dd className="text-muted-foreground">
              Pelanggan yang chat pertamanya membawa referral iklan dengan ID iklan, dibanding jumlah percakapan yang
              dilaporkan Meta Ads (messaging conversations started) di rentang yang sama. Tanpa data Meta Ads, pembaginya
              adalah pelanggan yang membawa referral apa pun. Angka Meta memakai atribusi 7 hari, jadi rasio ini perkiraan.
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              Kontak baru dari iklan: {n(raw.ctwa.kontak_ctwa)} ({n(raw.ctwa.kontak_ctwa_iklan_dikenal)} iklannya sudah
              tersinkron dari Meta) · Akun iklan aktif: {n(raw.ctwa.akun_iklan_aktif)}.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Owner/Supervisor buka dashboard</dt>
            <dd className="text-muted-foreground">
              Setiap kali Owner atau Supervisor membuka Dashboard tercatat, maksimal sekali per 30 menit. Rata-rata per minggu
              = kunjungan ÷ (hari ÷ 7). Kunjungan Super Admin tidak dihitung.
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="h-kunjungan" className="rounded-xl border bg-card">
        <h2 id="h-kunjungan" className="border-b px-5 py-4 text-base font-bold">
          Kunjungan dashboard
        </h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Nama</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead className="text-right">Kunjungan</TableHead>
                <TableHead className="text-right">Per minggu</TableHead>
                <TableHead className="pr-5">Terakhir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.map((v) => (
                <TableRow key={v.user_id}>
                  <TableCell className="pl-5 font-semibold">{v.nama}</TableCell>
                  <TableCell>{PERAN_LABEL[v.peran] ?? v.peran}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.kunjungan.toLocaleString("id-ID")}</TableCell>
                  <TableCell
                    className={cn("text-right font-semibold tabular-nums", v.memenuhi ? "text-primary" : "text-destructive")}
                  >
                    {v.perMinggu.toLocaleString("id-ID", { maximumFractionDigits: 1 })}x
                  </TableCell>
                  <TableCell className="pr-5 whitespace-nowrap">{v.terakhir ? fmtDateTime(v.terakhir) : "—"}</TableCell>
                </TableRow>
              ))}
              {!visits.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Belum ada Owner atau Supervisor di workspace ini.
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
