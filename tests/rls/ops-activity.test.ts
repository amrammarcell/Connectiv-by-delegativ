import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, supabaseEnabled, type TestUser } from "../helpers/supabase";

// RLS dan fungsi untuk admin_access_log, page_visits, ops_alerts, dan
// pilot_metrics (migrasi 20261128130000). Project dev dipakai produksi: data
// uji dibuat per run lalu dihapus; jenis alert memakai nama khusus uji.

describe.skipIf(!supabaseEnabled)("RLS: log akses, kunjungan, alert, metrik pilot", { timeout: 60_000 }, () => {
  const ctx = supabaseEnabled ? createTestContext("ops") : (null as never);
  const alertJenis = `uji_${(supabaseEnabled ? ctx.run : "x").replace(/[^a-z]/g, "q")}`;
  const webhookIds: string[] = [];
  let wsA: string;
  let wsB: string;
  let superAdmin: TestUser;
  let ownerA: TestUser;
  let csA: TestUser;
  let ownerB: TestUser;

  beforeAll(async () => {
    [wsA, wsB] = await Promise.all([ctx.workspace("a"), ctx.workspace("b")]);
    [superAdmin, ownerA, csA, ownerB] = await Promise.all([
      ctx.user("super"),
      ctx.user("owner-a"),
      ctx.user("cs-a"),
      ctx.user("owner-b"),
    ]);
    const { error } = await ctx.admin.from("profiles").update({ is_super_admin: true }).eq("id", superAdmin.id);
    if (error) throw error;
    await Promise.all([ctx.member(ownerA, wsA, "owner"), ctx.member(csA, wsA, "cs"), ctx.member(ownerB, wsB, "owner")]);
  });

  // Berjalan walau beforeAll gagal di tengah jalan (mis. migrasi belum
  // diterapkan): setiap langkah berdiri sendiri, lalu jaring pengaman menghapus
  // workspace run ini berdasarkan slug, dan sisa workspace membuat test gagal
  // supaya tidak diam-diam tertinggal di DB bersama.
  afterAll(async () => {
    if (!supabaseEnabled) return;
    const steps: (() => PromiseLike<unknown>)[] = [
      () => (webhookIds.length ? ctx.admin.from("webhook_events").delete().in("id", webhookIds) : Promise.resolve()),
      () => ctx.admin.from("ops_alerts").delete().eq("jenis", alertJenis),
      () => (superAdmin ? ctx.admin.from("admin_access_log").delete().eq("user_id", superAdmin.id) : Promise.resolve()),
      () => ctx.cleanup(),
      () => ctx.admin.from("workspaces").delete().like("slug", `ops-%-${ctx.run}`),
    ];
    for (const step of steps) {
      try {
        // Client Supabase mengembalikan { error } alih-alih melempar.
        const result = (await step()) as { error?: { message: string } | null } | undefined;
        if (result?.error) console.error("cleanup ops-activity:", result.error.message);
      } catch (err) {
        console.error("cleanup ops-activity:", err instanceof Error ? err.message : err);
      }
    }
    const { data: left } = await ctx.admin.from("workspaces").select("slug").like("slug", `ops-%-${ctx.run}`);
    expect(left ?? [], "workspace uji tertinggal").toEqual([]);
  }, 120_000);

  describe("admin_access_log", () => {
    it("mencatat akses Super Admin non-anggota, dedupe 'lihat' 1 menit, tidak mencatat anggota", async () => {
      const log = (user: string, ws: string, path: string, aksi: string) =>
        ctx.admin.rpc("log_admin_access", { p_user: user, p_workspace: ws, p_path: path, p_aksi: aksi });

      expect((await log(superAdmin.id, wsA, "/w/a/inbox", "lihat")).data).toBe(true);
      expect((await log(superAdmin.id, wsA, "/w/a/inbox", "lihat")).data).toBe(false);
      expect((await log(superAdmin.id, wsA, "/w/a/inbox", "aksi")).data).toBe(true);
      // Bukan Super Admin atau anggota workspace: tidak dicatat.
      expect((await log(ownerA.id, wsA, "/w/a/inbox", "lihat")).data).toBe(false);
      expect((await log(ownerA.id, wsB, "/w/b/inbox", "lihat")).data).toBe(false);
    });

    it("hanya Super Admin yang bisa membaca; tidak ada user yang bisa menulis atau menghapus", async () => {
      const own = await superAdmin.client.from("admin_access_log").select("id, aksi").eq("workspace_id", wsA);
      expect(own.data).toHaveLength(2);

      for (const user of [ownerA, csA, ownerB]) {
        const { data } = await user.client.from("admin_access_log").select("id").eq("workspace_id", wsA);
        expect(data ?? []).toHaveLength(0);
        const insert = await user.client
          .from("admin_access_log")
          .insert({ user_email: "x@x", workspace_slug: "x", path: "/", aksi: "lihat" });
        expect(insert.error).not.toBeNull();
      }
      const del = await superAdmin.client.from("admin_access_log").delete().eq("workspace_id", wsA).select("id");
      expect(del.data ?? []).toHaveLength(0);
      const upd = await superAdmin.client.from("admin_access_log").update({ path: "/x" }).eq("workspace_id", wsA).select("id");
      expect(upd.data ?? []).toHaveLength(0);
    });

    it("fungsi log tidak bisa dipanggil user biasa", async () => {
      const { error } = await ownerA.client.rpc("log_admin_access", {
        p_user: superAdmin.id,
        p_workspace: wsB,
        p_path: "/",
        p_aksi: "lihat",
      });
      expect(error).not.toBeNull();
    });
  });

  describe("page_visits", () => {
    it("mencatat anggota sekali per 30 menit dan menolak bukan anggota", async () => {
      const visit = (user: string, ws: string) =>
        ctx.admin.rpc("log_page_visit", { p_user: user, p_workspace: ws, p_halaman: "dashboard" });
      expect((await visit(ownerA.id, wsA)).data).toBe(true);
      expect((await visit(ownerA.id, wsA)).data).toBe(false);
      expect((await visit(ownerB.id, wsA)).data).toBe(false);
      expect((await visit(superAdmin.id, wsA)).data).toBe(false);
    });

    it("user hanya melihat kunjungannya sendiri; Super Admin melihat semua; tidak ada yang bisa menulis", async () => {
      expect((await ownerA.client.from("page_visits").select("id").eq("workspace_id", wsA)).data).toHaveLength(1);
      expect((await csA.client.from("page_visits").select("id").eq("workspace_id", wsA)).data ?? []).toHaveLength(0);
      expect((await ownerB.client.from("page_visits").select("id").eq("workspace_id", wsA)).data ?? []).toHaveLength(0);
      expect((await superAdmin.client.from("page_visits").select("id").eq("workspace_id", wsA)).data).toHaveLength(1);

      const insert = await ownerA.client.from("page_visits").insert({ workspace_id: wsA, user_id: ownerA.id, halaman: "dashboard" });
      expect(insert.error).not.toBeNull();
      const { error } = await ownerA.client.rpc("log_page_visit", {
        p_user: ownerA.id,
        p_workspace: wsA,
        p_halaman: "dashboard",
      });
      expect(error).not.toBeNull();
    });
  });

  describe("ops_alerts", () => {
    it("satu alert terbuka per jenis; berulang menambah jumlah; resolve menutup", async () => {
      const raise = () => ctx.admin.rpc("raise_ops_alert", { p_jenis: alertJenis, p_judul: "Uji", p_detail: "detail" });
      const first = await raise();
      expect(first.error).toBeNull();
      expect(first.data?.[0]?.baru).toBe(true);
      const second = await raise();
      expect(second.data?.[0]?.baru).toBe(false);
      expect(second.data?.[0]?.id).toBe(first.data?.[0]?.id);

      const { data: row } = await ctx.admin.from("ops_alerts").select("jumlah").eq("jenis", alertJenis).single();
      expect(row?.jumlah).toBe(2);

      expect((await superAdmin.client.from("ops_alerts").select("id").eq("jenis", alertJenis)).data).toHaveLength(1);
      expect((await ownerA.client.from("ops_alerts").select("id").eq("jenis", alertJenis)).data ?? []).toHaveLength(0);

      expect((await ctx.admin.rpc("resolve_ops_alert", { p_jenis: alertJenis })).data).toBe(1);
      expect((await raise()).data?.[0]?.baru).toBe(true);
    });
  });

  describe("pilot_metrics", () => {
    it("menghitung pesan webhook vs tersimpan, Closing/Lost, referral, dan kunjungan", async () => {
      const phoneNumberId = `9${Date.now()}`;
      const { data: number, error: numberError } = await ctx.admin
        .from("wa_numbers")
        .insert({ workspace_id: wsA, phone_number_id: phoneNumberId, waba_id: "123456", label: "Uji metrik" })
        .select("id")
        .single();
      if (numberError) throw numberError;

      const { data: contact, error: contactError } = await ctx.admin
        .from("contacts")
        .insert({ workspace_id: wsA, nomor_hp: "628111000111" })
        .select("id")
        .single();
      if (contactError) throw contactError;
      const storedId = `wamid.uji-${ctx.run}-1`;
      const { error: msgError } = await ctx.admin.from("messages").insert({
        workspace_id: wsA,
        contact_id: contact.id,
        wa_number_id: number.id,
        wa_message_id: storedId,
        arah: "masuk",
        tipe: "text",
        isi: "halo",
        dikirim_pada: new Date().toISOString(),
      });
      if (msgError) throw msgError;
      const { error: dealError } = await ctx.admin
        .from("deals")
        .insert({ workspace_id: wsA, contact_id: contact.id, status: "lost", alasan_lost: "harga", oleh_user: ownerA.id });
      if (dealError) throw dealError;

      const ts = String(Math.floor(Date.now() / 1000));
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "123456",
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: phoneNumberId },
                  messages: [
                    { id: storedId, from: "628111000111", timestamp: ts, type: "text", referral: { source_id: "ad-1" } },
                    { id: `wamid.uji-${ctx.run}-2`, from: "628111000222", timestamp: ts, type: "text", referral: {} },
                    { id: `wamid.uji-${ctx.run}-3`, from: "628111000222", timestamp: ts, type: "system" },
                  ],
                },
              },
            ],
          },
        ],
      };
      // diproses=true supaya tidak diambil pemrosesan produksi.
      const { data: event, error: eventError } = await ctx.admin
        .from("webhook_events")
        .insert({ sumber: "uji", payload_mentah: payload, diproses: true })
        .select("id")
        .single();
      if (eventError) throw eventError;
      webhookIds.push(event.id);

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
      const { data, error } = await ctx.admin.rpc("pilot_metrics", { ws: wsA, dari: today, sampai: today });
      expect(error).toBeNull();
      expect(data.mirror).toMatchObject({ dikirim_meta: 2, tersimpan: 1, event_total: 1, event_belum_diproses: 0 });
      expect(data.closing).toMatchObject({ kontak: 1, ditandai: 1, closing: 0, lost: 1 });
      expect(data.ctwa).toMatchObject({ pelanggan_referral: 2, pelanggan_referral_dengan_id: 1, percakapan_meta: 0 });
      const owner = data.kunjungan.find((k: { user_id: string }) => k.user_id === ownerA.id);
      expect(owner).toMatchObject({ peran: "owner", kunjungan: 1 });
      expect(data.kunjungan.find((k: { user_id: string }) => k.user_id === csA.id)).toBeUndefined();

      // Hanya service_role.
      const denied = await ownerA.client.rpc("pilot_metrics", { ws: wsA, dari: today, sampai: today });
      expect(denied.error).not.toBeNull();
    });
  });
});
