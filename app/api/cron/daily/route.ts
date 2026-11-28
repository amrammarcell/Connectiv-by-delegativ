import { checkWebhookHealth, evaluateAdSync, raiseAlert, resolveAlert } from "@/lib/alerts";
import { defaultNotifier } from "@/lib/alerts-notifier";
import { metaAdsEnv, techProviderEnv } from "@/lib/env.server";
import { runPendingSyncs, supabaseOnboardingStore } from "@/lib/whatsapp/onboarding";
import { syncAllAdAccounts } from "@/lib/meta-ads/sync";
import { purgeOldRecords } from "@/lib/retention";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/whatsapp/webhook";
import { processPendingEvents } from "@/lib/whatsapp/processor";

// Pekerjaan harian (Vercel Cron, lihat vercel.json): pemrosesan ulang webhook
// yang tertunda, sinkronisasi spend Meta Ads, dan retensi data lama (90 hari).
// Dipanggil Vercel dengan "Authorization: Bearer <CRON_SECRET>".
// Setiap run dicatat di sync_runs (jenis cron_harian) sebagai detak jantung;
// kegagalan membuka alert (lib/alerts.ts) dan pemulihan menutupnya.
export const maxDuration = 300;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function GET(request: Request) {
  const env = metaAdsEnv();
  const auth = request.headers.get("authorization") ?? "";
  if (!env.CRON_SECRET || !safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();
  const notifier = defaultNotifier();
  const { data: run } = await admin
    .from("sync_runs")
    .insert({ jenis: "cron_harian", status: "berjalan" })
    .select("id")
    .single<{ id: string }>();
  const finishRun = async (status: "ok" | "gagal", error: string | null) => {
    if (run) await admin.from("sync_runs").update({ status, selesai: new Date().toISOString(), error }).eq("id", run.id);
  };

  try {
    // Sisakan waktu untuk sync iklan dan retensi.
    const webhooks = await processPendingEvents(admin, { deadline: startedAt + 150_000 });
    const webhookHealth = await checkWebhookHealth(admin, notifier).catch((err: unknown) => ({
      ok: false as const,
      detail: errorMessage(err),
    }));

    const ads = env.META_ADS_ACCESS_TOKEN
      ? await syncAllAdAccounts(admin, env.META_ADS_ACCESS_TOKEN, { graphVersion: env.META_GRAPH_VERSION })
      : "META_ADS_ACCESS_TOKEN belum diisi";
    if (Array.isArray(ads)) {
      const adHealth = evaluateAdSync(ads);
      if (adHealth.ok) await resolveAlert(admin, "sync_iklan");
      else await raiseAlert(admin, { jenis: "sync_iklan", judul: "Sync iklan Meta gagal", detail: adHealth.detail }, notifier);
    }

    // Jalur resmi: ulangi sinkronisasi kontak/riwayat yang gagal (masih dalam 24 jam).
    const tp = techProviderEnv();
    const smbSync = tp
      ? await runPendingSyncs(
          supabaseOnboardingStore(admin),
          { encryptionKey: tp.WHATSAPP_TOKEN_ENCRYPTION_KEY, graph: { graphVersion: tp.META_GRAPH_VERSION } },
          null,
        ).catch((err: unknown) => ({ error: errorMessage(err) }))
      : "jalur resmi belum aktif";

    const retention = await purgeOldRecords(admin).catch((err: unknown) => ({ error: errorMessage(err) }));
    if ("error" in retention) {
      await raiseAlert(
        admin,
        { jenis: "cron_harian", judul: "Cron harian gagal sebagian", detail: `Retensi data: ${retention.error}` },
        notifier,
      );
      await finishRun("gagal", `retensi: ${retention.error}`);
    } else {
      await resolveAlert(admin, "cron_harian");
      await finishRun("ok", null);
    }

    return Response.json({ webhooks, webhookHealth, ads, smbSync, retention });
  } catch (err) {
    const message = errorMessage(err);
    await raiseAlert(admin, { jenis: "cron_harian", judul: "Cron harian gagal", detail: message }, notifier);
    await finishRun("gagal", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
