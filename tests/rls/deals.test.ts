import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, supabaseEnabled, type TestUser } from "../helpers/supabase";

// close_contact dan tabel deals: data wajib, RLS, dan perpindahan stage.

describe.skipIf(!supabaseEnabled)("Closing / Lost", { timeout: 60_000 }, () => {
  const ctx = supabaseEnabled ? createTestContext("deals") : (null as never);
  let ws: string;
  let owner: TestUser;
  let cs1: TestUser;
  let cs2: TestUser;

  const close = (user: TestUser, contactId: string, status: "closing" | "lost", extra: Record<string, unknown> = {}) =>
    user.client.rpc("close_contact", {
      p_contact_id: contactId,
      p_status: status,
      p_nilai: null,
      p_alasan: null,
      p_catatan: null,
      ...extra,
    });

  async function newContact(phone: string, assigned: TestUser) {
    const { data: stage } = await ctx.admin.from("stages").select("id").eq("workspace_id", ws).eq("urutan", 1).single();
    const { data, error } = await ctx.admin
      .from("contacts")
      .insert({ workspace_id: ws, nomor_hp: phone, assigned_to: assigned.id, stage_id: stage!.id })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async function stageTipe(contactId: string) {
    const { data } = await ctx.admin.from("contacts").select("stages(tipe)").eq("id", contactId).single();
    return (data as unknown as { stages: { tipe: string } }).stages.tipe;
  }

  beforeAll(async () => {
    ws = await ctx.workspace("a");
    [owner, cs1, cs2] = await Promise.all([ctx.user("owner"), ctx.user("cs1"), ctx.user("cs2")]);
    await Promise.all([ctx.member(owner, ws, "owner"), ctx.member(cs1, ws, "cs"), ctx.member(cs2, ws, "cs")]);
  });

  afterAll(async () => {
    if (supabaseEnabled) await ctx.cleanup();
  });

  it("Closing wajib nilai; berhasil memindah kontak ke stage Closing dan mencatat deal", async () => {
    const id = await newContact("6281200000301", cs1);
    expect((await close(cs1, id, "closing")).error).not.toBeNull();
    expect(await stageTipe(id)).toBe("normal");

    const ok = await close(cs1, id, "closing", { p_nilai: 1_250_000, p_catatan: "transfer BCA" });
    expect(ok.error).toBeNull();
    expect(await stageTipe(id)).toBe("closing");
    const { data } = await cs1.client.from("deals").select("status, nilai, oleh_user").eq("contact_id", id);
    expect(data).toEqual([{ status: "closing", nilai: 1_250_000, oleh_user: cs1.id }]);
  });

  it("Lost wajib alasan dari daftar; Lainnya wajib catatan", async () => {
    const id = await newContact("6281200000302", cs1);
    expect((await close(cs1, id, "lost")).error).not.toBeNull();
    expect((await close(cs1, id, "lost", { p_alasan: "alasan_ngawur" })).error).not.toBeNull();
    expect((await close(cs1, id, "lost", { p_alasan: "lainnya" })).error).not.toBeNull();
    expect(await stageTipe(id)).toBe("normal");

    expect((await close(cs1, id, "lost", { p_alasan: "harga" })).error).toBeNull();
    expect(await stageTipe(id)).toBe("lost");
  });

  it("CS lain tidak bisa menandai kontak yang bukan miliknya", async () => {
    const id = await newContact("6281200000303", cs1);
    expect((await close(cs2, id, "closing", { p_nilai: 500_000 })).error).not.toBeNull();
    expect(await stageTipe(id)).toBe("normal");
    const { data } = await ctx.admin.from("deals").select("id").eq("contact_id", id);
    expect(data).toEqual([]);
  });

  it("deal tidak bisa diubah atau dihapus, dan tidak bisa ditulis atas nama orang lain", async () => {
    const id = await newContact("6281200000304", cs1);
    await close(cs1, id, "closing", { p_nilai: 100_000 });
    const { data: deal } = await ctx.admin.from("deals").select("id").eq("contact_id", id).single();

    const edit = await owner.client.from("deals").update({ nilai: 1 }).eq("id", deal!.id).select("id");
    expect(edit.error ?? edit.data?.length === 0).toBeTruthy();
    const del = await owner.client.from("deals").delete().eq("id", deal!.id).select("id");
    expect(del.error ?? del.data?.length === 0).toBeTruthy();

    const forged = await cs1.client
      .from("deals")
      .insert({ workspace_id: ws, contact_id: id, status: "closing", nilai: 9, oleh_user: owner.id });
    expect(forged.error).not.toBeNull();
  });

  it("kontak yang sudah Closing dan chat lagi dibuka ulang, deal lama tetap tersimpan", async () => {
    const id = await newContact("6281200000305", cs1);
    await close(cs1, id, "closing", { p_nilai: 200_000 });
    const { data: number, error } = await ctx.admin
      .from("wa_numbers")
      .insert({ workspace_id: ws, phone_number_id: `deals-${ctx.run}`, waba_id: "uji", label: "Uji" })
      .select("phone_number_id")
      .single();
    if (error) throw error;
    await ctx.admin.rpc("ingest_message", {
      p_phone_number_id: number.phone_number_id,
      p_wa_message_id: `wamid.deals.${ctx.run}`,
      p_arah: "masuk",
      p_customer_phone: "6281200000305",
      p_customer_name: null,
      p_tipe: "text",
      p_isi: "mau order lagi",
      p_media_id: null,
      p_media_mime: null,
      p_nama_file: null,
      p_referral: null,
      p_dikirim_pada: new Date().toISOString(),
      p_dari_history: false,
    });
    expect(await stageTipe(id)).toBe("normal");
    const { data } = await ctx.admin.from("deals").select("nilai").eq("contact_id", id);
    expect(data).toEqual([{ nilai: 200_000 }]);
  });
});
