import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncAdAccount } from "@/lib/meta-ads/sync";
import { createTestContext, supabaseEnabled, type TestUser } from "../helpers/supabase";

// Fungsi dashboard dan sinkronisasi Meta Ads terhadap project dev, dengan
// data uji yang angkanya diketahui.

describe.skipIf(!supabaseEnabled)("dashboard + sync Meta Ads", { timeout: 90_000 }, () => {
  const ctx = supabaseEnabled ? createTestContext("dash") : (null as never);
  let ws: string;
  let owner: TestUser;
  let cs: TestUser;
  let accountId: string;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

  // Meta palsu: 2 iklan, 2 hari.
  const fakeMeta = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        { ad_id: "AD-A", ad_name: "Promo Bundling", campaign_name: "Ramadhan", date_start: today, spend: "300000", clicks: "10" },
        { ad_id: "AD-B", ad_name: "Diskon Ongkir", campaign_name: "Ongkir", date_start: today, spend: "200000", clicks: "50" },
      ],
    }),
  });

  async function contact(phone: string, adId: string | null, assigned: TestUser | null) {
    const { data: stage } = await ctx.admin.from("stages").select("id").eq("workspace_id", ws).eq("urutan", 1).single();
    const { data, error } = await ctx.admin
      .from("contacts")
      .insert({
        workspace_id: ws,
        nomor_hp: phone,
        ad_id: adId,
        sumber: adId ? "ctwa" : "organik",
        stage_id: stage!.id,
        assigned_to: assigned?.id ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  beforeAll(async () => {
    ws = await ctx.workspace("a");
    [owner, cs] = await Promise.all([ctx.user("owner"), ctx.user("cs")]);
    await Promise.all([ctx.member(owner, ws, "owner"), ctx.member(cs, ws, "cs")]);
    const { data, error } = await ctx.admin
      .from("ad_accounts")
      .insert({ workspace_id: ws, meta_ad_account_id: "act_123456" })
      .select("id")
      .single();
    if (error) throw error;
    accountId = data.id;

    // Iklan A: 3 chat, 2 closing (500rb + 700rb). Iklan B: 4 chat, 0 closing, 1 lost.
    // Organik: 1 chat, 1 closing 100rb.
    const a = await Promise.all(["6281200000401", "6281200000402", "6281200000403"].map((p) => contact(p, "AD-A", cs)));
    const b = await Promise.all(["6281200000411", "6281200000412", "6281200000413", "6281200000414"].map((p) => contact(p, "AD-B", null)));
    const o = await contact("6281200000421", null, null);
    for (const [id, nilai] of [[a[0], 500_000], [a[1], 700_000], [o, 100_000]] as const) {
      const { error: e } = await owner.client.rpc("close_contact", { p_contact_id: id, p_status: "closing", p_nilai: nilai, p_alasan: null, p_catatan: null });
      if (e) throw e;
    }
    const { error: lostError } = await owner.client.rpc("close_contact", {
      p_contact_id: b[0],
      p_status: "lost",
      p_nilai: null,
      p_alasan: "harga",
      p_catatan: null,
    });
    if (lostError) throw lostError;

    // Respon: pesan masuk 10:00, dibalas 10:06 (6 menit) untuk satu kontak CS.
    const base = Date.now() - 2 * 60 * 60 * 1000;
    const msgs = [
      { arah: "masuk", t: 0 },
      { arah: "keluar", t: 6 },
      { arah: "masuk", t: 30 },
      { arah: "keluar", t: 50 },
    ];
    const { error: msgError } = await ctx.admin.from("messages").insert(
      msgs.map((m, i) => ({
        workspace_id: ws,
        contact_id: a[2],
        wa_message_id: `wamid.dash.${ctx.run}.${i}`,
        arah: m.arah,
        tipe: "text",
        isi: "x",
        dikirim_pada: new Date(base + m.t * 60_000).toISOString(),
      })),
    );
    if (msgError) throw msgError;
  });

  afterAll(async () => {
    if (supabaseEnabled) await ctx.cleanup();
  });

  it("sync Meta Ads menyimpan nama iklan dan spend, dan aman dijalankan ulang", async () => {
    const account = { id: accountId, workspace_id: ws, meta_ad_account_id: "act_123456" };
    expect(await syncAdAccount(ctx.admin, account, "token-uji", { graphVersion: "v27.0", fetchFn: fakeMeta })).toEqual({ rows: 2 });
    await syncAdAccount(ctx.admin, account, "token-uji", { graphVersion: "v27.0", fetchFn: fakeMeta });

    const { data: insights } = await ctx.admin.from("ad_insights_daily").select("spend").eq("workspace_id", ws);
    expect(insights).toHaveLength(2);
    const { data: acc } = await ctx.admin.from("ad_accounts").select("status_sync").eq("id", accountId).single();
    expect(acc?.status_sync).toBe("ok");
  });

  it("sync yang gagal dicatat di akun iklan dan sync_runs", async () => {
    const failing = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid token", code: 190 } }) });
    await expect(
      syncAdAccount(ctx.admin, { id: accountId, workspace_id: ws, meta_ad_account_id: "act_123456" }, "x", {
        graphVersion: "v27.0",
        fetchFn: failing,
      }),
    ).rejects.toThrow();
    const { data } = await ctx.admin.from("ad_accounts").select("status_sync, error_terakhir").eq("id", accountId).single();
    expect(data).toMatchObject({ status_sync: "gagal" });
    expect(data?.error_terakhir).toMatch(/Invalid token/);
  });

  it("dashboard_ads: spend, chat, closing, revenue per iklan dan baris organik", async () => {
    const { data, error } = await owner.client.rpc("dashboard_ads", { ws, dari: today, sampai: today });
    expect(error).toBeNull();
    const byId = Object.fromEntries((data as { meta_ad_id: string | null }[]).map((r) => [r.meta_ad_id ?? "organik", r]));
    expect(byId["AD-A"]).toMatchObject({ nama_iklan: "Promo Bundling", spend: 300000, chat: 3, closing: 2, revenue: 1_200_000 });
    expect(byId["AD-B"]).toMatchObject({ nama_iklan: "Diskon Ongkir", spend: 200000, chat: 4, closing: 0, revenue: 0 });
    expect(byId.organik).toMatchObject({ spend: 0, chat: 1, closing: 1, revenue: 100_000 });
  });

  it("dashboard_lost_reasons dan funnel", async () => {
    const lost = await owner.client.rpc("dashboard_lost_reasons", { ws, dari: today, sampai: today });
    expect(lost.data).toEqual([{ alasan: "harga", jumlah: 1 }]);

    const funnel = await owner.client.rpc("dashboard_funnel", { ws, dari: today, sampai: today });
    const rows = funnel.data as { nama: string; jumlah: number }[];
    expect(rows[0]).toMatchObject({ nama: "Baru", jumlah: 8 });
    expect(rows.find((r) => r.nama === "Closing")).toMatchObject({ jumlah: 3 });
  });

  it("dashboard_response menghitung median waktu balas per CS", async () => {
    const { data } = await owner.client.rpc("dashboard_response", { ws, dari: today, sampai: today });
    const total = (data as { is_total: boolean; total: number; dibalas: number; median_menit: number }[]).find((r) => r.is_total);
    expect(total).toMatchObject({ total: 2, dibalas: 2 });
    expect(Number(total!.median_menit)).toBe(13);
  });

  it("CS tidak bisa membaca data iklan", async () => {
    const { data } = await cs.client.from("ad_insights_daily").select("spend").eq("workspace_id", ws);
    expect(data).toEqual([]);
    const ads = await cs.client.rpc("dashboard_ads", { ws, dari: today, sampai: today });
    const spend = (ads.data as { spend: number }[]).reduce((t, r) => t + Number(r.spend), 0);
    expect(spend).toBe(0);
  });
});
