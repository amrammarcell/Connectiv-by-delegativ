import type { SupabaseClient } from "@supabase/supabase-js";

// Sinkronisasi spend harian per iklan dari Meta Marketing API ke
// ad_insights_daily. Butuh client dengan secret key dan token system user
// yang punya akses (minimal ads_read) ke ad account klien.

export const CONVERSATION_ACTION = "onsite_conversion.messaging_conversation_started_7d";
// Data Meta beberapa hari terakhir masih bisa berubah, jadi selalu ditarik ulang.
export const LOOKBACK_DAYS = 3;

export type InsightRow = {
  ad_id: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
};

export type ParsedInsight = {
  metaAdId: string;
  namaIklan: string | null;
  namaAdset: string | null;
  namaCampaign: string | null;
  tanggal: string;
  spend: number;
  impressions: number;
  klik: number;
  percakapanDimulai: number;
};

export function parseInsight(row: InsightRow): ParsedInsight {
  const num = (v: string | undefined) => (v ? Number(v) || 0 : 0);
  return {
    metaAdId: row.ad_id,
    namaIklan: row.ad_name ?? null,
    namaAdset: row.adset_name ?? null,
    namaCampaign: row.campaign_name ?? null,
    tanggal: row.date_start,
    spend: num(row.spend),
    impressions: num(row.impressions),
    klik: num(row.clicks),
    percakapanDimulai: num(row.actions?.find((a) => a.action_type === CONVERSATION_ACTION)?.value),
  };
}

// Rentang tanggal Asia/Jakarta: LOOKBACK_DAYS hari terakhir sampai hari ini.
export function syncRange(now: Date = new Date(), days = LOOKBACK_DAYS): { since: string; until: string } {
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  return { since: fmt(new Date(now.getTime() - days * 24 * 60 * 60 * 1000)), until: fmt(now) };
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export async function fetchInsights(
  accountId: string,
  token: string,
  range: { since: string; until: string },
  options: { graphVersion: string; fetchFn?: FetchLike },
): Promise<InsightRow[]> {
  const fetchFn = options.fetchFn ?? (fetch as unknown as FetchLike);
  const params = new URLSearchParams({
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify(range),
    fields: "ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,actions",
    limit: "500",
    access_token: token,
  });
  let url: string | undefined = `https://graph.facebook.com/${options.graphVersion}/${accountId}/insights?${params}`;
  const rows: InsightRow[] = [];

  while (url) {
    const res = await fetchFn(url);
    const body = (await res.json()) as {
      data?: InsightRow[];
      paging?: { next?: string };
      error?: { message?: string; code?: number };
    };
    if (!res.ok || body.error) {
      throw new Error(`Meta API ${res.status}: ${body.error?.message ?? "gagal"} (kode ${body.error?.code ?? "?"})`);
    }
    rows.push(...(body.data ?? []));
    url = body.paging?.next;
  }
  return rows;
}

export type AdAccountRow = { id: string; workspace_id: string; meta_ad_account_id: string };

export async function syncAdAccount(
  admin: SupabaseClient,
  account: AdAccountRow,
  token: string,
  options: { graphVersion: string; now?: Date; fetchFn?: FetchLike },
): Promise<{ rows: number }> {
  const { data: run } = await admin
    .from("sync_runs")
    .insert({ workspace_id: account.workspace_id, ad_account_id: account.id })
    .select("id")
    .single();

  try {
    const insights = (await fetchInsights(account.meta_ad_account_id, token, syncRange(options.now), options)).map(
      parseInsight,
    );

    // Nama iklan terbaru per meta_ad_id.
    const ads = new Map<string, ParsedInsight>();
    for (const i of insights) ads.set(i.metaAdId, i);
    const { data: adRows, error: adError } = await admin
      .from("ads")
      .upsert(
        [...ads.values()].map((i) => ({
          workspace_id: account.workspace_id,
          ad_account_id: account.id,
          meta_ad_id: i.metaAdId,
          nama_iklan: i.namaIklan,
          nama_adset: i.namaAdset,
          nama_campaign: i.namaCampaign,
          diperbarui_pada: new Date().toISOString(),
        })),
        { onConflict: "workspace_id,meta_ad_id" },
      )
      .select("id, meta_ad_id");
    if (adError) throw new Error(`simpan ads: ${adError.message}`);

    const idByMeta = new Map((adRows ?? []).map((a) => [a.meta_ad_id as string, a.id as string]));
    if (insights.length) {
      const { error } = await admin.from("ad_insights_daily").upsert(
        insights.map((i) => ({
          ad_id: idByMeta.get(i.metaAdId),
          workspace_id: account.workspace_id,
          tanggal: i.tanggal,
          spend: i.spend,
          impressions: i.impressions,
          klik: i.klik,
          percakapan_dimulai: i.percakapanDimulai,
          diperbarui_pada: new Date().toISOString(),
        })),
        { onConflict: "ad_id,tanggal" },
      );
      if (error) throw new Error(`simpan insights: ${error.message}`);
    }

    const now = new Date().toISOString();
    await admin
      .from("ad_accounts")
      .update({ status_sync: "ok", terakhir_sync_pada: now, error_terakhir: null })
      .eq("id", account.id);
    if (run) await admin.from("sync_runs").update({ status: "ok", selesai: now, baris: insights.length }).eq("id", run.id);
    return { rows: insights.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();
    await admin.from("ad_accounts").update({ status_sync: "gagal", error_terakhir: message }).eq("id", account.id);
    if (run) await admin.from("sync_runs").update({ status: "gagal", selesai: now, error: message }).eq("id", run.id);
    throw err;
  }
}

export async function syncAllAdAccounts(admin: SupabaseClient, token: string, options: { graphVersion: string }) {
  const { data: accounts, error } = await admin
    .from("ad_accounts")
    .select("id, workspace_id, meta_ad_account_id")
    .eq("aktif", true);
  if (error) throw new Error(error.message);

  const results: { account: string; rows?: number; error?: string }[] = [];
  for (const account of accounts ?? []) {
    try {
      const r = await syncAdAccount(admin, account, token, options);
      results.push({ account: account.meta_ad_account_id, rows: r.rows });
    } catch (err) {
      results.push({ account: account.meta_ad_account_id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
