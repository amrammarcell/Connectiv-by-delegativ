// Closing dan Lost (PRD F7). Urutan alasan mengikuti PRD.

export const ALASAN_LOST = [
  "harga",
  "tidak_membalas",
  "tidak_sesuai",
  "kompetitor",
  "hanya_bertanya",
  "lainnya",
] as const;
export type AlasanLost = (typeof ALASAN_LOST)[number];

export const ALASAN_LABEL: Record<AlasanLost, string> = {
  harga: "Harga tidak cocok",
  tidak_membalas: "Tidak membalas / menghilang",
  tidak_sesuai: "Produk tidak sesuai kebutuhan",
  kompetitor: "Memilih kompetitor",
  hanya_bertanya: "Hanya bertanya-tanya",
  lainnya: "Lainnya",
};

export type DealStatus = "closing" | "lost";

export type Deal = {
  id: string;
  contact_id: string;
  status: DealStatus;
  nilai: number | null;
  alasan_lost: AlasanLost | null;
  catatan: string | null;
  oleh_user: string | null;
  pada: string;
};

export const DEAL_COLUMNS = "id, contact_id, status, nilai, alasan_lost, catatan, oleh_user, pada" as const;

export function formatRupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

// "1.250.000" / "Rp 1.250.000" → 1250000; selain angka diabaikan.
export function parseRupiah(input: string): number | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// Deal terbaru per kontak.
export function latestDealByContact(deals: Deal[]): Record<string, Deal> {
  const result: Record<string, Deal> = {};
  for (const d of deals) {
    const current = result[d.contact_id];
    if (!current || current.pada < d.pada) result[d.contact_id] = d;
  }
  return result;
}
