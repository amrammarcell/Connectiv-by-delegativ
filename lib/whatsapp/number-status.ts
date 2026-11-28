// Label status onboarding/sinkronisasi nomor untuk halaman Pengaturan →
// Nomor WhatsApp (fungsi murni, aman untuk Client Component).

export type SyncFields = {
  sumber: string | null;
  sync_kontak_status: string | null;
  sync_riwayat_status: string | null;
  sync_batas: string | null;
  sync_error: string | null;
};

export const SUMBER_LABEL: Record<string, string> = {
  dualhook: "Dualhook",
  resmi: "Resmi (Meta)",
};

export type SyncSummary = {
  level: "ok" | "proses" | "gagal" | "netral";
  text: string;
  // Tombol "Coba lagi" tampil jika masih ada yang bisa diminta dalam 24 jam.
  canRetry: boolean;
};

const STEP: Record<string, string> = { kontak: "Kontak", riwayat: "Riwayat chat" };

export function syncSummary(n: SyncFields, now: number = Date.now()): SyncSummary {
  if (n.sumber !== "resmi" || (!n.sync_kontak_status && !n.sync_riwayat_status)) {
    return { level: "netral", text: "—", canRetry: false };
  }
  const steps = [
    ["kontak", n.sync_kontak_status],
    ["riwayat", n.sync_riwayat_status],
  ] as const;
  if (steps.every(([, s]) => s === "diminta")) {
    return { level: "ok", text: "Kontak dan riwayat chat sudah diminta dari aplikasi", canRetry: false };
  }

  const open = n.sync_batas !== null && new Date(n.sync_batas).getTime() > now;
  const failed = steps.find(([, s]) => s === "gagal");
  const pending = steps.find(([, s]) => s === "belum" || s === "memproses");
  if (!open && (failed || pending)) {
    return {
      level: "gagal",
      text: "Batas 24 jam sinkronisasi terlewat. Sambungkan ulang nomor untuk menarik kontak dan riwayat.",
      canRetry: false,
    };
  }
  if (failed) {
    return {
      level: "gagal",
      text: `${STEP[failed[0]]} gagal disinkronkan${n.sync_error ? `: ${n.sync_error}` : ""}`,
      canRetry: true,
    };
  }
  const step = pending ? STEP[pending[0]] : "Sinkronisasi";
  return { level: "proses", text: `${step} sedang disinkronkan`, canRetry: pending?.[1] === "belum" };
}
