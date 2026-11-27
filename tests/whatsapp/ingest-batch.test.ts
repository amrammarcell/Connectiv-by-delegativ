import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NormalizedMessage, NormalizedUpdate } from "@/lib/whatsapp/adapter";
import { applyAccountUpdates, ingestAll, ingestBatch, ingestMessage, processWebhookEvent } from "@/lib/whatsapp/processor";
import { createTestContext, supabaseEnabled, type TestUser } from "../helpers/supabase";

// Test integrasi ingest_messages (berkelompok) terhadap project Supabase dev:
// hasil sama dengan ingest_message satu per satu, idempoten, aman untuk urutan
// acak, edit/revoke, status nomor dari account_update.

describe.skipIf(!supabaseEnabled)("ingest_messages (berkelompok)", { timeout: 120_000 }, () => {
  const ctx = supabaseEnabled ? createTestContext("batch") : (null as never);
  const tag = Math.random().toString(36).slice(2, 10);
  const pnSingle = `uji-satu-${tag}`;
  const pnBatch = `uji-batch-${tag}`;
  const pnEdit = `uji-edit-${tag}`;
  const wabaEdit = `uji-waba-${tag}`;
  let wsSingle: string;
  let wsBatch: string;
  let wsEdit: string;
  let cs: TestUser;
  const webhookEventIds: string[] = [];

  const started = Date.now();
  const base = started - 3 * 60 * 60 * 1000;
  const at = (minutes: number) => new Date(base + minutes * 60 * 1000);
  const oldDate = (days: number, minutes = 0) => new Date(started - days * 24 * 60 * 60 * 1000 + minutes * 60 * 1000);

  // Skenario campuran: beberapa kontak, masuk/keluar, riwayat lama dan baru,
  // referral dari dua iklan, media, pesan duplikat dalam payload.
  function scenario(phoneNumberId: string): NormalizedMessage[] {
    const m = (
      id: string,
      phone: string,
      direction: "masuk" | "keluar",
      sentAt: Date,
      over: Partial<NormalizedMessage> = {},
    ): NormalizedMessage => ({
      phoneNumberId,
      waMessageId: `wamid.${phoneNumberId}.${id}`,
      direction,
      customerPhone: phone,
      customerName: direction === "masuk" ? `Pelanggan ${phone.slice(-2)}` : null,
      type: "text",
      text: `teks ${id}`,
      media: null,
      referral: null,
      sentAt,
      fromHistory: false,
      ...over,
    });
    return [
      m("a1", "6281300000001", "masuk", at(1), { referral: { source_id: "AD-1", headline: "Promo 1", ctwa_clid: "C1" } }),
      m("a2", "6281300000001", "keluar", at(5)),
      m("a3", "6281300000001", "masuk", at(9), { referral: { source_id: "AD-2" } }),
      m("a4", "6281300000001", "masuk", at(12), { type: "image", text: null, media: { id: "MED-1", mime: "image/jpeg", filename: null } }),
      m("b1", "6281300000002", "masuk", oldDate(20), { fromHistory: true }),
      m("b2", "6281300000002", "keluar", oldDate(20, 3), { fromHistory: true }),
      m("b3", "6281300000002", "masuk", oldDate(19), { fromHistory: true }),
      m("c1", "6281300000003", "keluar", at(2), { fromHistory: true }),
      m("c2", "6281300000003", "masuk", at(4), { fromHistory: true }),
      m("c3", "6281300000003", "masuk", at(6), { type: "document", text: null, media: { id: "MED-2", mime: "application/pdf", filename: "PO.pdf" } }),
      m("d1", "6281300000004", "keluar", at(3)),
      m("d2", "6281300000004", "keluar", at(7)),
    ];
  }

  function shuffle<T>(items: T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  async function snapshot(workspaceId: string) {
    const { data: contacts } = await ctx.admin
      .from("contacts")
      .select(
        "nomor_hp, nama, sumber, ad_id, ctwa_clid, referral_headline, referral_pada, pesan_terakhir_pada, pesan_terakhir_cuplikan, arah_pesan_terakhir, menunggu_balasan_sejak, assigned_to, stages(nama)",
      )
      .eq("workspace_id", workspaceId)
      .order("nomor_hp");
    const { data: messages } = await ctx.admin
      .from("messages")
      .select("wa_message_id, arah, tipe, isi, media_id, media_mime, nama_file, dari_history, dikirim_pada, contacts(nomor_hp)")
      .eq("workspace_id", workspaceId)
      .order("dikirim_pada");
    const norm = (v: string | null) => (v ? new Date(v).toISOString() : null);
    return {
      contacts: (contacts ?? []).map((c) => ({
        ...c,
        referral_pada: norm(c.referral_pada),
        pesan_terakhir_pada: norm(c.pesan_terakhir_pada),
        menunggu_balasan_sejak: norm(c.menunggu_balasan_sejak),
      })),
      messages: (messages ?? []).map((x) => ({
        ...x,
        wa_message_id: x.wa_message_id.split(".").at(-1),
        dikirim_pada: norm(x.dikirim_pada),
      })),
    };
  }

  beforeAll(async () => {
    [wsSingle, wsBatch, wsEdit] = await Promise.all([ctx.workspace("satu"), ctx.workspace("batch"), ctx.workspace("edit")]);
    cs = await ctx.user("cs");
    await Promise.all([ctx.member(cs, wsSingle, "cs"), ctx.member(cs, wsBatch, "cs"), ctx.member(cs, wsEdit, "cs")]);
    const { error } = await ctx.admin.from("wa_numbers").insert([
      { workspace_id: wsSingle, phone_number_id: pnSingle, waba_id: "uji", label: "Satu", cs_pemilik: cs.id },
      { workspace_id: wsBatch, phone_number_id: pnBatch, waba_id: "uji", label: "Batch", cs_pemilik: cs.id },
      { workspace_id: wsEdit, phone_number_id: pnEdit, waba_id: wabaEdit, label: "Edit", nomor_tampil: "+62 811-0000-0000" },
    ]);
    if (error) throw error;
  });

  afterAll(async () => {
    if (!supabaseEnabled) return;
    if (webhookEventIds.length) await ctx.admin.from("webhook_events").delete().in("id", webhookEventIds);
    await ctx.cleanup();
  });

  it("hasil sama dengan ingest_message satu per satu, walau urutan acak dan dibagi beberapa batch", async () => {
    for (const m of scenario(pnSingle)) await ingestMessage(ctx.admin, m);

    const batch = scenario(pnBatch);
    // Duplikat di dalam payload yang sama (Meta bisa mengirim ulang).
    const result = await ingestAll(ctx.admin, shuffle([...batch, batch[0]!, batch[5]!]), [], 5);
    expect(result).toMatchObject({ inserted: batch.length, duplicate: 2, unknownNumbers: [] });

    const single = await snapshot(wsSingle);
    const batched = await snapshot(wsBatch);
    expect(batched.contacts).toHaveLength(4);
    expect(batched.messages).toHaveLength(batch.length);
    expect(batched).toEqual(single);

    // Sanity: aturan bisnis tetap berlaku.
    const c1 = batched.contacts.find((c) => c.nomor_hp === "6281300000001")!;
    expect(c1).toMatchObject({ sumber: "ctwa", ad_id: "AD-1", pesan_terakhir_cuplikan: "Gambar", arah_pesan_terakhir: "masuk" });
    expect(c1.menunggu_balasan_sejak).toBe(at(9).toISOString());
    const c2 = batched.contacts.find((c) => c.nomor_hp === "6281300000002")!;
    expect(c2.menunggu_balasan_sejak).toBeNull();
  });

  it("idempoten: payload yang sama diproses ulang tidak mengubah apa pun", async () => {
    const before = await snapshot(wsBatch);
    const again = await ingestAll(ctx.admin, shuffle(scenario(pnBatch)));
    expect(again).toMatchObject({ inserted: 0, duplicate: scenario(pnBatch).length });
    expect(await snapshot(wsBatch)).toEqual(before);
  });

  it("nomor belum terdaftar dilaporkan sekali, pesan nomor lain tetap masuk", async () => {
    const [known] = scenario(pnBatch);
    const fresh = { ...known!, waMessageId: `wamid.${pnBatch}.baru`, sentAt: at(30) };
    const unknownA = { ...known!, phoneNumberId: `tidak-ada-${tag}`, waMessageId: `wamid.x1.${tag}` };
    const unknownB = { ...unknownA, waMessageId: `wamid.x2.${tag}` };
    const r = await ingestAll(ctx.admin, [unknownA, fresh, unknownB]);
    expect(r).toMatchObject({ inserted: 1, duplicate: 0, unknownNumbers: [`tidak-ada-${tag}`] });
  });

  it("edit memperbarui isi dan menandai diedit; revoke menandai dihapus; berlaku juga dalam batch yang sama", async () => {
    const m = (id: string, minutes: number, direction: "masuk" | "keluar" = "masuk"): NormalizedMessage => ({
      phoneNumberId: pnEdit,
      waMessageId: `wamid.${tag}.${id}`,
      direction,
      customerPhone: "6281300000009",
      customerName: "Uji Edit",
      type: "text",
      text: `asli ${id}`,
      media: null,
      referral: null,
      sentAt: at(minutes),
      fromHistory: false,
    });
    const upd = (kind: "edit" | "revoke", id: string, minutes: number, text: string | null = null): NormalizedUpdate => ({
      kind,
      phoneNumberId: pnEdit,
      originalWaMessageId: `wamid.${tag}.${id}`,
      text,
      at: at(minutes),
    });

    await ingestAll(ctx.admin, [m("e1", 1), m("e2", 2, "keluar")]);
    // e3 (pesan terakhir) dan edit/revoke-nya datang dalam satu batch.
    const r = await ingestAll(
      ctx.admin,
      [m("e3", 3)],
      [
        upd("edit", "e1", 10, "sudah diedit"),
        upd("edit", "e1", 5, "edit pertama"),
        upd("revoke", "e3", 11),
        upd("edit", "tidak-ada", 12, "x"),
      ],
    );
    // Dalam satu batch edit diterapkan urut waktu: hasil akhir = edit terbaru.
    expect(r).toMatchObject({ inserted: 1, edited: 2, revoked: 1, missing: 1 });
    // Edit lama yang datang terlambat di webhook berikutnya diabaikan; pesan
    // yang sudah ditarik tidak bisa diedit.
    expect(
      await ingestAll(ctx.admin, [], [upd("edit", "e1", 7, "edit telat"), upd("edit", "e3", 20, "edit setelah tarik")]),
    ).toMatchObject({ edited: 0, missing: 0 });

    const { data: rows } = await ctx.admin
      .from("messages")
      .select("wa_message_id, isi, diedit_pada, dihapus_pada")
      .eq("workspace_id", wsEdit)
      .order("dikirim_pada");
    const byId = Object.fromEntries((rows ?? []).map((x) => [x.wa_message_id.split(".").at(-1), x]));
    expect(byId.e1).toMatchObject({ isi: "sudah diedit", dihapus_pada: null });
    expect(new Date(byId.e1!.diedit_pada).toISOString()).toBe(at(10).toISOString());
    expect(byId.e2).toMatchObject({ isi: "asli e2", diedit_pada: null, dihapus_pada: null });
    expect(byId.e3!.dihapus_pada).not.toBeNull();
    expect(byId.e3!.isi).toBe("asli e3");

    const { data: contact } = await ctx.admin
      .from("contacts")
      .select("pesan_terakhir_cuplikan")
      .eq("workspace_id", wsEdit)
      .single();
    expect(contact!.pesan_terakhir_cuplikan).toBe("Pesan dihapus");

    // Mengulang batch yang sama tidak menghitung ulang.
    expect(await ingestBatch(ctx.admin, [{ kind: "revoke", phone_number_id: pnEdit, original_wa_message_id: `wamid.${tag}.e3`, pada: at(11).toISOString() }])).toMatchObject({ revoked: 0 });
  });

  it("webhook end-to-end: fixture edit/revoke diproses dari webhook_events", async () => {
    const original = (id: string, direction: "masuk" | "keluar"): NormalizedMessage => ({
      phoneNumberId: pnEdit,
      waMessageId: `wamid.${tag}.${id}`,
      direction,
      customerPhone: "6281300000009",
      customerName: null,
      type: "text",
      text: `asli ${id}`,
      media: null,
      referral: null,
      sentAt: at(20),
      fromHistory: false,
    });
    await ingestAll(ctx.admin, [original("f1", "masuk"), original("f2", "masuk"), original("f3", "keluar")]);

    const fixture = readFileSync("tests/fixtures/webhooks/coexistence-edit-revoke.json", "utf8")
      .replaceAll("200000000000001", pnEdit)
      .replaceAll("wamid.UJI-ASLI-", `wamid.${tag}.f`)
      .replaceAll("6281200000001", "6281300000009");
    const { data: event, error } = await ctx.admin
      .from("webhook_events")
      .insert({ sumber: "uji", jenis: "messages", payload_mentah: JSON.parse(fixture), diproses: false })
      .select("id")
      .single();
    if (error) throw error;
    webhookEventIds.push(event.id);

    const r = await processWebhookEvent(ctx.admin, event.id);
    expect(r).toMatchObject({ inserted: 0, edited: 2, revoked: 1, missing: 0, unknownNumbers: [] });
    const { data: f } = await ctx.admin
      .from("messages")
      .select("wa_message_id, isi, dihapus_pada")
      .in("wa_message_id", [`wamid.${tag}.f1`, `wamid.${tag}.f2`, `wamid.${tag}.f3`])
      .order("wa_message_id");
    expect(f!.map((x) => [x.isi, x.dihapus_pada !== null])).toEqual([
      ["Kak, ukuran XL ready?", false],
      ["asli f2", true],
      ["Ready kak, XL tinggal 2", false],
    ]);
    const { data: done } = await ctx.admin.from("webhook_events").select("diproses, error").eq("id", event.id).single();
    expect(done).toEqual({ diproses: true, error: null });
  });

  it("account_update PARTNER_REMOVED menandai nomor terputus; pesan baru menyambungkan lagi", async () => {
    expect(await applyAccountUpdates(ctx.admin, [{ event: "PARTNER_REMOVED", wabaId: wabaEdit, phoneNumber: null }])).toBe(1);
    const { data: off } = await ctx.admin.from("wa_numbers").select("status, status_alasan").eq("phone_number_id", pnEdit).single();
    expect(off).toEqual({ status: "terputus", status_alasan: "PARTNER_REMOVED" });

    // Event lain di WABA yang sama, atau nomor lain, tidak mengubah apa pun.
    expect(await applyAccountUpdates(ctx.admin, [{ event: "WEBHOOK_CONFIG_UPDATED", wabaId: wabaEdit, phoneNumber: null }])).toBe(0);
    expect(await applyAccountUpdates(ctx.admin, [{ event: "PARTNER_REMOVED", wabaId: wabaEdit, phoneNumber: "6289999999999" }])).toBe(0);

    await ingestAll(ctx.admin, [
      {
        phoneNumberId: pnEdit,
        waMessageId: `wamid.${tag}.sambung`,
        direction: "masuk",
        customerPhone: "6281300000009",
        customerName: null,
        type: "text",
        text: "halo lagi",
        media: null,
        referral: null,
        sentAt: new Date(),
        fromHistory: false,
      },
    ]);
    const { data: on } = await ctx.admin.from("wa_numbers").select("status").eq("phone_number_id", pnEdit).single();
    expect(on!.status).toBe("aktif");
  });

  it("user biasa tidak bisa memanggil ingest_messages atau webhook_event_stats", async () => {
    const rpc = await cs.client.rpc("ingest_messages", { p_messages: [] });
    expect(rpc.error).not.toBeNull();
    const stats = await cs.client.rpc("webhook_event_stats");
    expect(stats.error).not.toBeNull();
    // Kolom baru tidak bisa diubah user.
    const { data: msg } = await ctx.admin.from("messages").select("id").eq("workspace_id", wsBatch).limit(1).single();
    const upd = await cs.client.from("messages").update({ dihapus_pada: new Date().toISOString() }).eq("id", msg!.id).select("id");
    expect(upd.error).not.toBeNull();
  });
});
