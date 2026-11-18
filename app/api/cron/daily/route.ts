import { metaAdsEnv } from "@/lib/env.server";
import { syncAllAdAccounts } from "@/lib/meta-ads/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/whatsapp/webhook";
import { processPendingEvents } from "@/lib/whatsapp/processor";

// Pekerjaan harian (Vercel Cron, lihat vercel.json): sinkronisasi spend Meta
// Ads dan pemrosesan ulang webhook yang tertunda. Dipanggil Vercel dengan
// "Authorization: Bearer <CRON_SECRET>".
export const maxDuration = 300;

export async function GET(request: Request) {
  const env = metaAdsEnv();
  const auth = request.headers.get("authorization") ?? "";
  if (!env.CRON_SECRET || !safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const webhooks = await processPendingEvents(admin);
  const ads = env.META_ADS_ACCESS_TOKEN
    ? await syncAllAdAccounts(admin, env.META_ADS_ACCESS_TOKEN, { graphVersion: env.META_GRAPH_VERSION })
    : "META_ADS_ACCESS_TOKEN belum diisi";

  return Response.json({ webhooks, ads });
}
