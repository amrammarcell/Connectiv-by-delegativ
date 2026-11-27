import { afterAll, describe, expect, it } from "vitest";
import { purgeOldRecords } from "@/lib/retention";
import { createTestContext, supabaseEnabled } from "./helpers/supabase";

// Test integrasi retensi terhadap project Supabase dev. Project ini juga
// dipakai produksi, jadi data uji bertanggal 2020 dan `now` digeser ke 2020:
// batas hapus (16 Jan 2020) jauh sebelum data nyata mana pun.

describe.skipIf(!supabaseEnabled)("retensi 90 hari", { timeout: 60_000 }, () => {
  const ctx = supabaseEnabled ? createTestContext("retensi") : (null as never);
  const webhookIds: string[] = [];

  afterAll(async () => {
    if (!supabaseEnabled) return;
    if (webhookIds.length) await ctx.admin.from("webhook_events").delete().in("id", webhookIds);
    await ctx.cleanup();
  });

  it("menghapus webhook_events yang sudah diproses dan sync_runs lebih tua dari 90 hari, tidak yang belum diproses", async () => {
    const payload = { object: "whatsapp_business_account", entry: [] };
    const { data: events, error } = await ctx.admin
      .from("webhook_events")
      .insert([
        { sumber: "uji", payload_mentah: payload, diproses: true, diterima_pada: "2020-01-01T00:00:00Z" },
        // Belum diproses: tidak pernah dihapus otomatis. signature_valid=false
        // supaya tidak diambil processPendingEvents produksi selama test.
        { sumber: "uji", payload_mentah: payload, diproses: false, signature_valid: false, diterima_pada: "2020-01-01T00:00:00Z" },
        { sumber: "uji", payload_mentah: payload, diproses: true, diterima_pada: "2020-03-15T00:00:00Z" },
      ])
      .select("id");
    if (error) throw error;
    webhookIds.push(...events.map((e) => e.id));

    const ws = await ctx.workspace("a");
    const { data: runs, error: runError } = await ctx.admin
      .from("sync_runs")
      .insert([
        { workspace_id: ws, mulai: "2020-01-01T00:00:00Z", status: "ok" },
        { workspace_id: ws, mulai: "2020-03-15T00:00:00Z", status: "ok" },
      ])
      .select("id");
    if (runError) throw runError;

    const result = await purgeOldRecords(ctx.admin, { now: new Date("2020-04-15T00:00:00Z") });
    expect(result).toEqual({ webhookEvents: 1, syncRuns: 1, cutoff: "2020-01-16T00:00:00.000Z" });

    const { data: leftEvents } = await ctx.admin.from("webhook_events").select("id").in("id", webhookIds);
    expect(leftEvents!.map((e) => e.id).sort()).toEqual([webhookIds[1], webhookIds[2]].sort());
    const { data: leftRuns } = await ctx.admin.from("sync_runs").select("id").in("id", runs.map((r) => r.id));
    expect(leftRuns!.map((r) => r.id)).toEqual([runs[1]!.id]);
  });
});
