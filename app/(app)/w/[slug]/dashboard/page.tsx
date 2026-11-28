import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, Lightbulb } from "lucide-react";
import { AdsTable } from "@/components/dashboard/ads-table";
import { FilterForm } from "@/components/filter-form";
import { DashboardSkeleton } from "@/components/states";
import { PageHeader } from "@/components/page-header";
import { logPageVisit } from "@/lib/activity";
import { cheapChatInsight, dateRange, parseRange, RANGES, summarize, withMetrics, type AdRow } from "@/lib/dashboard";
import { ALASAN_LABEL, formatRupiah, type AlasanLost } from "@/lib/deals";
import { formatDuration } from "@/lib/response-time";
import { getInboxLookups } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { getMembers } from "@/lib/workspace-data";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page({ params, searchParams }: PageProps<"/w/[slug]/dashboard">) {
  return (
    <>
      <PageHeader title="Dashboard" description="Performa iklan sampai closing" />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

type FunnelRow = { nama: string; tipe: string; jumlah: number };
type LostRow = { alasan: AlasanLost; jumlah: number };
type ResponseRow = {
  assigned_to: string | null;
  is_total: boolean;
  total: number;
  dibalas: number;
  median_menit: number | null;
  p90_menit: number | null;
  cepat: number;
};

const compact = (v: number) =>
  v >= 1_000_000
    ? `Rp ${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
    : v >= 1_000
      ? `Rp ${Math.round(v / 1_000).toLocaleString("id-ID")} rb`
      : formatRupiah(v);

async function DashboardContent({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { access, numbers } = await getInboxLookups(slug);
  if (!(access.canManage || access.peran === "supervisor")) {
    return (
      <p className="m-7 max-w-xl rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Dashboard hanya untuk Owner dan Supervisor.
      </p>
    );
  }

  // Metrik pilot: Owner/Supervisor membuka dashboard ≥ 3x per minggu.
  logPageVisit(access.user.id, access.workspace.id, "dashboard");

  const range = parseRange(query.rentang);
  const { dari, sampai } = dateRange(range);
  const ws = access.workspace.id;
  const members = await getMembers(slug);
  const nomor = typeof query.nomor === "string" && numbers[query.nomor] ? query.nomor : "";
  const cs = typeof query.cs === "string" && members.some((m) => m.id === query.cs) ? query.cs : "";
  const filter = { ws, dari, sampai, p_wa_number: nomor || null, p_cs: cs || null };
  const supabase = await createClient();
  const [ads, funnel, lost, response, accounts] = await Promise.all([
    supabase.rpc("dashboard_ads_v2", filter),
    supabase.rpc("dashboard_funnel_v2", filter),
    supabase.rpc("dashboard_lost_reasons_v2", filter),
    supabase.rpc("dashboard_response_v2", filter),
    supabase.from("ad_accounts").select("status_sync, terakhir_sync_pada").eq("workspace_id", ws),
  ]);
  for (const r of [ads, funnel, lost, response]) if (r.error) throw new Error(`dashboard: ${r.error.message}`);
  const linkQuery = (rentang: string) => {
    const params = new URLSearchParams({ rentang });
    if (nomor) params.set("nomor", nomor);
    if (cs) params.set("cs", cs);
    return `/w/${slug}/dashboard?${params}`;
  };
  const filtered = Boolean(nomor || cs);
  const funnelData = (funnel.data ?? []) as FunnelRow[];
  const lostData = (lost.data ?? []) as LostRow[];
  const responseData = (response.data ?? []) as ResponseRow[];

  const rows = ((ads.data ?? []) as AdRow[]).map(withMetrics);
  const s = summarize(rows);
  const insight = cheapChatInsight(rows);
  const funnelRows = funnelData;
  const lostRows = lostData;
  const lostTotal = lostRows.reduce((t, r) => t + Number(r.jumlah), 0);
  const responseTotal = responseData.find((r) => r.is_total);
  const responseByCs = responseData.filter((r) => !r.is_total);
  const memberName = Object.fromEntries(members.map((m) => [m.id, m.nama]));
  const lastSync = (accounts.data ?? [])
    .map((a) => a.terakhir_sync_pada)
    .filter(Boolean)
    .sort()
    .at(-1);

  const tiles = [
    { label: "Spend iklan", value: s.spend ? compact(s.spend) : "—", sub: `${rows.filter((r) => r.meta_ad_id).length} iklan` },
    { label: "Chat masuk", value: s.chat.toLocaleString("id-ID"), sub: `${s.chatIklan} dari iklan · ${s.chatOrganik} organik` },
    {
      label: "Closing",
      value: s.closing.toLocaleString("id-ID"),
      sub: s.chat ? `${((s.closing / s.chat) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}% dari chat` : "—",
    },
    { label: "Revenue", value: s.revenue ? compact(s.revenue) : "—", sub: `${compact(s.revenueIklan)} dari iklan` },
    { label: "Biaya per closing", value: s.biayaPerClosing ? compact(s.biayaPerClosing) : "—", sub: "khusus closing dari iklan", highlight: true },
    {
      label: "ROAS",
      value: s.roas !== null ? `${s.roas.toLocaleString("id-ID", { maximumFractionDigits: 1 })}x` : "—",
      sub: "revenue iklan ÷ spend",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Rentang tanggal" className="flex flex-wrap gap-2">
          {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((key) => (
            <Link
              key={key}
              href={linkQuery(key)}
              aria-current={range === key ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold",
                range === key ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-secondary-foreground",
              )}
            >
              {range === key && <CalendarDays aria-hidden className="size-3.5" />}
              {RANGES[key]}
            </Link>
          ))}
        </nav>
        <FilterForm key={`${nomor}-${cs}`} action={`/w/${slug}/dashboard`} className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <input type="hidden" name="rentang" value={range} />
          {Object.keys(numbers).length > 1 && (
            <select name="nomor" aria-label="Filter nomor WhatsApp" defaultValue={nomor} className="h-9 min-w-0 rounded-lg border border-input bg-card px-2.5 text-sm">
              <option value="">Semua nomor WA</option>
              {Object.entries(numbers).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          )}
          <select name="cs" aria-label="Filter CS" defaultValue={cs} className="h-9 min-w-0 rounded-lg border border-input bg-card px-2.5 text-sm">
            <option value="">Semua CS</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nama}
              </option>
            ))}
          </select>
          {filtered && (
            <Link
              href={linkQuery(range)}
              className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-[13px] font-semibold text-primary hover:bg-muted"
            >
              Hapus filter
            </Link>
          )}
        </FilterForm>
      </div>

      <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          {dari} s/d {sampai} ·{" "}
          {lastSync
            ? `spend disinkronkan ${new Date(lastSync).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })}`
            : "spend iklan belum tersambung"}
        </p>
      </div>

      {filtered && (
        <p className="rounded-xl border border-dashed bg-card px-4 py-3 text-[13px] text-secondary-foreground">
          Filter {[nomor && `nomor ${numbers[nomor]}`, cs && `CS ${members.find((m) => m.id === cs)?.nama}`].filter(Boolean).join(" dan ")}{" "}
          berlaku untuk chat, closing, revenue, funnel, alasan Lost, dan kecepatan respon. Spend iklan tidak bisa dipecah per
          nomor atau CS, jadi biaya per closing dan ROAS memakai spend penuh tiap iklan.
        </p>
      )}

      {!accounts.data?.length && (
        <p className="rounded-xl border border-dashed bg-card px-4 py-3 text-[13px] text-secondary-foreground">
          Data spend iklan belum ada. Hubungkan ad account Meta di halaman Admin supaya biaya per chat, biaya per closing, dan
          ROAS terhitung. Chat, closing, dan revenue tetap dihitung dari WhatsApp.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] sm:gap-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={cn("flex min-w-0 flex-col gap-1 rounded-2xl px-3 py-3 sm:px-4 sm:py-3.5", t.highlight ? "bg-sidebar text-white" : "border bg-card")}
          >
            <span className={cn("text-xs font-semibold", t.highlight ? "text-[#9de5d9]" : "text-muted-foreground")}>{t.label}</span>
            <span className="text-xl font-bold tracking-tight sm:text-2xl">{t.value}</span>
            <span className={cn("text-xs", t.highlight ? "text-sidebar-foreground" : "text-muted-foreground")}>{t.sub}</span>
          </div>
        ))}
      </div>

      {insight && (
        <div className="flex items-start gap-3 rounded-xl border border-[#fedf89] bg-[#fffaeb] px-4 py-3.5 text-sm text-[#7a2e0e]">
          <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span>
            <strong>{insight.ad.nama_iklan ?? `Iklan ${insight.ad.meta_ad_id}`}</strong> punya biaya per chat paling murah (
            {formatRupiah(insight.ad.biayaPerChat!)})
            {insight.kind === "tanpa-closing"
              ? ", tetapi belum menghasilkan closing sama sekali."
              : `, tetapi biaya per closing-nya ${formatRupiah(insight.ad.biayaPerClosing!)}, termahal di antara semua iklan.`}{" "}
            Chat murah belum tentu jadi penjualan.
          </span>
        </div>
      )}

      <AdsTable rows={rows} />

      <div className="grid gap-5 lg:grid-cols-3">
        <section aria-labelledby="h-funnel" className="flex flex-col gap-3.5 rounded-2xl border bg-card p-5">
          <div>
            <h2 id="h-funnel" className="text-base font-bold">
              Funnel pipeline
            </h2>
            <p className="text-[13px] text-muted-foreground">Persentase lanjut dari stage sebelumnya</p>
          </div>
          {funnelRows.map((f, i) => {
            const first = Number(funnelRows[0]?.jumlah) || 0;
            const prev = i === 0 ? null : Number(funnelRows[i - 1]?.jumlah);
            const pct = prev ? Math.round((Number(f.jumlah) / prev) * 100) : null;
            return (
              <div key={f.nama} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="font-semibold">{f.nama}</span>
                  <span className="text-muted-foreground">
                    {Number(f.jumlah).toLocaleString("id-ID")} kontak
                    {i > 0 && <span className="ml-1 font-semibold text-foreground">· {pct === null ? "—" : `${pct}%`}</span>}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", f.tipe === "closing" ? "bg-[#12b76a]" : "bg-primary")}
                    style={{ width: `${first ? Math.round((Number(f.jumlah) / first) * 100) : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </section>

        <section aria-labelledby="h-lost" className="flex flex-col gap-3.5 rounded-2xl border bg-card p-5">
          <div>
            <h2 id="h-lost" className="text-base font-bold">
              Alasan Lost
            </h2>
            <p className="text-[13px] text-muted-foreground">{lostTotal} kontak Lost di periode ini</p>
          </div>
          {lostRows.map((l) => {
            const pct = lostTotal ? Math.round((Number(l.jumlah) / lostTotal) * 100) : 0;
            return (
              <div key={l.alasan} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_44px] items-center gap-2.5 text-[13px]">
                <span>{ALASAN_LABEL[l.alasan]}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[#e04f16]" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-right font-semibold">{pct}%</span>
              </div>
            );
          })}
          {!lostRows.length && <p className="text-[13px] text-muted-foreground">Belum ada kontak Lost.</p>}
        </section>

        <section aria-labelledby="h-respon" className="flex flex-col gap-3.5 rounded-2xl border bg-card p-5">
          <div>
            <h2 id="h-respon" className="text-base font-bold">
              Kecepatan respon
            </h2>
            <p className="text-[13px] text-muted-foreground">Dari pesan customer sampai balasan pertama CS</p>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Median", value: responseTotal?.median_menit },
              { label: "P90", value: responseTotal?.p90_menit },
            ].map((m) => (
              <div key={m.label} className="flex flex-col gap-0.5 rounded-xl bg-muted/60 px-3 py-2.5">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <span className="text-xl font-bold">{m.value != null ? formatDuration(Number(m.value)) : "—"}</span>
              </div>
            ))}
            <div className="flex flex-col gap-0.5 rounded-xl bg-muted/60 px-3 py-2.5">
              <span className="text-xs text-muted-foreground">&lt; {access.workspace.batas_kuning_menit} mnt</span>
              <span className="text-xl font-bold">
                {responseTotal?.total ? `${Math.round((Number(responseTotal.cepat) / Number(responseTotal.total)) * 100)}%` : "—"}
              </span>
            </div>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-right text-muted-foreground">
                <th scope="col" className="py-1.5 text-left font-semibold">
                  CS (kontak di-assign)
                </th>
                <th scope="col" className="font-semibold">
                  Chat
                </th>
                <th scope="col" className="font-semibold">
                  Median
                </th>
              </tr>
            </thead>
            <tbody>
              {responseByCs.map((r) => (
                <tr key={r.assigned_to ?? "none"} className="border-t text-right">
                  <th scope="row" className="py-2 text-left font-semibold">
                    {r.assigned_to ? (memberName[r.assigned_to] ?? "Pengguna") : "Belum di-assign"}
                  </th>
                  <td>{r.total}</td>
                  <td>{r.median_menit != null ? formatDuration(Number(r.median_menit)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!responseByCs.length && <p className="text-[13px] text-muted-foreground">Belum ada chat di periode ini.</p>}
        </section>
      </div>
    </div>
  );
}
