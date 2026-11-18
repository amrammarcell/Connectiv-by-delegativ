// Status waktu tanggapan per chat (PRD F4a).

export type ResponseLevel = "hijau" | "kuning" | "merah" | "netral";

export type ResponseStatus = {
  waiting: boolean;
  level: ResponseLevel;
  // Label pendek untuk daftar ("Menunggu 2 jam") dan panjang untuk panel.
  label: string;
  long: string;
};

export type Thresholds = { kuning: number; merah: number };

export function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1 mnt";
  if (minutes < 60) return `${Math.floor(minutes)} mnt`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} jam`;
  return `${Math.floor(minutes / (60 * 24))} hari`;
}

export function responseStatus(
  contact: { menunggu_balasan_sejak: string | null; pesan_terakhir_pada: string | null },
  now: number,
  thresholds: Thresholds,
): ResponseStatus | null {
  if (contact.menunggu_balasan_sejak) {
    const minutes = Math.max(0, (now - new Date(contact.menunggu_balasan_sejak).getTime()) / 60_000);
    const level: ResponseLevel =
      minutes >= thresholds.merah ? "merah" : minutes >= thresholds.kuning ? "kuning" : "hijau";
    const d = formatDuration(minutes);
    return { waiting: true, level, label: `Menunggu ${d}`, long: `Menunggu balasan sejak ${d} lalu` };
  }
  if (contact.pesan_terakhir_pada) {
    const minutes = Math.max(0, (now - new Date(contact.pesan_terakhir_pada).getTime()) / 60_000);
    const d = formatDuration(minutes);
    return { waiting: false, level: "netral", label: `Dibalas ${d} lalu`, long: `Dibalas ${d} lalu` };
  }
  return null;
}

export const LEVEL_CLASS: Record<ResponseLevel, string> = {
  merah: "bg-[#fef3f2] text-[#b42318]",
  kuning: "bg-[#fef0c7] text-[#93370d]",
  hijau: "bg-[#ecfdf3] text-[#067647]",
  netral: "bg-muted text-muted-foreground",
};
