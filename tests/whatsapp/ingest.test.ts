import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NormalizedMessage } from "@/lib/whatsapp/adapter";
import { ingestMessage } from "@/lib/whatsapp/processor";
import { createTestContext, supabaseEnabled, type TestUser } from "../helpers/supabase";

// Test integrasi fungsi SQL ingest_message dan RLS kontak/pesan terhadap
// project Supabase dev. Dilewati jika kunci Supabase tidak tersedia.

describe.skipIf(!supabaseEnabled)("ingest_message + RLS kontak", { timeout: 60_000 }, () => {
  const ctx = supabaseEnabled ? createTestContext("ingest") : (null as never);
  const phoneNumberId = `uji-${Math.random().toString(36).slice(2)}`;
  let ws: string;
  let owner: TestUser;
  let cs1: TestUser;
  let cs2: TestUser;
  const base = Date.now() - 60 * 60 * 1000;
  const at = (minutes: number) => new Date(base + minutes * 60 * 1000);

  const msg = (over: Partial<NormalizedMessage>): NormalizedMessage => ({
    phoneNumberId,
    waMessageId: `wamid.${ctx.run}.${Math.random().toString(36).slice(2)}`,
    direction: "masuk",
    customerPhone: "6281200000101",
    customerName: "Budi",
    type: "text",
    text: "Halo",
    media: null,
    referral: null,
    sentAt: at(0),
    fromHistory: false,
    ...over,
  });

  const contact = async (phone: string) => {
    const { data } = await ctx.admin
      .from("contacts")
      .select("*, stages(nama)")
      .eq("workspace_id", ws)
      .eq("nomor_hp", phone)
      .single();
    return data;
  };

  beforeAll(async () => {
    ws = await ctx.workspace("a");
    [owner, cs1, cs2] = await Promise.all([ctx.user("owner"), ctx.user("cs1"), ctx.user("cs2")]);
    await Promise.all([ctx.member(owner, ws, "owner"), ctx.member(cs1, ws, "cs"), ctx.member(cs2, ws, "cs")]);
    const { error } = await ctx.admin
      .from("wa_numbers")
      .insert({ workspace_id: ws, phone_number_id: phoneNumberId, waba_id: "uji", label: "Sales 1", cs_pemilik: cs1.id });
    if (error) throw error;
  });

  afterAll(async () => {
    if (supabaseEnabled) await ctx.cleanup();
  });

  it("pesan pertama membuat kontak di stage Baru, di-assign ke CS pemilik nomor, menunggu balasan", async () => {
    expect(await ingestMessage(ctx.admin, msg({ sentAt: at(1), text: "Kak, ready?" }))).toBe("inserted");
    const c = await contact("6281200000101");
    expect(c).toMatchObject({
      nama: "Budi",
      assigned_to: cs1.id,
      sumber: "organik",
      arah_pesan_terakhir: "masuk",
      pesan_terakhir_cuplikan: "Kak, ready?",
    });
    expect(c.stages.nama).toBe("Baru");
    expect(new Date(c.menunggu_balasan_sejak).getTime()).toBe(at(1).getTime());
  });

  it("pesan yang sama tidak tersimpan dua kali", async () => {
    const m = msg({ sentAt: at(2) });
    expect(await ingestMessage(ctx.admin, m)).toBe("inserted");
    expect(await ingestMessage(ctx.admin, m)).toBe("duplicate");
  });

  it("balasan CS dari HP menghapus status menunggu", async () => {
    await ingestMessage(ctx.admin, msg({ direction: "keluar", sentAt: at(5), text: "Ready kak" }));
    const c = await contact("6281200000101");
    expect(c.menunggu_balasan_sejak).toBeNull();
    expect(c.arah_pesan_terakhir).toBe("keluar");
  });

  it("pesan masuk lama yang datang terlambat tidak membuat status menunggu dan tidak menimpa pesan terakhir", async () => {
    await ingestMessage(ctx.admin, msg({ sentAt: at(3), text: "telat" }));
    const c = await contact("6281200000101");
    expect(c.menunggu_balasan_sejak).toBeNull();
    expect(c.pesan_terakhir_cuplikan).toBe("Ready kak");
  });

  it("atribusi first-touch: iklan pertama disimpan dan tidak ditimpa iklan berikutnya", async () => {
    const phone = "6281200000102";
    await ingestMessage(
      ctx.admin,
      msg({ customerPhone: phone, sentAt: at(10), referral: { source_id: "AD-1", headline: "Promo 1", ctwa_clid: "CLID-1" } }),
    );
    await ingestMessage(ctx.admin, msg({ customerPhone: phone, sentAt: at(11), referral: { source_id: "AD-2" } }));
    const c = await contact(phone);
    expect(c).toMatchObject({ sumber: "ctwa", ad_id: "AD-1", ctwa_clid: "CLID-1", referral_headline: "Promo 1" });
  });

  it("riwayat lebih dari 7 hari tidak dihitung menunggu balasan", async () => {
    const phone = "6281200000103";
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await ingestMessage(ctx.admin, msg({ customerPhone: phone, sentAt: old, fromHistory: true }));
    expect((await contact(phone)).menunggu_balasan_sejak).toBeNull();
  });

  it("nomor yang belum terdaftar ditolak dengan unknown_number", async () => {
    expect(await ingestMessage(ctx.admin, msg({ phoneNumberId: "tidak-terdaftar" }))).toBe("unknown_number");
  });

  it("kontak Closing yang chat lagi dibuka ulang ke Baru dan tercatat di riwayat stage", async () => {
    const phone = "6281200000104";
    await ingestMessage(ctx.admin, msg({ customerPhone: phone, sentAt: at(20) }));
    const c = await contact(phone);
    const { data: closing } = await ctx.admin.from("stages").select("id").eq("workspace_id", ws).eq("tipe", "closing").single();
    await ctx.admin.from("contacts").update({ stage_id: closing!.id }).eq("id", c.id);

    await ingestMessage(ctx.admin, msg({ customerPhone: phone, sentAt: at(21), text: "mau order lagi" }));
    expect((await contact(phone)).stages.nama).toBe("Baru");
    const { data: history } = await ctx.admin.from("stage_history").select("id").eq("contact_id", c.id);
    expect(history!.length).toBeGreaterThanOrEqual(3);
  });

  describe("RLS", () => {
    it("CS pemilik melihat kontak dan pesannya; CS lain tidak", async () => {
      const own = await cs1.client.from("contacts").select("id").eq("nomor_hp", "6281200000101");
      expect(own.data).toHaveLength(1);
      const ownMessages = await cs1.client.from("messages").select("id").eq("contact_id", own.data![0].id);
      expect(ownMessages.data!.length).toBeGreaterThan(0);

      const other = await cs2.client.from("contacts").select("id").eq("workspace_id", ws);
      expect(other.data).toEqual([]);
      const otherMessages = await cs2.client.from("messages").select("id").eq("workspace_id", ws);
      expect(otherMessages.data).toEqual([]);
    });

    it("Owner melihat semua kontak workspace", async () => {
      const { data } = await owner.client.from("contacts").select("id").eq("workspace_id", ws);
      expect(data!.length).toBeGreaterThanOrEqual(4);
    });

    it("user tidak bisa memanggil ingest_message atau menulis pesan langsung", async () => {
      const rpc = await cs1.client.rpc("ingest_message", {
        p_phone_number_id: phoneNumberId,
        p_wa_message_id: "wamid.palsu",
        p_arah: "masuk",
        p_customer_phone: "6281200000199",
        p_customer_name: null,
        p_tipe: "text",
        p_isi: "palsu",
        p_media_id: null,
        p_media_mime: null,
        p_nama_file: null,
        p_referral: null,
        p_dikirim_pada: new Date().toISOString(),
        p_dari_history: false,
      });
      expect(rpc.error).not.toBeNull();
      const insert = await owner.client.from("messages").insert({
        workspace_id: ws,
        contact_id: (await contact("6281200000101")).id,
        wa_message_id: "wamid.palsu2",
        arah: "masuk",
        tipe: "text",
        dikirim_pada: new Date().toISOString(),
      });
      expect(insert.error).not.toBeNull();
    });

    it("CS bisa memindah stage kontaknya, tetapi tidak bisa melempar kontak ke CS lain", async () => {
      const c = await contact("6281200000101");
      const { data: tertarik } = await ctx.admin.from("stages").select("id").eq("workspace_id", ws).eq("nama", "Tertarik").single();
      const moved = await cs1.client.from("contacts").update({ stage_id: tertarik!.id }).eq("id", c.id).select("id");
      expect(moved.data).toHaveLength(1);
      const { data: history } = await ctx.admin
        .from("stage_history")
        .select("oleh_user")
        .eq("contact_id", c.id)
        .eq("ke_stage", tertarik!.id);
      expect(history![0].oleh_user).toBe(cs1.id);

      const reassign = await cs1.client.from("contacts").update({ assigned_to: cs2.id }).eq("id", c.id).select("id");
      expect(reassign.error ?? reassign.data?.length === 0).toBeTruthy();
      expect((await contact("6281200000101")).assigned_to).toBe(cs1.id);
    });

    it("CS tidak bisa menambah nomor WhatsApp", async () => {
      const { error } = await cs1.client
        .from("wa_numbers")
        .insert({ workspace_id: ws, phone_number_id: `liar-${ctx.run}`, waba_id: "x", label: "liar" });
      expect(error).not.toBeNull();
    });
  });
});
