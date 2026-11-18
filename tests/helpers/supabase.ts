import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Bantuan untuk test integrasi terhadap project Supabase dev (.env.local).
// Setiap pemakai membuat data sendiri dan wajib memanggil cleanup().

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

export const supabaseEnabled = Boolean(url && publishableKey && secretKey && !secretKey.includes("xxx"));

export type TestUser = { id: string; email: string; client: SupabaseClient };

export function createTestContext(prefix: string) {
  const run = randomUUID().slice(0, 8);
  const admin = createClient(url!, secretKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const userIds: string[] = [];
  const workspaceIds: string[] = [];

  return {
    run,
    admin,
    anon: () => createClient(url!, publishableKey!, { auth: { persistSession: false } }),

    async user(label: string): Promise<TestUser> {
      const email = `${prefix}-${run}-${label}@connectiv.test`;
      const password = randomBytes(18).toString("base64url");
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw error ?? new Error("createUser gagal");
      userIds.push(data.user.id);
      const client = createClient(url!, publishableKey!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      return { id: data.user.id, email, client };
    },

    async workspace(label: string): Promise<string> {
      const { data, error } = await admin
        .from("workspaces")
        .insert({ nama: `${prefix} ${label} ${run}`, slug: `${prefix}-${label}-${run}` })
        .select("id")
        .single();
      if (error) throw error;
      workspaceIds.push(data.id);
      return data.id;
    },

    async member(user: TestUser, workspaceId: string, peran: "owner" | "supervisor" | "cs") {
      const { error } = await admin.from("memberships").insert({ user_id: user.id, workspace_id: workspaceId, peran });
      if (error) throw error;
    },

    async cleanup() {
      if (workspaceIds.length) await admin.from("workspaces").delete().in("id", workspaceIds);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    },
  };
}
