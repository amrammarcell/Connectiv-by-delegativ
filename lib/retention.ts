import type { SupabaseClient } from "@supabase/supabase-js";

// Retensi data operasional (dipanggil cron harian): webhook_events yang sudah
// diproses dan sync_runs lebih tua dari RETENTION_DAYS dihapus. Webhook yang
// belum diproses tidak pernah dihapus otomatis.

export const RETENTION_DAYS = 90;

export type RetentionResult = { webhookEvents: number; syncRuns: number; cutoff: string };

export async function purgeOldRecords(
  admin: SupabaseClient,
  options: { now?: Date; days?: number } = {},
): Promise<RetentionResult> {
  const { now = new Date(), days = RETENTION_DAYS } = options;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  const { count: webhookEvents, error: webhookError } = await admin
    .from("webhook_events")
    .delete({ count: "exact" })
    .eq("diproses", true)
    .lt("diterima_pada", cutoff);
  if (webhookError) throw new Error(`webhook_events: ${webhookError.message}`);

  const { count: syncRuns, error: syncError } = await admin
    .from("sync_runs")
    .delete({ count: "exact" })
    .lt("mulai", cutoff);
  if (syncError) throw new Error(`sync_runs: ${syncError.message}`);

  return { webhookEvents: webhookEvents ?? 0, syncRuns: syncRuns ?? 0, cutoff };
}
