// Membuat workspace "demo" dan akun QA (Owner + CS) di project Supabase dev.
// Pakai: npm run seed:dev
// Kredensial QA ditulis ke .qa-credentials.json (diabaikan Git). Jangan
// jalankan terhadap project produksi.

import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY harus ada di .env.local");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });

let { data: ws } = await admin.from("workspaces").select("id").eq("slug", "demo").maybeSingle();
if (!ws) {
  const created = await admin.from("workspaces").insert({ nama: "Butik Aisyah (Demo)", slug: "demo" }).select("id").single();
  if (created.error) throw created.error;
  ws = created.data;
}

const accounts: Record<string, { email: string; password: string; peran: string }> = {};
for (const [peran, nama] of [["owner", "QA Owner"], ["cs", "QA CS"]] as const) {
  const email = `qa-${peran}@connectiv.test`;
  const password = randomBytes(12).toString("base64url");
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();

  let userId = existing?.id as string | undefined;
  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nama },
    });
    if (error || !data.user) throw error;
    userId = data.user.id;
  }

  const { error } = await admin
    .from("memberships")
    .upsert({ user_id: userId, workspace_id: ws.id, peran }, { onConflict: "user_id,workspace_id" });
  if (error) throw error;
  accounts[peran] = { email, password, peran };
}

writeFileSync(".qa-credentials.json", JSON.stringify(accounts, null, 2));
console.log("Workspace /w/demo siap. Akun QA ditulis ke .qa-credentials.json");
