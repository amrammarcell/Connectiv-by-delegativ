// Peringatan kesehatan nomor WhatsApp untuk /admin (fungsi murni, mudah dites).

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Tidak ada pesan masuk/keluar (non-riwayat) selama ini → mungkin terputus.
export const SILENT_AFTER_MS = 24 * HOUR;
// Coexistence: aplikasi WhatsApp Business di HP harus dibuka ≤ 14 hari.
// Peringatan muncul sejak 12 hari tanpa balasan CS dari aplikasi.
export const APP_IDLE_WARN_DAYS = 12;
export const APP_IDLE_LIMIT_DAYS = 14;

export type NumberHealthInput = {
  status: string;
  status_alasan: string | null;
  terakhir_terima_pesan: string | null;
  // Pesan keluar non-riwayat terakhir (CS membalas dari aplikasi di HP).
  terakhir_balasan_cs: string | null;
  tersambung_pada: string;
};

export type NumberWarning = { level: "merah" | "kuning"; text: string };

const days = (ms: number) => Math.floor(ms / DAY);

export function numberWarnings(n: NumberHealthInput, now: number = Date.now()): NumberWarning[] {
  const warnings: NumberWarning[] = [];
  const connectedAt = new Date(n.tersambung_pada).getTime();

  if (n.status === "terputus") {
    warnings.push({ level: "merah", text: `Terputus${n.status_alasan ? ` (${n.status_alasan})` : ""}` });
  }

  const lastMessage = n.terakhir_terima_pesan ? new Date(n.terakhir_terima_pesan).getTime() : null;
  const silentSince = lastMessage ?? connectedAt;
  if (now - silentSince > SILENT_AFTER_MS) {
    const hours = Math.floor((now - silentSince) / HOUR);
    const span = hours >= 48 ? `${days(now - silentSince)} hari` : `${hours} jam`;
    warnings.push({
      level: "kuning",
      text: lastMessage ? `Tidak ada pesan ${span}` : `Belum ada pesan sejak tersambung (${span})`,
    });
  }

  const lastReply = n.terakhir_balasan_cs ? new Date(n.terakhir_balasan_cs).getTime() : null;
  const idleSince = lastReply ?? connectedAt;
  const idleDays = days(now - idleSince);
  if (idleDays >= APP_IDLE_WARN_DAYS) {
    warnings.push({
      level: idleDays >= APP_IDLE_LIMIT_DAYS ? "merah" : "kuning",
      text:
        `Tidak ada balasan CS dari aplikasi ${idleDays} hari. ` +
        `Buka aplikasi WhatsApp Business di HP (batas ${APP_IDLE_LIMIT_DAYS} hari agar Coexistence tetap aktif).`,
    });
  }

  return warnings;
}
