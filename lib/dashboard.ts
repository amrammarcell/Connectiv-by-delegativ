// Perhitungan dashboard (murni, tanpa akses data) supaya mudah dites.

export const RANGES = { "7": "7 hari", "30": "30 hari", bulan: "Bulan ini" } as const;
export type RangeKey = keyof typeof RANGES;

export function parseRange(value: string | string[] | undefined): RangeKey {
  return typeof value === "string" && value in RANGES ? (value as RangeKey) : "30";
}

// Tanggal YYYY-MM-DD menurut Asia/Jakarta.
export function dateRange(key: RangeKey, now: Date = new Date()): { dari: string; sampai: string } {
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const sampai = fmt(now);
  if (key === "bulan") return { dari: `${sampai.slice(0, 8)}01`, sampai };
  const days = Number(key);
  return { dari: fmt(new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000)), sampai };
}

export type AdRow = {
  meta_ad_id: string | null;
  nama_iklan: string | null;
  nama_campaign: string | null;
  spend: number;
  chat: number;
  closing: number;
  revenue: number;
};

export type AdMetrics = AdRow & {
  biayaPerChat: number | null;
  biayaPerClosing: number | null;
  roas: number | null;
};

export function withMetrics(row: AdRow): AdMetrics {
  const spend = Number(row.spend);
  const revenue = Number(row.revenue);
  return {
    ...row,
    spend,
    revenue,
    chat: Number(row.chat),
    closing: Number(row.closing),
    biayaPerChat: spend > 0 && row.chat > 0 ? spend / Number(row.chat) : null,
    biayaPerClosing: spend > 0 && row.closing > 0 ? spend / Number(row.closing) : null,
    roas: spend > 0 ? revenue / spend : null,
  };
}

export type Summary = {
  spend: number;
  chat: number;
  chatIklan: number;
  chatOrganik: number;
  closing: number;
  closingIklan: number;
  revenue: number;
  revenueIklan: number;
  biayaPerClosing: number | null;
  roas: number | null;
};

export function summarize(rows: AdMetrics[]): Summary {
  const iklan = rows.filter((r) => r.meta_ad_id);
  const organik = rows.find((r) => !r.meta_ad_id);
  const sum = (list: AdMetrics[], key: "spend" | "chat" | "closing" | "revenue") =>
    list.reduce((total, r) => total + r[key], 0);
  const spend = sum(iklan, "spend");
  const closingIklan = sum(iklan, "closing");
  const revenueIklan = sum(iklan, "revenue");
  return {
    spend,
    chat: sum(rows, "chat"),
    chatIklan: sum(iklan, "chat"),
    chatOrganik: organik?.chat ?? 0,
    closing: sum(rows, "closing"),
    closingIklan,
    revenue: sum(rows, "revenue"),
    revenueIklan,
    biayaPerClosing: spend > 0 && closingIklan > 0 ? spend / closingIklan : null,
    roas: spend > 0 ? revenueIklan / spend : null,
  };
}

// Iklan dengan biaya per chat termurah tetapi biaya per closing termahal:
// pesan utama produk ("chat murah belum tentu jadi penjualan").
export function cheapChatInsight(rows: AdMetrics[]) {
  const candidates = rows.filter((r) => r.meta_ad_id && r.biayaPerChat !== null);
  if (candidates.length < 2) return null;
  const cheapest = [...candidates].sort((a, b) => a.biayaPerChat! - b.biayaPerChat!)[0]!;
  const withClosing = candidates.filter((r) => r.biayaPerClosing !== null);
  const worstClosing = withClosing.sort((a, b) => b.biayaPerClosing! - a.biayaPerClosing!)[0];
  if (cheapest.closing === 0) return { ad: cheapest, kind: "tanpa-closing" as const };
  if (worstClosing && worstClosing.meta_ad_id === cheapest.meta_ad_id) return { ad: cheapest, kind: "closing-mahal" as const };
  return null;
}
