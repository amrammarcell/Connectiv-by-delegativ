import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, supabaseEnabled, type TestUser } from "../helpers/supabase";

// Catatan kontak, urutan stage, dan batas peran di pipeline (project dev).

describe.skipIf(!supabaseEnabled)("RLS: catatan kontak dan stage", { timeout: 60_000 }, () => {
  const ctx = supabaseEnabled ? createTestContext("pipeline") : (null as never);
  let ws: string;
  let wsOther: string;
  let owner: TestUser;
  let supervisor: TestUser;
  let cs1: TestUser;
  let cs2: TestUser;
  let outsiderOwner: TestUser;
  let contactCs1: string;

  async function stageIds(workspaceId = ws) {
    const { data } = await ctx.admin.from("stages").select("id, nama, tipe, urutan").eq("workspace_id", workspaceId).order("urutan");
    return data!;
  }

  beforeAll(async () => {
    [ws, wsOther] = await Promise.all([ctx.workspace("a"), ctx.workspace("b")]);
    [owner, supervisor, cs1, cs2, outsiderOwner] = await Promise.all([
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
      ctx.member(outsiderOwner, wsOther, "owner"),
    ]);
    const stages = await stageIds();
    const { data, error } = await ctx.admin
      .from("contacts")
      .insert({ workspace_id: ws, nomor_hp: "6281200000201", nama: "Kontak CS1", assigned_to: cs1.id, stage_id: stages[0]!.id })
      .select("id")
      .single();
    if (error) throw error;
    contactCs1 = data.id;
  });

  afterAll(async () => {
    if (supabaseEnabled) await ctx.cleanup();
  });

  describe("catatan internal", () => {
    it("CS pemilik kontak bisa menambah catatan dan Supervisor bisa membacanya", async () => {
      const { error } = await cs1.client
        .from("contact_notes")
        .insert({ workspace_id: ws, contact_id: contactCs1, isi: "Minta katalog", oleh_user: cs1.id });
      expect(error).toBeNull();
      const { data } = await supervisor.client.from("contact_notes").select("isi").eq("contact_id", contactCs1);
      expect(data?.map((n) => n.isi)).toEqual(["Minta katalog"]);
    });

    it("CS lain tidak bisa membaca atau menambah catatan kontak yang bukan miliknya", async () => {
      const read = await cs2.client.from("contact_notes").select("id").eq("contact_id", contactCs1);
      expect(read.data).toEqual([]);
      const write = await cs2.client
        .from("contact_notes")
        .insert({ workspace_id: ws, contact_id: contactCs1, isi: "susupan", oleh_user: cs2.id });
      expect(write.error).not.toBeNull();
    });

    it("tidak bisa menulis catatan atas nama orang lain atau dari workspace lain", async () => {
      const impersonate = await cs1.client
        .from("contact_notes")
        .insert({ workspace_id: ws, contact_id: contactCs1, isi: "palsu", oleh_user: owner.id });
      expect(impersonate.error).not.toBeNull();
      const otherWs = await outsiderOwner.client
        .from("contact_notes")
        .insert({ workspace_id: wsOther, contact_id: contactCs1, isi: "lintas", oleh_user: outsiderOwner.id });
      expect(otherWs.error).not.toBeNull();
    });

    it("catatan tidak bisa diedit, hanya dihapus oleh penulis atau Owner", async () => {
      const { data: note } = await ctx.admin.from("contact_notes").select("id").eq("contact_id", contactCs1).single();
      const edit = await cs1.client.from("contact_notes").update({ isi: "ubah" }).eq("id", note!.id).select("id");
      expect(edit.error ?? edit.data?.length === 0).toBeTruthy();
      const bySupervisor = await supervisor.client.from("contact_notes").delete().eq("id", note!.id).select("id");
      expect(bySupervisor.data ?? []).toEqual([]);
      const byOwner = await owner.client.from("contact_notes").delete().eq("id", note!.id).select("id");
      expect(byOwner.data).toHaveLength(1);
    });
  });

  describe("stage", () => {
    it("Owner bisa mengurutkan ulang stage normal; Closing dan Lost tetap di akhir", async () => {
      const before = await stageIds();
      const normal = before.filter((s) => s.tipe === "normal").map((s) => s.id);
      const reversed = [...normal].reverse();
      const { error } = await owner.client.rpc("reorder_stages", { ws, stage_ids: reversed });
      expect(error).toBeNull();
      const after = await stageIds();
      expect(after.map((s) => s.id)).toEqual([...reversed, ...before.filter((s) => s.tipe !== "normal").map((s) => s.id)]);
      expect(after.slice(-2).map((s) => s.tipe)).toEqual(["closing", "lost"]);
    });

    it("daftar stage yang tidak lengkap atau milik workspace lain ditolak", async () => {
      const normal = (await stageIds()).filter((s) => s.tipe === "normal").map((s) => s.id);
      const partial = await owner.client.rpc("reorder_stages", { ws, stage_ids: normal.slice(1) });
      expect(partial.error).not.toBeNull();
      const foreign = (await stageIds(wsOther)).filter((s) => s.tipe === "normal").map((s) => s.id);
      const mixed = await owner.client.rpc("reorder_stages", { ws, stage_ids: [...normal.slice(1), foreign[0]] });
      expect(mixed.error).not.toBeNull();
    });

    it("Supervisor dan CS tidak bisa mengurutkan atau mengganti nama stage", async () => {
      const stages = await stageIds();
      const normal = stages.filter((s) => s.tipe === "normal").map((s) => s.id);
      for (const user of [supervisor, cs1]) {
        const reorder = await user.client.rpc("reorder_stages", { ws, stage_ids: normal });
        expect(reorder.error).not.toBeNull();
        const rename = await user.client.from("stages").update({ nama: "X" }).eq("id", stages[0]!.id).select("id");
        expect(rename.data ?? []).toEqual([]);
      }
    });

    it("Owner bisa mengganti nama stage tetapi tidak bisa mengubah tipenya", async () => {
      const stages = await stageIds();
      const rename = await owner.client.from("stages").update({ nama: "Prospek" }).eq("id", stages[0]!.id).select("nama");
      expect(rename.data?.[0]?.nama).toBe("Prospek");
      const retype = await owner.client.from("stages").update({ tipe: "closing" }).eq("id", stages[0]!.id);
      expect(retype.error).not.toBeNull();
    });
  });

  describe("assign", () => {
    it("Supervisor bisa assign kontak ke CS lain; CS tidak bisa", async () => {
      const bySupervisor = await supervisor.client.from("contacts").update({ assigned_to: cs2.id }).eq("id", contactCs1).select("id");
      expect(bySupervisor.data).toHaveLength(1);
      // Sekarang milik cs2: cs1 tidak lagi melihatnya.
      const lost = await cs1.client.from("contacts").select("id").eq("id", contactCs1);
      expect(lost.data).toEqual([]);
      const byCs = await cs2.client.from("contacts").update({ assigned_to: cs1.id }).eq("id", contactCs1).select("id");
      expect(byCs.error ?? byCs.data?.length === 0).toBeTruthy();
    });
  });
});
