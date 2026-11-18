import { describe, expect, it } from "vitest";
import { cheapChatInsight, dateRange, parseRange, summarize, withMetrics, type AdRow } from "@/lib/dashboard";
import { fetchInsights, parseInsight, syncRange } from "@/lib/meta-ads/sync";

const row = (over: Partial<AdRow>): AdRow => ({
  meta_ad_id: "1",
  nama_iklan: "Iklan",
  nama_campaign: null,
  spend: 0,
  chat: 0,
  closing: 0,
  revenue: 0,
  ...over,
});

describe("rentang tanggal", () => {
  const now = new Date("2026-11-18T07:00:00Z");
  it("7 hari, 30 hari, bulan ini (Asia/Jakarta)", () => {
    expect(dateRange("7", now)).toEqual({ dari: "2026-11-12", sampai: "2026-11-18" });
    expect(dateRange("30", now)).toEqual({ dari: "2026-10-20", sampai: "2026-11-18" });
    expect(dateRange("bulan", now)).toEqual({ dari: "2026-11-01", sampai: "2026-11-18" });
  });
  it("parameter tidak dikenal kembali ke 30 hari", () => {
    expect(parseRange("99")).toBe("30");
    expect(parseRange(undefined)).toBe("30");
    expect(parseRange("bulan")).toBe("bulan");
  });
});

describe("metrik iklan", () => {
  it("biaya per chat, biaya per closing, ROAS", () => {
    expect(withMetrics(row({ spend: 3_100_000, chat: 141, closing: 24, revenue: 38_400_000 }))).toMatchObject({
      biayaPerChat: 3_100_000 / 141,
      biayaPerClosing: 3_100_000 / 24,
      roas: 38_400_000 / 3_100_000,
    });
  });

  it("tanpa spend atau tanpa closing → null, bukan nol atau tak hingga", () => {
    expect(withMetrics(row({ spend: 0, chat: 5, closing: 1, revenue: 100 }))).toMatchObject({
      biayaPerChat: null,
      biayaPerClosing: null,
      roas: null,
    });
    expect(withMetrics(row({ spend: 1000, chat: 5, closing: 0 })).biayaPerClosing).toBeNull();
  });

  it("ringkasan memisahkan iklan dan organik", () => {
    const s = summarize(
      [
        row({ meta_ad_id: "a", spend: 1000, chat: 10, closing: 2, revenue: 5000 }),
        row({ meta_ad_id: "b", spend: 1000, chat: 20, closing: 0, revenue: 0 }),
        row({ meta_ad_id: null, chat: 7, closing: 1, revenue: 900 }),
      ].map(withMetrics),
    );
    expect(s).toMatchObject({ spend: 2000, chat: 37, chatIklan: 30, chatOrganik: 7, closing: 3, closingIklan: 2, revenue: 5900 });
    expect(s.biayaPerClosing).toBe(1000);
    expect(s.roas).toBe(2.5);
  });

  it("insight chat murah: iklan dengan biaya per chat termurah tapi closing termahal", () => {
    const rows = [
      row({ meta_ad_id: "a", nama_iklan: "Bundling", spend: 3_100_000, chat: 141, closing: 24 }),
      row({ meta_ad_id: "b", nama_iklan: "Ongkir", spend: 2_200_000, chat: 120, closing: 2 }),
    ].map(withMetrics);
    expect(cheapChatInsight(rows)).toMatchObject({ kind: "closing-mahal", ad: { nama_iklan: "Ongkir" } });
    expect(cheapChatInsight(rows.slice(0, 1))).toBeNull();
  });
});

describe("Meta Ads insights", () => {
  it("parseInsight membaca spend, klik, dan percakapan dimulai", () => {
    expect(
      parseInsight({
        ad_id: "120200000000000001",
        ad_name: "Promo Bundling",
        campaign_name: "Ramadhan",
        date_start: "2026-11-17",
        spend: "125000.50",
        impressions: "10000",
        clicks: "321",
        actions: [
          { action_type: "link_click", value: "300" },
          { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "42" },
        ],
      }),
    ).toEqual({
      metaAdId: "120200000000000001",
      namaIklan: "Promo Bundling",
      namaAdset: null,
      namaCampaign: "Ramadhan",
      tanggal: "2026-11-17",
      spend: 125000.5,
      impressions: 10000,
      klik: 321,
      percakapanDimulai: 42,
    });
  });

  it("syncRange menarik ulang 3 hari terakhir", () => {
    expect(syncRange(new Date("2026-11-18T07:00:00Z"))).toEqual({ since: "2026-11-15", until: "2026-11-18" });
  });

  it("fetchInsights mengikuti paging dan melempar error Meta", async () => {
    const pages: Record<string, unknown> = {
      first: { data: [{ ad_id: "1", date_start: "2026-11-17" }], paging: { next: "https://graph.facebook.com/next" } },
      "https://graph.facebook.com/next": { data: [{ ad_id: "2", date_start: "2026-11-17" }] },
    };
    const fetchFn = async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes("/insights?") ? pages.first : pages[url]),
    });
    const rows = await fetchInsights("act_1", "token", { since: "2026-11-15", until: "2026-11-18" }, { graphVersion: "v27.0", fetchFn });
    expect(rows.map((r) => r.ad_id)).toEqual(["1", "2"]);

    const failing = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid token", code: 190 } }) });
    await expect(
      fetchInsights("act_1", "token", { since: "a", until: "b" }, { graphVersion: "v27.0", fetchFn: failing }),
    ).rejects.toThrow(/Invalid token/);
  });
});
