import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Membuktikan isolasi antar workspace dan batas peran langsung di database,
// memakai project Supabase dev. Setiap run membuat data sendiri lalu
// menghapusnya. Dilewati jika kunci Supabase tidak tersedia (misalnya di CI).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const enabled = Boolean(url && publishableKey && secretKey && !secretKey.includes("xxx"));

type TestUser = { id: string; email: string; client: SupabaseClient };

describe.skipIf(!enabled)("RLS: isolasi workspace", { timeout: 60_000 }, () => {
  const run = randomUUID().slice(0, 8);
  const admin = enabled
    ? createClient(url!, secretKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    : (null as unknown as SupabaseClient);

  let wsA: string;
  let wsB: string;
  let ownerA: TestUser;
  let supervisorA: TestUser;
  let csA: TestUser;
  let ownerB: TestUser;
  let outsider: TestUser;
  const createdUsers: string[] = [];

  async function makeUser(label: string): Promise<TestUser> {
    const email = `rls-${run}-${label}@connectiv.test`;
    const password = randomBytes(18).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser gagal");
    createdUsers.push(data.user.id);

    const client = createClient(url!, publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    return { id: data.user.id, email, client };
  }

  async function makeWorkspace(label: string): Promise<string> {
    const { data, error } = await admin
      .from("workspaces")
      .insert({ nama: `RLS ${label} ${run}`, slug: `rls-${label}-${run}` })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async function addMember(user: TestUser, workspaceId: string, peran: string) {
    const { error } = await admin.from("memberships").insert({ user_id: user.id, workspace_id: workspaceId, peran });
    if (error) throw error;
  }

  beforeAll(async () => {
    [wsA, wsB] = await Promise.all([makeWorkspace("a"), makeWorkspace("b")]);
    [ownerA, supervisorA, csA, ownerB, outsider] = await Promise.all([
      makeUser("owner-a"),
      makeUser("supervisor-a"),
      makeUser("cs-a"),
      makeUser("owner-b"),
      makeUser("outsider"),
    ]);
    await Promise.all([
      addMember(ownerA, wsA, "owner"),
      addMember(supervisorA, wsA, "supervisor"),
      addMember(csA, wsA, "cs"),
      addMember(ownerB, wsB, "owner"),
    ]);
  });

  afterAll(async () => {
    if (!enabled) return;
    await admin.from("workspaces").delete().in("id", [wsA, wsB].filter(Boolean));
    await Promise.all(createdUsers.map((id) => admin.auth.admin.deleteUser(id)));
  });

  describe("antar workspace", () => {
    it("anggota hanya melihat workspace-nya sendiri", async () => {
      const { data } = await ownerA.client.from("workspaces").select("id").in("id", [wsA, wsB]);
      expect(data?.map((w) => w.id)).toEqual([wsA]);
    });

    it("tidak melihat stage, anggota, maupun profil workspace lain", async () => {
      const stages = await ownerA.client.from("stages").select("id").eq("workspace_id", wsB);
      const members = await ownerA.client.from("memberships").select("user_id").eq("workspace_id", wsB);
      const profile = await ownerA.client.from("profiles").select("id").eq("id", ownerB.id);
      expect(stages.data).toEqual([]);
      expect(members.data).toEqual([]);
      expect(profile.data).toEqual([]);
    });

    it("tidak bisa mengubah workspace lain", async () => {
      const { data } = await ownerA.client.from("workspaces").update({ nama: "dibajak" }).eq("id", wsB).select("id");
      expect(data ?? []).toEqual([]);
      const { data: check } = await admin.from("workspaces").select("nama").eq("id", wsB).single();
      expect(check?.nama).not.toBe("dibajak");
    });

    it("tidak bisa menambahkan diri ke workspace lain", async () => {
      const { error } = await ownerA.client
        .from("memberships")
        .insert({ user_id: ownerA.id, workspace_id: wsB, peran: "owner" });
      expect(error).not.toBeNull();
    });

    it("tidak bisa menambah stage di workspace lain", async () => {
      const { error } = await ownerA.client
        .from("stages")
        .insert({ workspace_id: wsB, nama: "Susupan", urutan: 99 });
      expect(error).not.toBeNull();
    });

    it("user tanpa workspace dan pengunjung anonim tidak melihat apa pun", async () => {
      const anon = createClient(url!, publishableKey!, { auth: { persistSession: false } });
      for (const client of [outsider.client, anon]) {
        const { data } = await client.from("workspaces").select("id").in("id", [wsA, wsB]);
        expect(data ?? []).toEqual([]);
        const { data: stages } = await client.from("stages").select("id").in("workspace_id", [wsA, wsB]);
        expect(stages ?? []).toEqual([]);
      }
    });

    it("tidak bisa membuat workspace sendiri", async () => {
      const { error } = await outsider.client.from("workspaces").insert({ nama: "Liar", slug: `liar-${run}` });
      expect(error).not.toBeNull();
    });
  });

  describe("stage default", () => {
    it("workspace baru otomatis punya 6 stage dengan satu Closing dan satu Lost", async () => {
      const { data } = await ownerA.client
        .from("stages")
        .select("nama, urutan, tipe")
        .eq("workspace_id", wsA)
        .order("urutan");
      expect(data?.map((s) => s.nama)).toEqual(["Baru", "Dihubungi", "Tertarik", "Negosiasi", "Closing", "Lost"]);
      expect(data?.filter((s) => s.tipe === "closing")).toHaveLength(1);
      expect(data?.filter((s) => s.tipe === "lost")).toHaveLength(1);
    });
  });

  describe("peran di dalam workspace", () => {
    it("CS hanya melihat keanggotaannya sendiri", async () => {
      const { data } = await csA.client.from("memberships").select("user_id").eq("workspace_id", wsA);
      expect(data?.map((m) => m.user_id)).toEqual([csA.id]);
    });

    it("Supervisor melihat semua anggota tetapi tidak bisa menambah anggota", async () => {
      const { data } = await supervisorA.client.from("memberships").select("user_id").eq("workspace_id", wsA);
      expect(data).toHaveLength(3);
      const { error } = await supervisorA.client
        .from("memberships")
        .insert({ user_id: outsider.id, workspace_id: wsA, peran: "cs" });
      expect(error).not.toBeNull();
    });

    it("CS dan Supervisor tidak bisa mengubah pengaturan workspace atau stage", async () => {
      for (const user of [csA, supervisorA]) {
        const { data } = await user.client.from("workspaces").update({ batas_kuning_menit: 1 }).eq("id", wsA).select("id");
        expect(data ?? []).toEqual([]);
        const { data: stage } = await user.client.from("stages").update({ nama: "X" }).eq("workspace_id", wsA).select("id");
        expect(stage ?? []).toEqual([]);
      }
    });

    it("CS tidak bisa menaikkan perannya sendiri", async () => {
      const { data } = await csA.client
        .from("memberships")
        .update({ peran: "owner" })
        .eq("workspace_id", wsA)
        .eq("user_id", csA.id)
        .select("user_id");
      expect(data ?? []).toEqual([]);
    });

    it("Owner bisa mengubah peran anggota lain, tetapi tidak perannya sendiri", async () => {
      const promoted = await ownerA.client
        .from("memberships")
        .update({ peran: "supervisor" })
        .eq("workspace_id", wsA)
        .eq("user_id", csA.id)
        .select("user_id");
      expect(promoted.data).toHaveLength(1);
      await admin.from("memberships").update({ peran: "cs" }).eq("workspace_id", wsA).eq("user_id", csA.id);

      const self = await ownerA.client
        .from("memberships")
        .update({ peran: "cs" })
        .eq("workspace_id", wsA)
        .eq("user_id", ownerA.id)
        .select("user_id");
      expect(self.data ?? []).toEqual([]);
    });

    it("Owner tidak bisa mengubah slug workspace", async () => {
      const { error } = await ownerA.client.from("workspaces").update({ slug: `ganti-${run}` }).eq("id", wsA);
      expect(error).not.toBeNull();
    });

    it("Owner bisa menambah anggota baru ke workspace-nya", async () => {
      const { error } = await ownerA.client
        .from("memberships")
        .insert({ user_id: outsider.id, workspace_id: wsA, peran: "cs" });
      expect(error).toBeNull();
      await admin.from("memberships").delete().eq("workspace_id", wsA).eq("user_id", outsider.id);
    });
  });

  describe("profil", () => {
    it("user tidak bisa menjadikan dirinya Super Admin", async () => {
      const { error } = await csA.client.from("profiles").update({ is_super_admin: true }).eq("id", csA.id);
      expect(error).not.toBeNull();
      const { data } = await admin.from("profiles").select("is_super_admin").eq("id", csA.id).single();
      expect(data?.is_super_admin).toBe(false);
    });

    it("user bisa mengubah namanya sendiri, tetapi tidak nama orang lain", async () => {
      const own = await csA.client.from("profiles").update({ nama: "CS Satu" }).eq("id", csA.id).select("id");
      expect(own.data).toHaveLength(1);
      const other = await csA.client.from("profiles").update({ nama: "Dibajak" }).eq("id", ownerA.id).select("id");
      expect(other.data ?? []).toEqual([]);
    });

    it("anggota melihat profil rekan satu workspace", async () => {
      const { data } = await csA.client.from("profiles").select("id").in("id", [ownerA.id, supervisorA.id]);
      expect(data).toHaveLength(2);
    });
  });
});
