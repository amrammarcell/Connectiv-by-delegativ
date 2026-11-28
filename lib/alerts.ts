import type { SupabaseClient } from "@supabase/supabase-js";

// Alert operasional untuk kegagalan cron harian, pemrosesan webhook, dan sync
// iklan. Satu alert terbuka per jenis (tabel ops_alerts); notifikasi dikirim
// hanya saat alert baru dibuka, lalu alert ditutup otomatis saat kondisinya
// pulih. Notifier bisa diganti: email lewat Resend jika RESEND_API_KEY dan
// ALERT_EMAIL_TO diisi; selain itu cukup console.error terstruktur (terbaca di
// log Vercel) dan banner di /admin.

export type AlertJenis = "cron_harian" | "webhook" | "sync_iklan";

export const ALERT_LABEL: Record<AlertJenis, string> = {
  cron_harian: "Cron harian",
  webhook: "Webhook WhatsApp",
  sync_iklan: "Sync iklan Meta",
};

export type AlertInput = { jenis: AlertJenis; judul: string; detail: string };

export type Notifier = (alert: AlertInput) => Promise<boolean>;

type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;

export type EmailConfig = { apiKey?: string; to?: string; from: string };

// Mengembalikan notifier email jika dikonfigurasi, atau null.
export function emailNotifier(config: EmailConfig, fetchImpl: FetchLike = fetch): Notifier | null {
  const to = (config.to ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!config.apiKey || !to.length) return null;
  return async (alert) => {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to,
        subject: `[Connectiv] ${alert.judul}`,
        text: `${ALERT_LABEL[alert.jenis]}\n\n${alert.detail}\n\nLihat /admin untuk detail.`,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return true;
  };
}

function logStructured(level: "error" | "info", payload: Record<string, unknown>) {
  const line = JSON.stringify({ level, type: "ops_alert", ...payload });
  if (level === "error") console.error(line);
  else console.info(line);
}

export async function raiseAlert(
  admin: SupabaseClient,
  alert: AlertInput,
  notifier: Notifier | null,
): Promise<{ baru: boolean; emailed: boolean }> {
  logStructured("error", { jenis: alert.jenis, judul: alert.judul, detail: alert.detail });

  const { data, error } = await admin.rpc("raise_ops_alert", {
    p_jenis: alert.jenis,
    p_judul: alert.judul,
    p_detail: alert.detail,
  });
  if (error) {
    // Tabel alert tidak bisa ditulis: tetap coba kirim notifikasi.
    logStructured("error", { jenis: alert.jenis, judul: "raise_ops_alert gagal", detail: error.message });
  }
  const row = (data as { id: number; baru: boolean }[] | null)?.[0];
  const baru = row ? row.baru : true;

  let emailed = false;
  if (baru && notifier) {
    try {
      emailed = await notifier(alert);
      if (emailed && row) await admin.from("ops_alerts").update({ email_terkirim: true }).eq("id", row.id);
    } catch (err) {
      logStructured("error", {
        jenis: alert.jenis,
        judul: "notifikasi alert gagal",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { baru, emailed };
}

export async function resolveAlert(admin: SupabaseClient, jenis: AlertJenis): Promise<number> {
  const { data, error } = await admin.rpc("resolve_ops_alert", { p_jenis: jenis });
  if (error) {
    logStructured("error", { jenis, judul: "resolve_ops_alert gagal", detail: error.message });
    return 0;
  }
  const closed = Number(data ?? 0);
  if (closed > 0) logStructured("info", { jenis, judul: "alert pulih" });
  return closed;
}

// ---------------------------------------------------------------------------
// Aturan kesehatan (fungsi murni, diuji di tests/alerts.test.ts)
// ---------------------------------------------------------------------------

export type WebhookStatRow = {
  sumber: string;
  tertunda: number | string;
  gagal: number | string;
  tertunda_terlama: string | null;
  error_terakhir: string | null;
};

// Webhook sehat jika tidak ada event gagal dan tidak ada event yang tertunda
// lebih lama dari `maxPendingMinutes` (pemrosesan normal selesai dalam detik).
export function evaluateWebhookHealth(
  stats: WebhookStatRow[],
  now: Date = new Date(),
  maxPendingMinutes = 30,
): { ok: true } | { ok: false; detail: string } {
  const problems: string[] = [];
  for (const s of stats) {
    const gagal = Number(s.gagal);
    const tertunda = Number(s.tertunda);
    const oldestMinutes = s.tertunda_terlama ? (now.getTime() - new Date(s.tertunda_terlama).getTime()) / 60_000 : 0;
    if (gagal > 0) {
      problems.push(`${s.sumber}: ${gagal} event gagal${s.error_terakhir ? ` (error terakhir: ${s.error_terakhir})` : ""}`);
    } else if (tertunda > 0 && oldestMinutes > maxPendingMinutes) {
      problems.push(`${s.sumber}: ${tertunda} event tertunda sejak ${Math.round(oldestMinutes)} menit lalu`);
    }
  }
  return problems.length ? { ok: false, detail: problems.join("\n") } : { ok: true };
}

export type AdSyncResult = { account: string; rows?: number; error?: string };

export function evaluateAdSync(results: AdSyncResult[]): { ok: true } | { ok: false; detail: string } {
  const failed = results.filter((r) => r.error);
  if (!failed.length) return { ok: true };
  return { ok: false, detail: failed.map((r) => `${r.account}: ${r.error}`).join("\n") };
}

// Cron harian dijadwalkan sekali sehari; dianggap macet jika run sukses
// terakhir lebih dari 26 jam lalu (atau belum pernah, jika ada run sebelumnya).
export const CRON_STALE_HOURS = 26;

export function cronIsStale(lastOk: string | null, now: Date = new Date()): boolean {
  if (!lastOk) return true;
  return now.getTime() - new Date(lastOk).getTime() > CRON_STALE_HOURS * 60 * 60 * 1000;
}

// Memeriksa statistik webhook lalu membuka atau menutup alert "webhook".
export async function checkWebhookHealth(admin: SupabaseClient, notifier: Notifier | null, now: Date = new Date()) {
  const { data, error } = await admin.rpc("webhook_event_stats");
  if (error) throw new Error(`webhook_event_stats: ${error.message}`);
  const health = evaluateWebhookHealth((data ?? []) as WebhookStatRow[], now);
  if (health.ok) await resolveAlert(admin, "webhook");
  else await raiseAlert(admin, { jenis: "webhook", judul: "Pemrosesan webhook WhatsApp bermasalah", detail: health.detail }, notifier);
  return health;
}
