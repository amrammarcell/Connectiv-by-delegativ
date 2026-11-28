import { mediaEnv, metaAdsEnv } from "@/lib/env.server";
import { downloadPendingMedia } from "@/lib/whatsapp/media";
import { syncAllAdAccounts } from "@/lib/meta-ads/sync";
import { purgeOldRecords } from "@/lib/retention";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/whatsapp/webhook";
import { processPendingEvents } from "@/lib/whatsapp/processor";

// Pekerjaan harian (Vercel Cron, lihat vercel.json): pemrosesan ulang webhook
// yang tertunda, sinkronisasi spend Meta Ads, dan retensi data lama (90 hari).
// Dipanggil Vercel dengan "Authorization: Bearer <CRON_SECRET>".
export const maxDuration = 300;

export async function GET(request: Request) {
  const env = metaAdsEnv();
  const auth = request.headers.get("authorization") ?? "";
  if (!env.CRON_SECRET || !safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();
  // Sisakan waktu untuk sync iklan dan retensi.
  const webhooks = await processPendingEvents(admin, { deadline: startedAt + 150_000 });
  // Media yang gagal / belum sempat diunduh saat webhook masuk.
  const media = await (async () =>
    downloadPendingMedia(admin, { env: mediaEnv(), limit: 500, deadline: startedAt + 200_000 }))().catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }));
  const ads = env.META_ADS_ACCESS_TOKEN
    ? await syncAllAdAccounts(admin, env.META_ADS_ACCESS_TOKEN, { graphVersion: env.META_GRAPH_VERSION })
    : "META_ADS_ACCESS_TOKEN belum diisi";
  const retention = await purgeOldRecords(admin).catch((err: unknown) => ({
    error: err instanceof Error ? err.message : String(err),
  }));

  return Response.json({ webhooks, media, ads, retention });
}
