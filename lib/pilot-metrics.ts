// Metrik keberhasilan pilot (PRD §2.8). Angka mentah dari fungsi SQL
// pilot_metrics; di sini dihitung rasio, target, dan status hijau/merah.

export const PILOT_RANGES = { "7": "7 hari", "14": "14 hari", "28": "28 hari", "56": "8 minggu" } as const;
export type PilotRangeKey = keyof typeof PILOT_RANGES;

export function parsePilotRange(value: string | string[] | undefined): PilotRangeKey {
  return typeof value === "string" && value in PILOT_RANGES ? (value as PilotRangeKey) : "28";
}

// Tanggal YYYY-MM-DD menurut Asia/Jakarta, `days` hari terakhir termasuk hari ini.
export function pilotDateRange(key: PilotRangeKey, now: Date = new Date()): { dari: string; sampai: string; days: number } {
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const days = Number(key);
  return { dari: fmt(new Date(now.getTime() - (days - 1) * 86_400_000)), sampai: fmt(now), days };
}

export type PilotRaw = {
  mirror: {
    dikirim_meta: number;
    tersimpan: number;
    dikirim_meta_live: number;
    tersimpan_live: number;
    event_total: number;
    event_belum_diproses: number;
    pesan: { masuk: number; keluar: number };
  };
  closing: { kontak: number; ditandai: number; closing: number; lost: number };
  ctwa: {
    percakapan_meta: number;
    akun_iklan_aktif: number;
    kontak_ctwa: number;
    kontak_ctwa_iklan_dikenal: number;
    pelanggan_referral: number;
    pelanggan_referral_dengan_id: number;
  };
  kunjungan: { user_id: string; nama: string; peran: string; kunjungan: number; terakhir: string | null }[];
};

export type MetricStatus = "hijau" | "merah" | "kosong";

export type Metric = {
  key: "mirror" | "closing" | "ctwa" | "dashboard";
  label: string;
  target: string;
  // null = belum ada data untuk dihitung.
  value: number | null;
  display: string;
  status: MetricStatus;
  basis: string;
};

const pct = (num: number, den: number) => (den > 0 ? num / den : null);
const fmtPct = (v: number | null) =>
  v === null ? "—" : `${(v * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
const fmtInt = (v: number) => v.toLocaleString("id-ID");
const statusOf = (v: number | null, target: number): MetricStatus => (v === null ? "kosong" : v >= target ? "hijau" : "merah");

export const TARGETS = { mirror: 0.99, closing: 0.7, ctwa: 0.9, dashboardPerWeek: 3 } as const;

export type VisitRow = PilotRaw["kunjungan"][number] & { perMinggu: number; memenuhi: boolean };

export function visitRows(raw: PilotRaw, days: number): VisitRow[] {
  const weeks = Math.max(days / 7, 1);
  return raw.kunjungan.map((v) => {
    const perMinggu = Number(v.kunjungan) / weeks;
    return { ...v, kunjungan: Number(v.kunjungan), perMinggu, memenuhi: perMinggu >= TARGETS.dashboardPerWeek };
  });
}

export function computePilotMetrics(raw: PilotRaw, days: number): Metric[] {
  const n = (v: unknown) => Number(v ?? 0);

  // 1. Mirroring: pesan yang dikirim Meta ke webhook vs yang tersimpan.
  const sent = n(raw.mirror.dikirim_meta);
  const stored = n(raw.mirror.tersimpan);
  const mirror = pct(stored, sent);

  // 2. Closing/Lost.
  const kontak = n(raw.closing.kontak);
  const closing = pct(n(raw.closing.ditandai), kontak);

  // 3. CTWA: pembagi = percakapan dari iklan menurut Meta jika ada data
  // insights, selain itu chat yang membawa referral (dengan/tanpa ID iklan).
  const meta = n(raw.ctwa.percakapan_meta);
  const withId = n(raw.ctwa.pelanggan_referral_dengan_id);
  const ctwaFromMeta = meta > 0;
  const ctwaRaw = ctwaFromMeta ? pct(withId, meta) : pct(withId, n(raw.ctwa.pelanggan_referral));
  const ctwa = ctwaRaw === null ? null : Math.min(ctwaRaw, 1);

  // 4. Dashboard: Owner/Supervisor teraktif, rata-rata per minggu.
  const visits = visitRows(raw, days);
  const best = visits.length ? Math.max(...visits.map((v) => v.perMinggu)) : null;

  return [
    {
      key: "mirror",
      label: "Pesan ter-mirror",
      target: "≥ 99%",
      value: mirror,
      display: fmtPct(mirror),
      status: statusOf(mirror, TARGETS.mirror),
      basis: `${fmtInt(stored)} dari ${fmtInt(sent)} pesan yang dikirim Meta tersimpan`,
    },
    {
      key: "closing",
      label: "Chat ditandai Closing/Lost",
      target: "≥ 70%",
      value: closing,
      display: fmtPct(closing),
      status: statusOf(closing, TARGETS.closing),
      basis: `${fmtInt(n(raw.closing.ditandai))} dari ${fmtInt(kontak)} chat baru (${fmtInt(n(raw.closing.closing))} Closing, ${fmtInt(n(raw.closing.lost))} Lost)`,
    },
    {
      key: "ctwa",
      label: "Chat CTWA terkait ID iklan",
      target: "≥ 90%",
      value: ctwa,
      display: fmtPct(ctwa),
      status: statusOf(ctwa, TARGETS.ctwa),
      basis: ctwaFromMeta
        ? `${fmtInt(withId)} pelanggan dengan ID iklan dari ${fmtInt(meta)} percakapan menurut Meta Ads`
        : `${fmtInt(withId)} dari ${fmtInt(n(raw.ctwa.pelanggan_referral))} pelanggan ber-referral (belum ada data Meta Ads)`,
    },
    {
      key: "dashboard",
      label: "Owner/Supervisor buka dashboard",
      target: "≥ 3x / minggu",
      value: best,
      display: best === null ? "—" : `${best.toLocaleString("id-ID", { maximumFractionDigits: 1 })}x / minggu`,
      status: best === null ? "kosong" : best >= TARGETS.dashboardPerWeek ? "hijau" : "merah",
      basis: visits.length
        ? `Teraktif dari ${fmtInt(visits.length)} Owner/Supervisor; ${fmtInt(visits.filter((v) => v.memenuhi).length)} memenuhi target`
        : "Belum ada Owner/Supervisor",
    },
  ];
}
