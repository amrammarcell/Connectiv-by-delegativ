import "server-only";
import { emailNotifier, type Notifier } from "@/lib/alerts";
import { alertsEnv } from "@/lib/env.server";

// Notifier aktif menurut env. null = hanya log + banner /admin.
// Env yang salah format tidak boleh menggagalkan pemanggil (cron/webhook).
export function defaultNotifier(): Notifier | null {
  try {
    const env = alertsEnv();
    return emailNotifier({ apiKey: env.RESEND_API_KEY, to: env.ALERT_EMAIL_TO, from: env.ALERT_EMAIL_FROM });
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", type: "ops_alert", judul: "konfigurasi alert tidak valid", detail: String(err) }),
    );
    return null;
  }
}

export function notifierConfigured(): boolean {
  return defaultNotifier() !== null;
}
