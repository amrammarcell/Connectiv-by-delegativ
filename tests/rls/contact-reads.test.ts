import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, supabaseEnabled, type TestUser } from "../helpers/supabase";

// Status baca per user (contact_reads), daftar inbox berfilter, nama iklan,
// dan dashboard v2 (migrasi 20261128110000). Project dev.

describe.skipIf(!supabaseEnabled)("RLS: status baca, inbox, nama iklan", { timeout: 60_000 }, () => {
  const ctx = supabaseEnabled ? createTestContext("reads") : (null as never);
  let ws: string;
  let wsOther: string;
  let owner: TestUser;
  let supervisor: TestUser;
  let cs1: TestUser;
  let cs2: TestUser;
  let ownerOther: TestUser;
  let contactCs1: string;
  let contactCs2: string;
  let contactOther: string;

  async function contact(workspaceId: string, nomor: string, assigned: string | null, extra: Record<string, unknown> = {}) {
    const { data, error } = await ctx.admin
      .from("contacts")
      .insert({
        workspace_id: workspaceId,
        nomor_hp: nomor,
        assigned_to: assigned,
        pesan_terakhir_pada: new Date().toISOString(),
        arah_pesan_terakhir: "masuk",
        ...extra,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  beforeAll(async () => {
    [ws, wsOther] = await Promise.all([ctx.workspace("a"), ctx.workspace("b")]);
    [owner, supervisor, cs1, cs2, ownerOther] = await Promise.all([
      ctx.user("owner"),
      ctx.user("supervisor"),
      ctx.user("cs1"),
      ctx.user("cs2"),
      ctx.user("owner-b"),
    ]);
    await Promise.all([
      ctx.member(owner, ws, "owner"),
      ctx.member(supervisor, ws, "supervisor"),
      ctx.member(cs1, ws, "cs"),
      ctx.member(cs2, ws, "cs"),
      ctx.member(ownerOther, wsOther, "owner"),
    ]);
    [contactCs1, contactCs2, contactOther] = await Promise.all([
      contact(ws, "6281200000301", cs1.id, { sumber: "ctwa", ad_id: "120000000001", referral_headline: "Promo headline" }),
      contact(ws, "6281200000302", cs2.id),
      contact(wsOther, "6281200000303", null),
    ]);
    const { error } = await ctx.admin
      .from("ads")
      .insert({ workspace_id: ws, meta_ad_id: "120000000001", nama_iklan: "Iklan Meta Resmi" });
    if (error) throw error;
  });

  afterAll(async () => {
    if (supabaseEnabled) await ctx.cleanup();
  });

  describe("contact_reads", () => {
    it("CS bisa menandai kontak miliknya sebagai dibaca", async () => {
      const { error } = await cs1.client
        .from("contact_reads")
        .upsert({ user_id: cs1.id, contact_id: contactCs1, workspace_id: ws });
      expect(error).toBeNull();
    });

    it("CS tidak bisa menandai kontak CS lain atau kontak workspace lain", async () => {
      const otherCs = await cs1.client.from("contact_reads").insert({ user_id: cs1.id, contact_id: contactCs2, workspace_id: ws });
      expect(otherCs.error).not.toBeNull();
      const otherWs = await owner.client
        .from("contact_reads")
        .insert({ user_id: owner.id, contact_id: contactOther, workspace_id: wsOther });
      expect(otherWs.error).not.toBeNull();
      // workspace_id palsu untuk kontak yang terlihat juga ditolak.
      const mismatch = await owner.client
        .from("contact_reads")
        .insert({ user_id: owner.id, contact_id: contactCs1, workspace_id: wsOther });
      expect(mismatch.error).not.toBeNull();
    });

    it("tidak bisa menulis status baca atas nama user lain", async () => {
      const { error } = await supervisor.client
        .from("contact_reads")
        .insert({ user_id: cs1.id, contact_id: contactCs2, workspace_id: ws });
      expect(error).not.toBeNull();
    });

    it("status baca hanya terlihat oleh pemiliknya, termasuk bagi Owner workspace", async () => {
      const own = await cs1.client.from("contact_reads").select("contact_id");
      expect(own.data?.map((r) => r.contact_id)).toEqual([contactCs1]);
      for (const user of [owner, supervisor, cs2, ownerOther]) {
        const { data } = await user.client.from("contact_reads").select("contact_id").eq("user_id", cs1.id);
        expect(data ?? []).toEqual([]);
      }
      const anon = await ctx.anon().from("contact_reads").select("contact_id");
      expect(anon.data ?? []).toEqual([]);
    });

    it("mark_all_contacts_read hanya menyentuh kontak yang terlihat pemanggil", async () => {
      const { data, error } = await cs2.client.rpc("mark_all_contacts_read", { ws });
      expect(error).toBeNull();
      expect(data).toBe(1);
      const foreign = await ownerOther.client.rpc("mark_all_contacts_read", { ws });
      expect(foreign.data).toBe(0);
    });
  });

  describe("inbox_contacts dan inbox_summary", () => {
    it("CS hanya mendapat kontak miliknya; workspace lain kosong", async () => {
      const { data } = await cs1.client.rpc("inbox_contacts", { ws });
      expect((data as { id: string }[]).map((r) => r.id)).toEqual([contactCs1]);
      const foreign = await ownerOther.client.rpc("inbox_contacts", { ws });
      expect(foreign.data ?? []).toEqual([]);
    });

    it("filter belum dibaca memakai status baca pemanggil sendiri", async () => {
      const ownerUnread = await owner.client.rpc("inbox_contacts", { ws, p_belum_dibaca: true });
      expect((ownerUnread.data as { id: string }[]).map((r) => r.id).sort()).toEqual([contactCs1, contactCs2].sort());
      const cs1Unread = await cs1.client.rpc("inbox_contacts", { ws, p_belum_dibaca: true });
      expect(cs1Unread.data ?? []).toEqual([]);
      const summary = await owner.client.rpc("inbox_summary", { ws });
      expect(Number((summary.data as { belum_dibaca: number }[])[0]!.belum_dibaca)).toBe(2);
    });

    it("filter CS dan iklan", async () => {
      const byCs = await owner.client.rpc("inbox_contacts", { ws, p_cs: cs2.id });
      expect((byCs.data as { id: string }[]).map((r) => r.id)).toEqual([contactCs2]);
      const byAd = await owner.client.rpc("inbox_contacts", { ws, p_iklan: "120000000001" });
      expect((byAd.data as { id: string }[]).map((r) => r.id)).toEqual([contactCs1]);
    });
  });

  describe("workspace_ad_names", () => {
    it("CS membaca nama iklan Meta tanpa akses ke tabel ads", async () => {
      const ads = await cs1.client.from("ads").select("id").eq("workspace_id", ws);
      expect(ads.data ?? []).toEqual([]);
      const { data } = await cs1.client.rpc("workspace_ad_names", { ws });
      expect(data).toEqual([{ meta_ad_id: "120000000001", nama: "Iklan Meta Resmi" }]);
    });

    it("bukan anggota tidak mendapat apa pun", async () => {
      const { data } = await ownerOther.client.rpc("workspace_ad_names", { ws });
      expect(data ?? []).toEqual([]);
    });
  });

  describe("dashboard v2", () => {
    it("filter CS membatasi kohort chat", async () => {
      const all = await owner.client.rpc("dashboard_ads_v2", { ws, dari: "2000-01-01", sampai: "2100-01-01" });
      const total = (all.data as { chat: number }[]).reduce((t, r) => t + Number(r.chat), 0);
      expect(total).toBe(2);
      const cs = await owner.client.rpc("dashboard_ads_v2", { ws, dari: "2000-01-01", sampai: "2100-01-01", p_cs: cs1.id });
      expect((cs.data as { meta_ad_id: string | null; chat: number }[]).filter((r) => Number(r.chat) > 0)).toEqual([
        expect.objectContaining({ meta_ad_id: "120000000001", chat: 1 }),
      ]);
    });
  });
});
