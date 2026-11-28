import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, supabaseEnabled, type TestUser } from "../helpers/supabase";

// Mengunci semantik policy yang ditulis ulang di migrasi
// 20261128140000_perf_indexes_rls.sql (pola evaluasi sekali per query):
// visibilitas kontak per peran beserta tabel turunannya, nomor WA, data iklan,
// profil, dan Super Admin yang bukan anggota. Melengkapi workspace-isolation,
// pipeline, deals, dan dashboard.

describe.skipIf(!supabaseEnabled)("RLS: policy per peran", { timeout: 90_000 }, () => {
  const ctx = supabaseEnabled ? createTestContext("policy") : (null as never);
  let ws: string;
  let wsOther: string;
  let owner: TestUser;
  let supervisor: TestUser;
  let cs1: TestUser;
  let cs2: TestUser;
  let ownerOther: TestUser;
  let superAdmin: TestUser;
  let contactCs1: string;
  let contactUnassigned: string;
  let contactOther: string;

  beforeAll(async () => {
    [ws, wsOther] = await Promise.all([ctx.workspace("a"), ctx.workspace("b")]);
    [owner, supervisor, cs1, cs2, ownerOther, superAdmin] = await Promise.all([
      ctx.user("owner"),
      ctx.user("supervisor"),
      ctx.user("cs1"),
      ctx.user("cs2"),
      ctx.user("owner-b"),
      ctx.user("super"),
    ]);
    await Promise.all([
      ctx.member(owner, ws, "owner"),
      ctx.member(supervisor, ws, "supervisor"),
      ctx.member(cs1, ws, "cs"),
      ctx.member(cs2, ws, "cs"),
      ctx.member(ownerOther, wsOther, "owner"),
    ]);
    const { error: saError } = await ctx.admin.from("profiles").update({ is_super_admin: true }).eq("id", superAdmin.id);
    if (saError) throw saError;

    const rand = String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
    const { data: contacts, error } = await ctx.admin
      .from("contacts")
      .insert([
        { workspace_id: ws, nomor_hp: `62899${rand}01`, assigned_to: cs1.id },
        { workspace_id: ws, nomor_hp: `62899${rand}02` },
        { workspace_id: wsOther, nomor_hp: `62899${rand}03` },
      ])
      .select("id");
    if (error) throw error;
    [contactCs1, contactUnassigned, contactOther] = contacts.map((c) => c.id);

    const { error: msgError } = await ctx.admin.from("messages").insert(
      [contactCs1, contactUnassigned, contactOther].map((contactId, i) => ({
        workspace_id: i === 2 ? wsOther : ws,
        contact_id: contactId,
        wa_message_id: `wamid.policy.${ctx.run}.${i}`,
        arah: "masuk",
        tipe: "text",
        isi: "halo",
        dikirim_pada: new Date().toISOString(),
      })),
    );
    if (msgError) throw msgError;

    const { error: waError } = await ctx.admin.from("wa_numbers").insert([
      { workspace_id: ws, phone_number_id: `9${Date.now()}1`, waba_id: "1", label: "Nomor A" },
      { workspace_id: wsOther, phone_number_id: `9${Date.now()}2`, waba_id: "1", label: "Nomor B" },
    ]);
    if (waError) throw waError;

    const { error: adError } = await ctx.admin
      .from("ad_accounts")
      .insert({ workspace_id: ws, meta_ad_account_id: `act_${Date.now()}` });
    if (adError) throw adError;
  });

  afterAll(async () => {
    if (supabaseEnabled) await ctx.cleanup();
  });

  async function visibleContacts(user: TestUser) {
    const { data, error } = await user.client.from("contacts").select("id").in("id", [contactCs1, contactUnassigned, contactOther]);
    expect(error).toBeNull();
    return (data ?? []).map((c) => c.id).sort();
  }

  async function visibleMessages(user: TestUser) {
    const { data, error } = await user.client
      .from("messages")
      .select("contact_id")
      .in("contact_id", [contactCs1, contactUnassigned, contactOther]);
    expect(error).toBeNull();
    return (data ?? []).map((m) => m.contact_id).sort();
  }

  describe("kontak dan pesan", () => {
    it("Owner dan Supervisor melihat semua kontak dan pesan di workspace-nya saja", async () => {
      const expected = [contactCs1, contactUnassigned].sort();
      for (const user of [owner, supervisor]) {
        expect(await visibleContacts(user)).toEqual(expected);
        expect(await visibleMessages(user)).toEqual(expected);
      }
    });

    it("CS hanya melihat kontak yang di-assign kepadanya beserta pesannya", async () => {
      expect(await visibleContacts(cs1)).toEqual([contactCs1]);
      expect(await visibleMessages(cs1)).toEqual([contactCs1]);
      expect(await visibleContacts(cs2)).toEqual([]);
      expect(await visibleMessages(cs2)).toEqual([]);
    });

    it("Owner workspace lain tidak melihat apa pun dari workspace ini", async () => {
      expect(await visibleContacts(ownerOther)).toEqual([contactOther]);
      expect(await visibleMessages(ownerOther)).toEqual([contactOther]);
    });

    it("Super Admin yang bukan anggota melihat semua kontak", async () => {
      expect(await visibleContacts(superAdmin)).toEqual([contactCs1, contactUnassigned, contactOther].sort());
    });

    it("CS tidak bisa memindahkan kontaknya ke CS lain atau mengubah kontak orang lain", async () => {
      const handOff = await cs1.client.from("contacts").update({ assigned_to: cs2.id }).eq("id", contactCs1).select("id");
      expect(handOff.error).not.toBeNull();
      const other = await cs2.client.from("contacts").update({ nama: "Dibajak" }).eq("id", contactCs1).select("id");
      expect(other.data ?? []).toEqual([]);
      const own = await cs1.client.from("contacts").update({ nama: "Pelanggan" }).eq("id", contactCs1).select("id");
      expect(own.data).toHaveLength(1);
    });

    it("Supervisor bisa mengubah kontak siapa pun di workspace-nya, tidak di workspace lain", async () => {
      const mine = await supervisor.client.from("contacts").update({ assigned_to: cs2.id }).eq("id", contactUnassigned).select("id");
      expect(mine.data).toHaveLength(1);
      const other = await supervisor.client.from("contacts").update({ nama: "X" }).eq("id", contactOther).select("id");
      expect(other.data ?? []).toEqual([]);
      await ctx.admin.from("contacts").update({ assigned_to: null }).eq("id", contactUnassigned);
    });
  });

  describe("nomor WA dan data iklan", () => {
    it("semua anggota melihat nomor WA workspace-nya saja; non-Owner tidak bisa mengubahnya", async () => {
      for (const user of [owner, supervisor, cs1]) {
        const { data } = await user.client.from("wa_numbers").select("label").in("workspace_id", [ws, wsOther]);
        expect(data?.map((n) => n.label)).toEqual(["Nomor A"]);
      }
      const { data } = await supervisor.client.from("wa_numbers").update({ label: "Ganti" }).eq("workspace_id", ws).select("id");
      expect(data ?? []).toEqual([]);
    });

    it("akun iklan terlihat oleh Owner dan Supervisor, tidak oleh CS atau workspace lain", async () => {
      for (const [user, count] of [
        [owner, 1],
        [supervisor, 1],
        [cs1, 0],
        [ownerOther, 0],
      ] as const) {
        const { data } = await user.client.from("ad_accounts").select("id").eq("workspace_id", ws);
        expect(data ?? []).toHaveLength(count);
      }
    });
  });

  describe("profil dan keanggotaan", () => {
    it("profil hanya terlihat untuk rekan satu workspace", async () => {
      const { data } = await cs1.client.from("profiles").select("id").in("id", [owner.id, cs2.id, ownerOther.id]);
      expect(data?.map((p) => p.id).sort()).toEqual([owner.id, cs2.id].sort());
    });

    it("Super Admin yang bukan anggota melihat semua keanggotaan dan workspace", async () => {
      const { data: members } = await superAdmin.client.from("memberships").select("user_id").in("workspace_id", [ws, wsOther]);
      expect(members).toHaveLength(5);
      const { data: workspaces } = await superAdmin.client.from("workspaces").select("id").in("id", [ws, wsOther]);
      expect(workspaces).toHaveLength(2);
    });
  });

  describe("laporan ukuran database", () => {
    it("hanya Super Admin yang bisa memanggil db_size_report", async (test) => {
      const res = await superAdmin.client.rpc("db_size_report");
      // Migrasi belum diterapkan ke project dev.
      if (res.error?.code === "PGRST202") test.skip();
      expect(res.error).toBeNull();
      expect(res.data?.[0]?.nama).toBe("(database)");
      expect(res.data?.some((r: { nama: string }) => r.nama === "messages")).toBe(true);

      const denied = await owner.client.rpc("db_size_report");
      expect(denied.error).not.toBeNull();
    });
  });
});
